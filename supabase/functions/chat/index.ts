// Supabase Edge Function: chat
// RAG pipeline: Supabase embeddings (gte-small, free) → pgvector → Groq LLM
// Requirements: 3.x, 4.x, 6.x, 8.x

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatRequest {
  message: string;
  lang: 'es' | 'en';
}

interface ChunkResult {
  id: bigint;
  content: string;
  source: string;
  lang: string;
  similarity: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SIMILARITY_THRESHOLD = 0.70;
const MAX_MESSAGE_LENGTH = 500;
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_S = 60;

const FALLBACK_EN =
  "I don't have enough context to answer that question. You can reach Luis directly at lueduar15@gmail.com.";
const FALLBACK_ES =
  'No tengo suficiente contexto para responder esa pregunta. Puedes contactar a Luis directamente en lueduar15@gmail.com.';

// ─── CORS ─────────────────────────────────────────────────────────────────────

function getAllowedOrigins(): string[] {
  const env = Deno.env.get('ALLOWED_ORIGINS') ?? '';
  const parsed = env
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  // Always allow localhost for development
  return [...parsed, 'http://localhost', 'http://127.0.0.1'];
}

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  const allowed = getAllowedOrigins();
  return allowed.some((o) => {
    // Allow localhost with any port
    if (o === 'http://localhost' || o === 'http://127.0.0.1') {
      return (
        origin.startsWith('http://localhost') ||
        origin.startsWith('http://127.0.0.1')
      );
    }
    return origin === o;
  });
}

function buildCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = isOriginAllowed(origin) ? (origin as string) : '';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, X-Session-Token, Authorization',
    'Content-Type': 'application/json',
  };
}

// ─── Validation ───────────────────────────────────────────────────────────────

function isValidUUIDv4(token: string | null | undefined): boolean {
  if (!token) return false;
  return UUID_V4_REGEX.test(token);
}

function isValidMessage(msg: unknown): msg is string {
  return typeof msg === 'string' && msg.length >= 1 && msg.length <= MAX_MESSAGE_LENGTH;
}

function normalizeLang(lang: unknown): 'es' | 'en' {
  if (lang === 'es') return 'es';
  return 'en';
}

// ─── Rate Limiting ────────────────────────────────────────────────────────────

async function checkRateLimit(
  supabase: ReturnType<typeof createClient>,
  ip: string
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const now = new Date();

  const { data, error } = await supabase
    .from('rate_limits')
    .select('count, window_start')
    .eq('ip', ip)
    .maybeSingle();

  if (error) {
    // On DB error, fail open (allow the request)
    console.warn('[chat] rate_limits query failed:', error.message);
    return { allowed: true };
  }

  if (!data) {
    // First request from this IP
    await supabase.from('rate_limits').insert({ ip, count: 1, window_start: now.toISOString() });
    return { allowed: true };
  }

  const windowStart = new Date(data.window_start);
  const elapsedSeconds = (now.getTime() - windowStart.getTime()) / 1000;

  if (elapsedSeconds > RATE_LIMIT_WINDOW_S) {
    // Window expired — reset
    await supabase
      .from('rate_limits')
      .update({ count: 1, window_start: now.toISOString() })
      .eq('ip', ip);
    return { allowed: true };
  }

  if (data.count >= RATE_LIMIT_MAX) {
    const retryAfter = Math.ceil(RATE_LIMIT_WINDOW_S - elapsedSeconds);
    return { allowed: false, retryAfter };
  }

  // Increment counter
  await supabase
    .from('rate_limits')
    .update({ count: data.count + 1 })
    .eq('ip', ip);

  return { allowed: true };
}

// ─── Embeddings — Supabase built-in (free, gte-small, 384 dims) ──────────────

async function generateEmbedding(text: string): Promise<number[]> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  const response = await fetch(`${supabaseUrl}/functions/v1/embed`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input: text }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Supabase embed error: ${response.status} ${err}`);
  }

  const data = await response.json();
  // Supabase embed returns { embedding: number[] }
  return data.embedding as number[];
}

// ─── System Prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(chunks: ChunkResult[], lang: 'es' | 'en'): string {
  const context = chunks.map((c, i) => `[${i + 1}] (${c.source})\n${c.content}`).join('\n\n');

  if (lang === 'es') {
    return `Eres un asistente de IA que responde preguntas sobre Luis Romero, un AI Engineer y Backend Developer.

INSTRUCCIONES ESTRICTAS:
- Responde ÚNICAMENTE usando la información del contexto provisto a continuación.
- NUNCA inventes datos, fechas, tecnologías, proyectos ni métricas que no estén en el contexto.
- Si el contexto no contiene información suficiente para responder, indícalo claramente.
- Responde siempre en español.
- Sé conciso y profesional.

CONTEXTO:
${context}`;
  }

  return `You are an AI assistant that answers questions about Luis Romero, an AI Engineer and Backend Developer.

STRICT INSTRUCTIONS:
- Answer ONLY using the information from the context provided below.
- NEVER invent data, dates, technologies, projects, or metrics not present in the context.
- If the context does not contain enough information to answer, state that clearly.
- Always respond in English.
- Be concise and professional.

CONTEXT:
${context}`;
}

// ─── Groq LLM ─────────────────────────────────────────────────────────────────

async function callGroq(systemPrompt: string, userMessage: string): Promise<string> {
  const apiKey = Deno.env.get('GROQ_API_KEY');
  if (!apiKey) throw new Error('GROQ_API_KEY not set');

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama3-70b-8192',
      temperature: 0.3,
      max_tokens: 512,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq API error: ${response.status} ${err}`);
  }

  const data = await response.json();
  return data.choices[0].message.content as string;
}

// ─── SHA-256 helper ───────────────────────────────────────────────────────────

async function sha256hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const startTime = Date.now();
  const origin = req.headers.get('origin');
  const corsHeaders = buildCorsHeaders(origin);

  // OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // CORS origin check — Requirement 4.5
  if (!isOriginAllowed(origin)) {
    return new Response(JSON.stringify({ error: 'forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // ── Session token validation — Requirement 4.3 ──────────────────────────
    const sessionToken = req.headers.get('x-session-token');
    if (!isValidUUIDv4(sessionToken)) {
      return new Response(JSON.stringify({ error: 'invalid_session_token' }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // ── Parse & validate body — Requirement 4.4 ─────────────────────────────
    let body: ChatRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'invalid_message', max_length: MAX_MESSAGE_LENGTH }),
        { status: 422, headers: corsHeaders }
      );
    }

    if (!isValidMessage(body.message)) {
      return new Response(
        JSON.stringify({ error: 'invalid_message', max_length: MAX_MESSAGE_LENGTH }),
        { status: 422, headers: corsHeaders }
      );
    }

    const lang = normalizeLang(body.lang);
    const message = body.message;

    // ── Supabase clients ─────────────────────────────────────────────────────
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // anon client for match_documents RPC (public read policy)
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    // service_role client for rate_limits and chat_logs
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // ── Rate limiting — Requirements 4.1, 4.2 ───────────────────────────────
    const ip =
      req.headers.get('x-real-ip') ??
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
      'unknown';

    const rateCheck = await checkRateLimit(supabaseAdmin, ip);
    if (!rateCheck.allowed) {
      return new Response(
        JSON.stringify({
          error: 'rate_limit_exceeded',
          retry_after: rateCheck.retryAfter,
        }),
        { status: 429, headers: corsHeaders }
      );
    }

    // ── Generate embedding — Requirement 3.1 ────────────────────────────────
    const queryEmbedding = await generateEmbedding(message);

    // ── Vector search — Requirement 3.1 ─────────────────────────────────────
    const { data: chunks, error: rpcError } = await supabase.rpc('match_documents', {
      query_embedding: queryEmbedding,
      query_lang: lang,
      match_count: 5,
    });

    if (rpcError) {
      throw new Error(`match_documents RPC error: ${rpcError.message}`);
    }

    const typedChunks = (chunks ?? []) as ChunkResult[];

    // ── Similarity threshold — Requirements 3.2, 3.3 ────────────────────────
    const maxSimilarity = typedChunks.reduce(
      (max, c) => Math.max(max, c.similarity),
      0
    );

    if (maxSimilarity < SIMILARITY_THRESHOLD || typedChunks.length === 0) {
      const responseTimeMs = Date.now() - startTime;
      // Fire-and-forget log
      supabaseAdmin
        .from('chat_logs')
        .insert({
          session_token: sessionToken,
          lang,
          message_hash: await sha256hex(message),
          chunks_retrieved: 0,
          response_time_ms: responseTimeMs,
        })
        .then(({ error: logErr }) => {
          if (logErr) console.warn('[chat] chat_logs insert failed:', logErr.message);
        });

      return new Response(
        JSON.stringify({
          answer: lang === 'es' ? FALLBACK_ES : FALLBACK_EN,
          sources: [],
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    // ── Build system prompt — Requirements 3.4, 6.1, 6.2 ───────────────────
    const systemPrompt = buildSystemPrompt(typedChunks, lang);

    // ── Call Groq — Requirements 3.5, 3.6 ───────────────────────────────────
    const answer = await callGroq(systemPrompt, message);

    // ── Unique sources ───────────────────────────────────────────────────────
    const sources = [...new Set(typedChunks.map((c) => c.source))];

    // ── Log (async fire-and-forget) — Requirements 8.1, 8.2, 8.3 ────────────
    const responseTimeMs = Date.now() - startTime;
    supabaseAdmin
      .from('chat_logs')
      .insert({
        session_token: sessionToken,
        lang,
        message_hash: await sha256hex(message),
        chunks_retrieved: typedChunks.length,
        response_time_ms: responseTimeMs,
      })
      .then(({ error: logErr }) => {
        if (logErr) console.warn('[chat] chat_logs insert failed:', logErr.message);
      });

    return new Response(JSON.stringify({ answer, sources }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (err) {
    console.error('[chat] Internal error:', err);
    return new Response(JSON.stringify({ error: 'internal_error' }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
