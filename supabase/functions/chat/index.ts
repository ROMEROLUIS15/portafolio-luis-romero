// Supabase Edge Function: chat
// RAG pipeline: Supabase embeddings (gte-small, free) → pgvector → Groq LLM
// Requirements: 3.x, 4.x, 6.x, 8.x
//
// Pure logic lives in ./lib.ts so it can be unit-tested without a runtime.
// This file is the wiring: env, clients, I/O, orchestration.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import {
  BUSY_MESSAGE,
  CACHE_TTL_DAYS,
  FALLBACK,
  GroqRateLimitError,
  MAX_MESSAGE_LENGTH,
  RAG_MATCH_COUNT,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_S,
  buildAllowedOrigins,
  buildCorsHeaders,
  buildSystemPrompt,
  cacheKey,
  buildProviders,
  callLlmWithFallback,
  isOriginAllowed,
  isValidMessage,
  isValidUUIDv4,
  normalizeLang,
  sha256hex,
  shouldUseFallback,
  stripMarkdown,
  stripMetaPrefix,
  type ChunkResult,
  type Lang,
} from './lib.ts';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatRequest {
  message: string;
  lang: Lang;
}

interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number;
}

interface ChatResponse {
  answer: string;
  sources: string[];
}

interface ErrorResponse {
  error: string;
  retry_after?: number;
  max_length?: number;
}

// ─── Environment (read once at module load — not per request) ─────────────────

const ENV = {
  supabaseUrl:        Deno.env.get('SUPABASE_URL')              ?? '',
  supabaseAnonKey:    Deno.env.get('SUPABASE_ANON_KEY')         ?? '',
  supabaseServiceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  groqApiKey:         Deno.env.get('GROQ_API_KEY')              ?? '',
  cerebrasApiKey:     Deno.env.get('CEREBRAS_API_KEY')          ?? '',
  allowedOrigins:     Deno.env.get('ALLOWED_ORIGINS')           ?? '',
} as const;

// Ordered chain: Groq first, then whatever else has a key. Cerebras is optional
// — with no key set the chain is exactly what it was before, one provider.
const LLM_PROVIDERS = buildProviders({
  groq:     ENV.groqApiKey,
  cerebras: ENV.cerebrasApiKey,
});

// Fail fast at cold start if critical env vars are missing.
// `cerebrasApiKey` is deliberately not critical: it is the *second* provider, so
// its absence must leave the function exactly as it was, not kill it at boot.
// Listing it here without this exemption would take the agent down the moment
// this file deployed, which is the opposite of what a fallback is for.
const OPTIONAL_VARS = new Set(['cerebrasApiKey']);

const MISSING_VARS = Object.entries(ENV)
  .filter(([k, v]) => !v && !OPTIONAL_VARS.has(k))
  .map(([k]) => k);

if (MISSING_VARS.length > 0) {
  throw new Error(`[chat] Missing required env vars: ${MISSING_VARS.join(', ')}`);
}

// ─── Supabase clients (created once per module, reused across warm invocations)

const supabase      = createClient(ENV.supabaseUrl, ENV.supabaseAnonKey);
const supabaseAdmin = createClient(ENV.supabaseUrl, ENV.supabaseServiceKey);

const ALLOWED_ORIGINS = buildAllowedOrigins(ENV.allowedOrigins);

// ─── Helpers — pure response builders ────────────────────────────────────────

function jsonResponse(
  body: ChatResponse | ErrorResponse,
  status: number,
  corsHeaders: Record<string, string>
): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

// ─── Rate limiting ────────────────────────────────────────────────────────────

async function checkRateLimit(ip: string): Promise<RateLimitResult> {
  const now = new Date();

  const { data, error } = await supabaseAdmin
    .from('rate_limits')
    .select('count, window_start')
    .eq('ip', ip)
    .maybeSingle();

  if (error) {
    // Fail open on DB error — don't block legitimate users
    console.warn('[chat] rate_limits query failed:', error.message);
    return { allowed: true };
  }

  if (!data) {
    await supabaseAdmin
      .from('rate_limits')
      .insert({ ip, count: 1, window_start: now.toISOString() });
    return { allowed: true };
  }

  const elapsedSeconds = (now.getTime() - new Date(data.window_start).getTime()) / 1000;

  if (elapsedSeconds > RATE_LIMIT_WINDOW_S) {
    // Window expired — reset atomically
    await supabaseAdmin
      .from('rate_limits')
      .update({ count: 1, window_start: now.toISOString() })
      .eq('ip', ip);
    return { allowed: true };
  }

  if (data.count >= RATE_LIMIT_MAX) {
    return {
      allowed:    false,
      retryAfter: Math.ceil(RATE_LIMIT_WINDOW_S - elapsedSeconds),
    };
  }

  await supabaseAdmin
    .from('rate_limits')
    .update({ count: data.count + 1 })
    .eq('ip', ip);

  return { allowed: true };
}

// ─── Embeddings ───────────────────────────────────────────────────────────────

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch(`${ENV.supabaseUrl}/functions/v1/embed`, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${ENV.supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input: text }),
  });

  if (!response.ok) {
    throw new Error(`Supabase embed error: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return data.embedding as number[];
}

// ─── Vector search ────────────────────────────────────────────────────────────

async function retrieveChunks(embedding: number[], lang: Lang): Promise<ChunkResult[]> {
  const { data, error } = await supabase.rpc('match_documents', {
    query_embedding: embedding,
    query_lang:      lang,
    match_count:     RAG_MATCH_COUNT,
  });

  if (error) throw new Error(`match_documents RPC error: ${error.message}`);
  return (data ?? []) as ChunkResult[];
}

// ─── Logging (fire-and-forget, never blocks the response) ─────────────────────

async function logRequest(opts: {
  sessionToken:    string;
  lang:            Lang;
  message:         string;
  chunksRetrieved: number;
  responseTimeMs:  number;
}): Promise<void> {
  const { error } = await supabaseAdmin.from('chat_logs').insert({
    session_token:    opts.sessionToken,
    lang:             opts.lang,
    message_hash:     await sha256hex(opts.message),
    chunks_retrieved: opts.chunksRetrieved,
    response_time_ms: opts.responseTimeMs,
  });

  if (error) {
    console.warn('[chat] chat_logs insert failed:', error.message);
  }
}

// ─── Answer cache ─────────────────────────────────────────────────────────────
// Common questions (e.g. the widget's suggested ones) repeat across visitors.
// Caching their answers skips embedding + vector search + the LLM entirely,
// which both speeds up responses and conserves the Groq token budget.

interface CachedAnswer {
  answer:  string;
  sources: string[];
}

async function readCache(key: string): Promise<CachedAnswer | null> {
  const cutoff = new Date(Date.now() - CACHE_TTL_DAYS * 86_400_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('chat_cache')
    .select('answer, sources')
    .eq('cache_key', key)
    .gt('created_at', cutoff)
    .maybeSingle();

  if (error) {
    console.warn('[chat] cache read failed:', error.message);
    return null; // fail open — fall through to the live pipeline
  }
  if (!data) return null;
  return { answer: data.answer as string, sources: (data.sources ?? []) as string[] };
}

async function writeCache(key: string, lang: Lang, answer: string, sources: string[]): Promise<void> {
  const { error } = await supabaseAdmin
    .from('chat_cache')
    .upsert(
      { cache_key: key, lang, answer, sources, created_at: new Date().toISOString() },
      { onConflict: 'cache_key' }
    );
  if (error) console.warn('[chat] cache write failed:', error.message);
}

// ─── RAG pipeline ─────────────────────────────────────────────────────────────

async function runRagPipeline(
  message: string,
  lang: Lang,
  sessionToken: string,
  startTime: number,
  corsHeaders: Record<string, string>
): Promise<Response> {
  // Cache lookup — serve repeated questions instantly, skipping embed + RAG + LLM
  const key    = await cacheKey(message, lang);
  const cached = await readCache(key);
  if (cached) {
    logRequest({ sessionToken, lang, message, chunksRetrieved: 0, responseTimeMs: Date.now() - startTime });
    return jsonResponse({ answer: cached.answer, sources: cached.sources }, 200, corsHeaders);
  }

  const embedding = await generateEmbedding(message);
  const chunks    = await retrieveChunks(embedding, lang);

  // Below threshold — return fallback without invoking the LLM
  if (shouldUseFallback(chunks)) {
    writeCache(key, lang, FALLBACK[lang], []); // deterministic — safe to cache
    logRequest({
      sessionToken,
      lang,
      message,
      chunksRetrieved: 0,
      responseTimeMs:  Date.now() - startTime,
    });

    return jsonResponse({ answer: FALLBACK[lang], sources: [] }, 200, corsHeaders);
  }

  const systemPrompt = buildSystemPrompt(chunks, lang);

  let answer: string;
  try {
    answer = stripMarkdown(
      stripMetaPrefix(
        await callLlmWithFallback(systemPrompt, message, { providers: LLM_PROVIDERS })
      )
    );
  } catch (err) {
    if (err instanceof GroqRateLimitError) {
      // Soft-degrade: every model is momentarily rate-limited. Return a friendly,
      // retryable message with 200 so the widget shows it instead of a hard error.
      // Not cached — this is a transient state, not a real answer.
      console.warn('[chat]', err.message);
      logRequest({
        sessionToken,
        lang,
        message,
        chunksRetrieved: chunks.length,
        responseTimeMs:  Date.now() - startTime,
      });
      return jsonResponse({ answer: BUSY_MESSAGE[lang], sources: [] }, 200, corsHeaders);
    }
    throw err;
  }

  const sources = [...new Set(chunks.map((c) => c.source))];

  writeCache(key, lang, answer, sources); // fire-and-forget — never blocks the response

  logRequest({
    sessionToken,
    lang,
    message,
    chunksRetrieved: chunks.length,
    responseTimeMs:  Date.now() - startTime,
  });

  return jsonResponse({ answer, sources }, 200, corsHeaders);
}

// ─── Request handler ──────────────────────────────────────────────────────────

async function handleChatRequest(req: Request): Promise<Response> {
  const startTime   = Date.now();
  const origin      = req.headers.get('origin');
  const corsHeaders = buildCorsHeaders(origin, ALLOWED_ORIGINS);

  // ── CORS preflight ───────────────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // ── Origin guard ─────────────────────────────────────────────────────────
  if (!isOriginAllowed(origin, ALLOWED_ORIGINS)) {
    return new Response(JSON.stringify({ error: 'forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── Session token ────────────────────────────────────────────────────────
  const sessionToken = req.headers.get('x-session-token');
  if (!isValidUUIDv4(sessionToken)) {
    return jsonResponse({ error: 'invalid_session_token' }, 400, corsHeaders);
  }

  // ── Body parsing & validation ─────────────────────────────────────────────
  let body: ChatRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(
      { error: 'invalid_message', max_length: MAX_MESSAGE_LENGTH },
      422,
      corsHeaders
    );
  }

  if (!isValidMessage(body.message)) {
    return jsonResponse(
      { error: 'invalid_message', max_length: MAX_MESSAGE_LENGTH },
      422,
      corsHeaders
    );
  }

  const lang    = normalizeLang(body.lang);
  const message = body.message;

  // ── Rate limiting ─────────────────────────────────────────────────────────
  const ip = (
    req.headers.get('x-real-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    'unknown'
  );

  const rateLimit = await checkRateLimit(ip);
  if (!rateLimit.allowed) {
    return jsonResponse(
      { error: 'rate_limit_exceeded', retry_after: rateLimit.retryAfter },
      429,
      corsHeaders
    );
  }

  // ── RAG pipeline ──────────────────────────────────────────────────────────
  return runRagPipeline(message, lang, sessionToken, startTime, corsHeaders);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  try {
    return await handleChatRequest(req);
  } catch (err) {
    console.error('[chat] Unhandled error:', err);
    return new Response(JSON.stringify({ error: 'internal_error' }), {
      status:  500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
