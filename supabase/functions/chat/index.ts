// Supabase Edge Function: chat
// RAG pipeline: Supabase embeddings (gte-small, free) → pgvector → Groq LLM
// Requirements: 3.x, 4.x, 6.x, 8.x

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Types ────────────────────────────────────────────────────────────────────

type Lang = 'es' | 'en';

interface ChatRequest {
  message: string;
  lang: Lang;
}

interface ChunkResult {
  id: bigint;
  content: string;
  source: string;
  lang: string;
  similarity: number;
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
  allowedOrigins:     Deno.env.get('ALLOWED_ORIGINS')           ?? '',
} as const;

// Fail fast at cold start if critical env vars are missing
const MISSING_VARS = Object.entries(ENV)
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (MISSING_VARS.length > 0) {
  throw new Error(`[chat] Missing required env vars: ${MISSING_VARS.join(', ')}`);
}

// ─── Supabase clients (created once per module, reused across warm invocations)

const supabase      = createClient(ENV.supabaseUrl, ENV.supabaseAnonKey);
const supabaseAdmin = createClient(ENV.supabaseUrl, ENV.supabaseServiceKey);

// ─── Constants ────────────────────────────────────────────────────────────────

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SIMILARITY_THRESHOLD  = 0.70;
const MAX_MESSAGE_LENGTH     = 500;
const RATE_LIMIT_MAX         = 10;
const RATE_LIMIT_WINDOW_S    = 60;
const RAG_MATCH_COUNT        = 5;

const FALLBACK: Record<Lang, string> = {
  en: "I don't have enough context to answer that. You can reach Luis directly at lueduar15@gmail.com.",
  es: 'No tengo suficiente contexto para responder eso. Puedes contactar a Luis en lueduar15@gmail.com.',
};

// ─── CORS ─────────────────────────────────────────────────────────────────────

function buildAllowedOrigins(): string[] {
  const fromEnv = ENV.allowedOrigins
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return [...fromEnv, 'http://localhost', 'http://127.0.0.1'];
}

const ALLOWED_ORIGINS = buildAllowedOrigins();

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGINS.some((allowed) => {
    if (allowed === 'http://localhost' || allowed === 'http://127.0.0.1') {
      return origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1');
    }
    return origin === allowed;
  });
}

function buildCorsHeaders(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin':  isOriginAllowed(origin) ? (origin as string) : '',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Session-Token, Authorization',
    'Content-Type':                 'application/json',
  };
}

// ─── Helpers — pure response builders ────────────────────────────────────────

function jsonResponse(
  body: ChatResponse | ErrorResponse,
  status: number,
  corsHeaders: Record<string, string>
): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

// ─── Validation ───────────────────────────────────────────────────────────────

function isValidUUIDv4(token: string | null | undefined): token is string {
  if (!token) return false;
  return UUID_V4_REGEX.test(token);
}

function isValidMessage(msg: unknown): msg is string {
  return typeof msg === 'string' && msg.length >= 1 && msg.length <= MAX_MESSAGE_LENGTH;
}

function normalizeLang(lang: unknown): Lang {
  return lang === 'es' ? 'es' : 'en';
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

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(chunks: ChunkResult[], lang: Lang): string {
  const context = chunks
    .map((c, i) => `[${i + 1}] (${c.source})\n${c.content}`)
    .join('\n\n');

  if (lang === 'es') {
    return `Eres un asistente de IA que responde preguntas sobre Luis Romero, un AI Engineer y Backend Developer.

INSTRUCCIONES ESTRICTAS:
- Responde ÚNICAMENTE usando la información del contexto provisto.
- NUNCA inventes datos, fechas, tecnologías, proyectos ni métricas que no estén en el contexto.
- Si el contexto no es suficiente, indícalo claramente.
- Responde siempre en español.
- Sé conciso y profesional.

CONTEXTO:
${context}`;
  }

  return `You are an AI assistant answering questions about Luis Romero, an AI Engineer and Backend Developer.

STRICT INSTRUCTIONS:
- Answer ONLY using the context provided below.
- NEVER invent data, dates, technologies, projects, or metrics not present in the context.
- If the context is insufficient, state that clearly.
- Always respond in English.
- Be concise and professional.

CONTEXT:
${context}`;
}

// ─── LLM ──────────────────────────────────────────────────────────────────────

async function callGroq(systemPrompt: string, userMessage: string): Promise<string> {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${ENV.groqApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model:       'llama3-70b-8192',
      temperature: 0.3,
      max_tokens:  512,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage  },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Groq API error: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return data.choices[0].message.content as string;
}

// ─── SHA-256 ──────────────────────────────────────────────────────────────────

async function sha256hex(text: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
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

// ─── RAG pipeline ─────────────────────────────────────────────────────────────

async function runRagPipeline(
  message: string,
  lang: Lang,
  sessionToken: string,
  startTime: number,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const embedding = await generateEmbedding(message);
  const chunks    = await retrieveChunks(embedding, lang);

  const maxSimilarity = chunks.reduce((max, c) => Math.max(max, c.similarity), 0);

  // Below threshold — return fallback without invoking the LLM
  if (chunks.length === 0 || maxSimilarity < SIMILARITY_THRESHOLD) {
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
  const answer       = await callGroq(systemPrompt, message);
  const sources      = [...new Set(chunks.map((c) => c.source))];

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
  const corsHeaders = buildCorsHeaders(origin);

  // ── CORS preflight ───────────────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // ── Origin guard ─────────────────────────────────────────────────────────
  if (!isOriginAllowed(origin)) {
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
