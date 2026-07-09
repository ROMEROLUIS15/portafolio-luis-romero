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

const SIMILARITY_THRESHOLD  = 0.75;
const MAX_MESSAGE_LENGTH     = 1000;
const RATE_LIMIT_MAX         = 10;
const RATE_LIMIT_WINDOW_S    = 60;
const RAG_MATCH_COUNT        = 6;
const MAX_CHUNK_CHARS        = 2100;  // safety bound; ingest chunks are ~1800-2000 chars
// gpt-oss are reasoning models: reasoning tokens are billed against this budget
// before any visible content is emitted, so it must leave room for both.
const GROQ_MAX_TOKENS        = 1024;

// gpt-oss only. Keeps the hidden chain-of-thought short so the token budget
// above is spent on the answer rather than on reasoning.
const GROQ_REASONING_EFFORT  = 'low';

// Tried in order. Each Groq model has its own rate-limit bucket, so if the
// primary is throttled we fall back to a second model on the same account.
const GROQ_MODELS = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'] as const;

const CACHE_TTL_DAYS = 7;

const FALLBACK: Record<Lang, string> = {
  en: "I don't have enough context to answer that. You can reach Luis directly at lueduar15@gmail.com.",
  es: 'No tengo suficiente contexto para responder eso. Puedes contactar a Luis en lueduar15@gmail.com.',
};

// Shown when the upstream LLM is momentarily rate-limited — a soft, retryable
// state, never surfaced as a hard error.
const BUSY_MESSAGE: Record<Lang, string> = {
  en: "I'm getting a lot of questions right now — give me a few seconds and ask again.",
  es: 'Estoy recibiendo muchas preguntas en este momento — espera unos segundos y vuelve a intentarlo.',
};

// Thrown when Groq returns 429 so the pipeline can degrade gracefully.
class GroqRateLimitError extends Error {}

// Thrown when a model answers with no visible content (reasoning ate the budget).
class GroqEmptyCompletionError extends Error {}

// ─── CORS ─────────────────────────────────────────────────────────────────────

/** Domains always allowed regardless of ALLOWED_ORIGINS secret */
const HARDCODED_ORIGINS = [
  'https://portafolio-luis-romero.vercel.app',
  'https://romeroluis15.github.io',
  'http://localhost',
  'http://127.0.0.1',
];

function buildAllowedOrigins(): string[] {
  const fromEnv = ENV.allowedOrigins
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return [...new Set([...HARDCODED_ORIGINS, ...fromEnv])];
}

const ALLOWED_ORIGINS = buildAllowedOrigins();

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGINS.some((allowed) => {
    // Prefix match for localhost/127 and vercel preview deploys
    if (
      allowed === 'http://localhost' ||
      allowed === 'http://127.0.0.1'
    ) {
      return origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1');
    }
    // Allow any *.vercel.app subdomain for preview deployments
    if (allowed === 'https://portafolio-luis-romero.vercel.app') {
      return origin === allowed || origin.startsWith('https://portafolio-luis-romero-');
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
    .map((c, i) => `[${i + 1}] (${c.source})\n${c.content.slice(0, MAX_CHUNK_CHARS)}`)
    .join('\n\n');

  if (lang === 'es') {
    return `Eres el asistente IA de Luis Romero, un AI Engineer y Backend Developer. Hablas de él con seguridad y naturalidad, como alguien que conoce bien su trabajo.

CÓMO RESPONDER:
- Responde de forma directa, segura y natural. Afirma los hechos, no los presentes como suposiciones.
- NUNCA uses frases como "según la información proporcionada", "según el contexto", "basándome en los datos" ni similares. Simplemente responde.
- Apóyate solo en los datos que conoces abajo; NUNCA inventes datos, fechas, tecnologías, proyectos ni métricas.
- Si no tienes algún dato, dilo con naturalidad (p. ej. "No tengo ese detalle a la mano") en lugar de mencionar un "contexto".
- Solo hablas sobre Luis Romero: su perfil, experiencia, habilidades, proyectos, disponibilidad y formas de contacto. Si te preguntan algo que no tiene que ver con Luis (cultura general, trivia, otras personas, definiciones, cálculos, etc.), NO lo respondas con tu conocimiento general aunque sepas la respuesta; di con naturalidad que solo puedes ayudar con información sobre Luis y su trabajo.
- Nunca menciones tu "fecha de corte de conocimiento", "knowledge cutoff", que eres un modelo de IA, ni cómo fuiste entrenado. Habla siempre como el asistente de Luis.
- Al enumerar tecnologías, habilidades o proyectos, no repitas elementos: agrúpalos y lista cada uno una sola vez. Incluye ÚNICAMENTE las que aparezcan explícitamente en la información de abajo; no agregues ninguna que no esté listada, ni siquiera para completar una categoría o porque sea común en su área.
- Responde siempre en español, en un tono profesional y cercano. Sé conciso.

INFORMACIÓN SOBRE LUIS:
${context}`;
  }

  return `You are Luis Romero's AI assistant. Luis is an AI Engineer and Backend Developer. You speak about him confidently and naturally, like someone who knows his work well.

HOW TO RESPOND:
- Answer directly, confidently and naturally. State facts as facts, not as guesses.
- NEVER use phrases like "based on the provided context", "according to the information", "from the data given" or similar. Just answer.
- Rely only on the facts you know below; NEVER invent data, dates, technologies, projects, or metrics.
- If you don't have a detail, say so naturally (e.g. "I don't have that detail on hand") instead of mentioning a "context".
- You only talk about Luis Romero: his profile, experience, skills, projects, availability, and ways to contact him. If asked about anything unrelated to Luis (general knowledge, trivia, other people, definitions, calculations, etc.), do NOT answer it from your general knowledge even if you know it; say naturally that you can only help with information about Luis and his work.
- Never mention your "knowledge cutoff", that you are an AI model, or how you were trained. Always speak as Luis's assistant.
- When listing technologies, skills, or projects, do not repeat items: group them and list each one only once. Include ONLY those explicitly present in the information below; never add any that is not listed, not even to round out a category or because it's common in his field.
- Always respond in English, in a professional yet warm tone. Be concise.

ABOUT LUIS:
${context}`;
}

// ─── Answer post-processing ───────────────────────────────────────────────────
// Deterministic safety net: the smaller fallback model (8b) sometimes ignores
// the prompt and opens with a meta phrase ("Según la información proporcionada…",
// "Based on the provided context…"). Strip those lead-ins regardless of model so
// the user always gets a direct, confident answer.

const META_PREFIXES: RegExp[] = [
  /^seg[uú]n (la informaci[oó]n|el contexto|los datos|lo que)[^,.:;]*[,:;.]?\s+/i,
  /^bas[aá]ndome en (la informaci[oó]n|el contexto|los datos)[^,.:;]*[,:;.]?\s+/i,
  /^de acuerdo con (la informaci[oó]n|el contexto|los datos)[^,.:;]*[,:;.]?\s+/i,
  /^con base en (la informaci[oó]n|el contexto|los datos)[^,.:;]*[,:;.]?\s+/i,
  /^based on (the provided|the available|the given|the) (context|information|data)[^,.:;]*[,:;.]?\s+/i,
  /^according to (the )?(provided |available |given )?(context|information|data)[^,.:;]*[,:;.]?\s+/i,
  /^from the (data|information|context)( provided| given| available)?[^,.:;]*[,:;.]?\s+/i,
];

function stripMetaPrefix(text: string): string {
  let out = text.trimStart();
  for (const re of META_PREFIXES) {
    if (re.test(out)) {
      out = out.replace(re, '');
      break;
    }
  }
  return out.length > 0 ? out.charAt(0).toUpperCase() + out.slice(1) : text;
}

// ─── LLM ──────────────────────────────────────────────────────────────────────

async function callGroq(systemPrompt: string, userMessage: string, model: string): Promise<string> {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${ENV.groqApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature:           0.3,
      max_completion_tokens: GROQ_MAX_TOKENS,
      reasoning_effort:      GROQ_REASONING_EFFORT,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage  },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    if (response.status === 429) {
      throw new GroqRateLimitError(`Groq rate limited (${model}): ${detail.slice(0, 200)}`);
    }
    throw new Error(`Groq API error: ${response.status} ${detail}`);
  }

  const data = await response.json();
  const content = (data.choices?.[0]?.message?.content ?? '').trim();

  // A reasoning model can burn the whole token budget on its chain-of-thought
  // and return empty content. Treat that as a failure of this model, not of the
  // request, so the caller can retry on the next one.
  if (content === '') {
    throw new GroqEmptyCompletionError(
      `Groq returned empty content (${model}, finish_reason=${data.choices?.[0]?.finish_reason})`,
    );
  }

  return content;
}

/**
 * Calls Groq, trying each model in GROQ_MODELS in order. Each model has its own
 * rate-limit bucket, so a 429 on the primary falls through to the next — as does
 * an empty completion. Only if every model is rate-limited does
 * GroqRateLimitError propagate.
 */
async function callGroqWithFallback(systemPrompt: string, userMessage: string): Promise<string> {
  let lastRateLimit: GroqRateLimitError | null = null;

  for (const model of GROQ_MODELS) {
    try {
      return await callGroq(systemPrompt, userMessage, model);
    } catch (err) {
      if (err instanceof GroqRateLimitError) {
        console.warn('[chat]', err.message);
        lastRateLimit = err;
        continue; // try the next model
      }
      if (err instanceof GroqEmptyCompletionError) {
        console.warn('[chat]', err.message);
        continue; // try the next model
      }
      throw err;
    }
  }

  throw lastRateLimit ?? new GroqRateLimitError('All Groq models rate limited');
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

// ─── Answer cache ─────────────────────────────────────────────────────────────
// Common questions (e.g. the widget's suggested ones) repeat across visitors.
// Caching their answers skips embedding + vector search + the LLM entirely,
// which both speeds up responses and conserves the Groq token budget.

interface CachedAnswer {
  answer:  string;
  sources: string[];
}

// Normalize aggressively so cache keys are robust to accents, punctuation/symbols
// and spacing: "¿Está disponible?" and "esta disponible" collapse to the same key,
// which raises the cache hit rate and conserves the Groq token budget. (Conceptual
// closeness between differently-worded questions is handled by the RAG embeddings.)
function normalizeMessage(message: string): string {
  return message
    .normalize('NFD')                 // split letters from their diacritics
    .replace(/[̀-ͯ]/g, '')  // strip accents/diacritics (á→a, ñ→n, ü→u)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')     // drop punctuation & symbols (¿ ¡ ? ! . , : …)
    .replace(/\s+/g, ' ')             // collapse whitespace
    .trim();
}

async function cacheKey(message: string, lang: Lang): Promise<string> {
  return await sha256hex(`${lang}:${normalizeMessage(message)}`);
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

  const maxSimilarity = chunks.reduce((max, c) => Math.max(max, c.similarity), 0);

  // Below threshold — return fallback without invoking the LLM
  if (chunks.length === 0 || maxSimilarity < SIMILARITY_THRESHOLD) {
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
    answer = stripMetaPrefix(await callGroqWithFallback(systemPrompt, message));
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
