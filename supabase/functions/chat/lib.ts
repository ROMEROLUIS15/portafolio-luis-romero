// Pure logic for the chat Edge Function.
//
// Everything here is free of module-level side effects: no Deno.env reads, no
// Supabase clients. index.ts wires this to the runtime; chat.test.ts imports the
// very same functions. Nothing is reimplemented on the test side.

export type Lang = 'es' | 'en';

export interface ChunkResult {
  id: bigint;
  content: string;
  source: string;
  lang: string;
  similarity: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const SIMILARITY_THRESHOLD = 0.75;
export const MAX_MESSAGE_LENGTH   = 1000;
export const RATE_LIMIT_MAX       = 10;
export const RATE_LIMIT_WINDOW_S  = 60;
export const RAG_MATCH_COUNT      = 6;
export const MAX_CHUNK_CHARS      = 2100;  // safety bound; ingest chunks are ~1800-2000 chars

// gpt-oss are reasoning models: reasoning tokens are billed against this budget
// before any visible content is emitted, so it must leave room for both.
export const GROQ_MAX_TOKENS = 1024;

// gpt-oss only. Keeps the hidden chain-of-thought short so the token budget
// above is spent on the answer rather than on reasoning.
export const GROQ_REASONING_EFFORT = 'low';

// Tried in order. Each Groq model has its own rate-limit bucket, so if the
// primary is throttled we fall back to a second model on the same account.
export const GROQ_MODELS = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'] as const;

export const CACHE_TTL_DAYS = 7;

export const FALLBACK: Record<Lang, string> = {
  en: "I don't have enough context to answer that. You can reach Luis directly at lueduar15@gmail.com.",
  es: 'No tengo suficiente contexto para responder eso. Puedes contactar a Luis en lueduar15@gmail.com.',
};

// Shown when the upstream LLM is momentarily rate-limited — a soft, retryable
// state, never surfaced as a hard error.
export const BUSY_MESSAGE: Record<Lang, string> = {
  en: "I'm getting a lot of questions right now — give me a few seconds and ask again.",
  es: 'Estoy recibiendo muchas preguntas en este momento — espera unos segundos y vuelve a intentarlo.',
};

/** Domains always allowed regardless of the ALLOWED_ORIGINS secret */
export const HARDCODED_ORIGINS = [
  'https://portafolio-luis-romero.vercel.app',
  'https://romeroluis15.github.io',
  'http://localhost',
  'http://127.0.0.1',
];

// ─── Errors ───────────────────────────────────────────────────────────────────

/** Thrown when Groq returns 429 so the pipeline can degrade gracefully. */
export class GroqRateLimitError extends Error {}

/** Thrown when a model answers with no visible content (reasoning ate the budget). */
export class GroqEmptyCompletionError extends Error {}

// ─── Validation ───────────────────────────────────────────────────────────────

export function isValidUUIDv4(token: string | null | undefined): token is string {
  if (!token) return false;
  return UUID_V4_REGEX.test(token);
}

export function isValidMessage(msg: unknown): msg is string {
  return typeof msg === 'string' && msg.length >= 1 && msg.length <= MAX_MESSAGE_LENGTH;
}

export function normalizeLang(lang: unknown): Lang {
  return lang === 'es' ? 'es' : 'en';
}

// ─── Retrieval decision ───────────────────────────────────────────────────────

/**
 * True when retrieval was too weak to ground an answer. The caller must return
 * FALLBACK without invoking the LLM.
 */
export function shouldUseFallback(chunks: ChunkResult[]): boolean {
  if (chunks.length === 0) return true;
  const maxSimilarity = chunks.reduce((max, c) => Math.max(max, c.similarity), 0);
  return maxSimilarity < SIMILARITY_THRESHOLD;
}

// ─── CORS ─────────────────────────────────────────────────────────────────────

export function buildAllowedOrigins(fromEnvRaw: string): string[] {
  const fromEnv = fromEnvRaw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return [...new Set([...HARDCODED_ORIGINS, ...fromEnv])];
}

// Anchored: a bare startsWith() would let `http://localhost.evil.com` and
// `https://portafolio-luis-romero-x.evil.com` through the origin guard, because
// both begin with the prefix we intended to match.
const LOCALHOST_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;
const VERCEL_PREVIEW    = /^https:\/\/portafolio-luis-romero-[a-z0-9-]+\.vercel\.app$/;

export function isOriginAllowed(origin: string | null, allowedOrigins: string[]): boolean {
  if (!origin) return false;
  return allowedOrigins.some((allowed) => {
    // Any port on localhost/127.0.0.1, but nothing else on that host
    if (allowed === 'http://localhost' || allowed === 'http://127.0.0.1') {
      return LOCALHOST_ORIGIN.test(origin);
    }
    // Production plus any *.vercel.app preview deployment of this project
    if (allowed === 'https://portafolio-luis-romero.vercel.app') {
      return origin === allowed || VERCEL_PREVIEW.test(origin);
    }
    return origin === allowed;
  });
}

export function buildCorsHeaders(
  origin: string | null,
  allowedOrigins: string[]
): Record<string, string> {
  return {
    'Access-Control-Allow-Origin':  isOriginAllowed(origin, allowedOrigins) ? (origin as string) : '',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Session-Token, Authorization',
    'Content-Type':                 'application/json',
  };
}

// ─── System prompt ────────────────────────────────────────────────────────────

export function buildSystemPrompt(chunks: ChunkResult[], lang: Lang): string {
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
- Muchos visitantes te tutean como si hablaran con Luis en persona: "¿dónde vives?", "¿cuál es tu ubicación?", "¿cuánto tardaste en ese proyecto?", "¿cuál es tu fuerte?". Esas preguntas SIEMPRE son sobre Luis, nunca sobre ti: respóndelas con sus datos y no las trates como ajenas al tema. Habla de él en tercera persona ("Luis vive en...") aunque la pregunta venga en segunda.
- Nunca menciones tu "fecha de corte de conocimiento", "knowledge cutoff", que eres un modelo de IA, ni cómo fuiste entrenado. Habla siempre como el asistente de Luis.
- Al enumerar tecnologías, habilidades o proyectos, no repitas elementos: agrúpalos y lista cada uno una sola vez. Incluye ÚNICAMENTE las que aparezcan explícitamente en la información de abajo; no agregues ninguna que no esté listada, ni siquiera para completar una categoría o porque sea común en su área.
- Escribe en texto plano. NUNCA uses markdown: nada de asteriscos para negrita, almohadillas para títulos, ni guiones para viñetas. El widget muestra tu respuesta tal cual, así que esos símbolos se verían literalmente. Si necesitas enumerar, usa frases separadas por comas o párrafos cortos.
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
- Many visitors address you as if you were Luis himself: "where do you live?", "what is your location?", "how long did that project take you?", "what is your strong suit?". Those questions are ALWAYS about Luis, never about you: answer them with his facts and never treat them as off-topic. Speak about him in the third person ("Luis lives in...") even when the question is in the second.
- Never mention your "knowledge cutoff", that you are an AI model, or how you were trained. Always speak as Luis's assistant.
- When listing technologies, skills, or projects, do not repeat items: group them and list each one only once. Include ONLY those explicitly present in the information below; never add any that is not listed, not even to round out a category or because it's common in his field.
- Write in plain text. NEVER use markdown: no asterisks for bold, no hashes for headings, no dashes for bullets. The widget renders your answer verbatim, so those symbols would show up literally. If you need to enumerate, use comma-separated phrases or short paragraphs.
- Always respond in English, in a professional yet warm tone. Be concise.

ABOUT LUIS:
${context}`;
}

// ─── Answer post-processing ───────────────────────────────────────────────────
// Deterministic safety net: a model sometimes ignores the prompt and opens with a
// meta phrase ("Según la información proporcionada…", "Based on the provided
// context…"). Strip those lead-ins regardless of model so the user always gets a
// direct, confident answer.

export const META_PREFIXES: RegExp[] = [
  /^seg[uú]n (la informaci[oó]n|el contexto|los datos|lo que)[^,.:;]*[,:;.]?\s+/i,
  /^bas[aá]ndome en (la informaci[oó]n|el contexto|los datos)[^,.:;]*[,:;.]?\s+/i,
  /^de acuerdo con (la informaci[oó]n|el contexto|los datos)[^,.:;]*[,:;.]?\s+/i,
  /^con base en (la informaci[oó]n|el contexto|los datos)[^,.:;]*[,:;.]?\s+/i,
  /^based on (the provided|the available|the given|the) (context|information|data)[^,.:;]*[,:;.]?\s+/i,
  /^according to (the )?(provided |available |given )?(context|information|data)[^,.:;]*[,:;.]?\s+/i,
  /^from the (data|information|context)( provided| given| available)?[^,.:;]*[,:;.]?\s+/i,
];

/**
 * True when the first token is a value whose exact case is meaningful — an
 * email, a URL, or a bare domain. Those are meant to be copied verbatim, so
 * recapitalising them would corrupt what the visitor reads.
 */
function startsWithCaseSensitiveToken(text: string): boolean {
  const token = text.split(/\s/, 1)[0] ?? '';
  return (
    token.includes('@') ||
    token.includes('://') ||
    /^[a-z0-9-]+(?:\.[a-z0-9-]+)+/i.test(token) // bare domain: linkedin.com/in/…
  );
}

export function stripMetaPrefix(text: string): string {
  const trimmed = text.trimStart();

  let stripped = trimmed;
  for (const re of META_PREFIXES) {
    if (re.test(stripped)) {
      stripped = stripped.replace(re, '');
      break;
    }
  }

  // No lead-in was removed, so the answer already starts where the model meant
  // it to. Recapitalising here is not a fix, it's damage: it used to rewrite an
  // answer of "linkedin.com/in/…" into "Linkedin.com/in/…".
  if (stripped === trimmed) return trimmed;

  // Stripping consumed everything — keep the original rather than return empty.
  if (stripped.length === 0) return text;

  // Removing the lead-in exposes what was a mid-sentence lowercase word, so the
  // capital has to be restored — except where case carries meaning.
  return startsWithCaseSensitiveToken(stripped)
    ? stripped
    : stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

/**
 * Removes markdown syntax from an answer. The widget renders answers as
 * `textContent`, so every marker the model emits is shown literally — a visitor
 * reading "**Motosmax Cordialidad**" is looking at a bug. Both prompts forbid
 * markdown and gpt-oss emits it anyway, which is exactly the case
 * `stripMetaPrefix` already exists for: a prompt is a request, not a guarantee.
 *
 * Conservative by construction — every rule needs a *matched pair* or a
 * line-start anchor, so prose that merely contains the characters survives
 * untouched: `17*23`, `chat_logs`, `gpt-oss-120b`, an email or a bare domain.
 */
export function stripMarkdown(text: string): string {
  const pass = (s: string): string =>
    s
      // Fenced blocks: drop the fence, keep the code inside.
      .replace(/```[a-z]*\n?([\s\S]*?)```/gi, '$1')
      // Headings, blockquotes and bullets, only at the start of a line, and a
      // whole run of them at once: "- - - x" is one line with three markers, and
      // stripping one per pass would need as many passes as the model felt like
      // nesting. The text after the run is kept.
      .replace(/^[ \t]*(?:#{1,6}[ \t]+)+/gm, '')
      .replace(/^[ \t]*(?:>[ \t]+)+/gm, '')
      .replace(/^[ \t]*(?:[-*+][ \t]+)+/gm, '')
      // Paired emphasis. The lookahead rejects "** " so an unmatched pair stays.
      .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '$1')
      .replace(/__(?=\S)([\s\S]*?\S)__/g, '$1')
      // Single-char emphasis needs a boundary before the opener, which is what
      // keeps snake_case identifiers and a lone multiplication sign intact.
      .replace(/(^|[\s(])\*(?=\S)([^*\n]*?\S)\*(?=[\s).,;:!?]|$)/g, '$1$2')
      .replace(/(^|[\s(])_(?=\S)([^_\n]*?\S)_(?=[\s).,;:!?]|$)/g, '$1$2')
      // Inline code.
      .replace(/`([^`\n]+)`/g, '$1')
      // Links and images: keep the label and the URL, drop the brackets. The URL
      // has to survive verbatim — the widget's contact detection reads the text.
      .replace(/!?\[([^\]\n]*)\]\(([^)\s]+)[^)]*\)/g, (_m, label, url) =>
        label ? `${label} (${url})` : url
      )
      // Whatever run of asterisks is left wrapped nothing — an empty "**" pair,
      // or the leftover of a nested one. It is noise in prose either way, and
      // never punctuation: "17*23" is a single asterisk and stays single.
      .replace(/\*{2,}/g, '');

  // One pass can expose markup that was nested inside what it just removed
  // ("- - item", "**`x`**"). Iterate to a fixed point so the function is
  // idempotent and callers never have to wonder how many passes they need.
  // Each rule only deletes, so length is non-increasing and this terminates.
  let out = text;
  for (let i = 0; i < 5; i++) {
    const next = pass(out);
    if (next === out) return out;
    out = next;
  }
  return out;
}

// ─── SHA-256 ──────────────────────────────────────────────────────────────────

export async function sha256hex(text: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─── Cache keys ───────────────────────────────────────────────────────────────
// Normalize aggressively so cache keys are robust to accents, punctuation/symbols
// and spacing: "¿Está disponible?" and "esta disponible" collapse to the same key,
// which raises the cache hit rate and conserves the Groq token budget. (Conceptual
// closeness between differently-worded questions is handled by the RAG embeddings.)

export function normalizeMessage(message: string): string {
  return message
    .normalize('NFD')                 // split letters from their diacritics
    .replace(/[̀-ͯ]/g, '')  // strip accents/diacritics (á→a, ñ→n, ü→u)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')     // drop punctuation & symbols (¿ ¡ ? ! . , : …)
    .replace(/\s+/g, ' ')             // collapse whitespace
    .trim();
}

export async function cacheKey(message: string, lang: Lang): Promise<string> {
  return await sha256hex(`${lang}:${normalizeMessage(message)}`);
}

// ─── LLM ──────────────────────────────────────────────────────────────────────

export interface GroqOptions {
  apiKey: string;
  models?: readonly string[];
  /** Injected so tests can drive the fallback chain without hitting the network. */
  fetchImpl?: typeof fetch;
}

export async function callGroq(
  systemPrompt: string,
  userMessage: string,
  model: string,
  opts: GroqOptions
): Promise<string> {
  const doFetch = opts.fetchImpl ?? fetch;

  const response = await doFetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${opts.apiKey}`,
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
 * GroqRateLimitError propagate. Any other error aborts immediately.
 */
export async function callGroqWithFallback(
  systemPrompt: string,
  userMessage: string,
  opts: GroqOptions
): Promise<string> {
  const models = opts.models ?? GROQ_MODELS;
  let lastRateLimit: GroqRateLimitError | null = null;

  for (const model of models) {
    try {
      return await callGroq(systemPrompt, userMessage, model, opts);
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
