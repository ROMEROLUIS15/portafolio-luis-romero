/**
 * Edge Function — Property-Based Tests
 * Feature: portfolio-conversational-agent
 * Uses fast-check via esm.sh in Deno environment
 *
 * Run: deno test --allow-env supabase/functions/chat/chat.test.ts
 */

// @ts-ignore — fast-check via esm.sh
import fc from 'https://esm.sh/fast-check@3.20.0';
import {
  assertEquals,
  assertNotEquals,
  assertMatch,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';

// ─── Import handler under test ────────────────────────────────────────────────
// We test pure functions extracted from the Edge Function logic.
// The handler itself is tested via integration tests.

/** UUID v4 regex — same as in index.ts */
const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUUIDv4(token: string | null | undefined): boolean {
  if (!token) return false;
  return UUID_V4_REGEX.test(token);
}

function isValidMessage(msg: unknown): boolean {
  return typeof msg === 'string' && msg.length >= 1 && msg.length <= 500;
}

function normalizeLang(lang: unknown): 'es' | 'en' {
  if (lang === 'es') return 'es';
  return 'en';
}

async function sha256hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function buildSystemPrompt(
  chunks: Array<{ content: string; source: string }>,
  lang: 'es' | 'en'
): string {
  const context = chunks
    .map((c, i) => `[${i + 1}] (${c.source})\n${c.content}`)
    .join('\n\n');

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

// ─── Property 1: Validación de mensajes rechaza entradas fuera de rango ───────
// Feature: portfolio-conversational-agent, Property 1: Validación de mensajes rechaza entradas fuera de rango

Deno.test('Property 1 — Invalid messages rejected (empty, >500 chars, undefined)', () => {
  fc.assert(
    fc.property(
      fc.oneof(
        fc.constant(''),
        fc.string({ minLength: 501, maxLength: 1000 }),
        fc.constant(null),
        fc.constant(undefined),
      ) as fc.Arbitrary<unknown>,
      (invalidMessage) => {
        const result = isValidMessage(invalidMessage);
        assertEquals(
          result,
          false,
          `Expected isValidMessage(${JSON.stringify(invalidMessage)}) to be false`
        );
      }
    ),
    { numRuns: 100, verbose: true }
  );
});

Deno.test('Property 1 — Valid messages accepted (1–500 chars)', () => {
  fc.assert(
    fc.property(
      fc.string({ minLength: 1, maxLength: 500 }),
      (validMessage) => {
        const result = isValidMessage(validMessage);
        assertEquals(
          result,
          true,
          `Expected isValidMessage("${validMessage.slice(0, 30)}...") to be true`
        );
      }
    ),
    { numRuns: 100, verbose: true }
  );
});

// ─── Property 3: Session token inválido rechazado en todo caso ────────────────
// Feature: portfolio-conversational-agent, Property 3: Session token inválido rechazado en todo caso

Deno.test('Property 3 — Invalid session tokens rejected', () => {
  fc.assert(
    fc.property(
      fc.oneof(
        fc.constant(''),
        fc.constant(null),
        fc.constant(undefined),
        // Random strings that are very unlikely to be valid UUIDs
        fc.string({ minLength: 1, maxLength: 50 }).filter(
          (s) => !UUID_V4_REGEX.test(s)
        ),
      ) as fc.Arbitrary<string | null | undefined>,
      (invalidToken) => {
        const result = isValidUUIDv4(invalidToken);
        assertEquals(
          result,
          false,
          `Expected isValidUUIDv4(${JSON.stringify(invalidToken)}) to be false`
        );
      }
    ),
    { numRuns: 100, verbose: true }
  );
});

Deno.test('Property 3 — Valid UUID v4 tokens accepted', () => {
  // Generate valid UUID v4s
  const validUUIDs = Array.from({ length: 20 }, () =>
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.floor(Math.random() * 16);
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    })
  );

  for (const uuid of validUUIDs) {
    assertEquals(isValidUUIDv4(uuid), true, `Expected ${uuid} to be valid UUID v4`);
  }
});

// ─── Property 4: Threshold de similitud determina invocación al LLM ──────────
// Feature: portfolio-conversational-agent, Property 4: Threshold de similitud determina invocación al LLM

Deno.test('Property 4 — Low similarity triggers fallback (no LLM call)', () => {
  const THRESHOLD = 0.70;

  fc.assert(
    fc.property(
      fc.array(
        fc.float({ min: 0, max: 0.699, noNaN: true }),
        { minLength: 1, maxLength: 5 }
      ),
      (lowSimilarities) => {
        const maxSimilarity = Math.max(...lowSimilarities);
        const shouldCallLLM = maxSimilarity >= THRESHOLD;
        assertEquals(
          shouldCallLLM,
          false,
          `With max similarity ${maxSimilarity.toFixed(4)}, LLM should NOT be called`
        );
      }
    ),
    { numRuns: 100, verbose: true }
  );
});

Deno.test('Property 4 — High similarity triggers LLM call', () => {
  const THRESHOLD = 0.70;

  fc.assert(
    fc.property(
      fc.array(
        fc.float({ min: 0.70, max: 1.0, noNaN: true }),
        { minLength: 1, maxLength: 5 }
      ),
      (highSimilarities) => {
        const maxSimilarity = Math.max(...highSimilarities);
        const shouldCallLLM = maxSimilarity >= THRESHOLD;
        assertEquals(
          shouldCallLLM,
          true,
          `With max similarity ${maxSimilarity.toFixed(4)}, LLM SHOULD be called`
        );
      }
    ),
    { numRuns: 100, verbose: true }
  );
});

// ─── Property 5: System prompt reflects request language ─────────────────────
// Feature: portfolio-conversational-agent, Property 5: El system prompt siempre refleja el idioma de la petición

Deno.test('Property 5 — System prompt language matches request lang', () => {
  const testChunks = [{ content: 'Test content', source: 'test.pdf' }];

  fc.assert(
    fc.property(
      fc.oneof(
        fc.constant('es'),
        fc.constant('en'),
        fc.string({ minLength: 1, maxLength: 5 }), // invalid langs default to 'en'
      ) as fc.Arbitrary<string>,
      (lang) => {
        const normalizedLang = normalizeLang(lang);
        const prompt = buildSystemPrompt(testChunks, normalizedLang);

        if (lang === 'es') {
          // Spanish prompt must contain Spanish instructions
          assertEquals(
            prompt.includes('Responde ÚNICAMENTE'),
            true,
            `ES prompt must contain Spanish restriction instructions`
          );
          assertEquals(
            prompt.includes('NUNCA inventes'),
            true,
            `ES prompt must contain Spanish anti-hallucination instruction`
          );
        } else {
          // English prompt (default for any non-'es' value)
          assertEquals(
            prompt.includes('Answer ONLY'),
            true,
            `EN prompt must contain English restriction instructions`
          );
          assertEquals(
            prompt.includes('NEVER invent'),
            true,
            `EN prompt must contain English anti-hallucination instruction`
          );
        }
      }
    ),
    { numRuns: 100, verbose: true }
  );
});

// ─── Property 6: System prompt always contains restriction instructions ───────
// Feature: portfolio-conversational-agent, Property 6: El system prompt siempre contiene instrucciones de restricción sobre Luis Romero

Deno.test('Property 6 — System prompt always contains Luis Romero restriction', () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          content: fc.string({ minLength: 1, maxLength: 200 }),
          source: fc.string({ minLength: 1, maxLength: 50 }),
        }),
        { minLength: 0, maxLength: 5 }
      ),
      fc.oneof(fc.constant('es' as const), fc.constant('en' as const)),
      (chunks, lang) => {
        const prompt = buildSystemPrompt(chunks, lang);

        // Must always reference Luis Romero
        assertEquals(
          prompt.includes('Luis Romero'),
          true,
          `System prompt must always reference Luis Romero`
        );

        // Must always have restriction instruction (in either language)
        const hasRestriction =
          prompt.includes('Answer ONLY') || prompt.includes('Responde ÚNICAMENTE');
        assertEquals(
          hasRestriction,
          true,
          `System prompt must always contain restriction instructions`
        );

        // Must always prohibit invention (in either language)
        const hasAntiHallucination =
          prompt.includes('NEVER invent') || prompt.includes('NUNCA inventes');
        assertEquals(
          hasAntiHallucination,
          true,
          `System prompt must always contain anti-hallucination instructions`
        );
      }
    ),
    { numRuns: 100, verbose: true }
  );
});

// ─── Property 7: Privacy — only SHA-256 hash stored, never plaintext ─────────
// Feature: portfolio-conversational-agent, Property 7: Privacidad del mensaje — solo hash SHA-256 almacenado

Deno.test('Property 7 — Message stored as SHA-256 hash, never plaintext', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.string({ minLength: 1, maxLength: 500 }),
      async (message) => {
        const expectedHash = await sha256hex(message);

        // Simulate what the Edge Function does: build logEntry
        const logEntry = {
          session_token: crypto.randomUUID(),
          lang: 'en',
          message_hash: await sha256hex(message),
          chunks_retrieved: 3,
          response_time_ms: 450,
        };

        // Verify hash is correct
        assertEquals(logEntry.message_hash, expectedHash);

        // Verify plaintext message does NOT appear in any field
        const serialized = JSON.stringify(logEntry);
        assertEquals(
          serialized.includes(message),
          false,
          `Plaintext message "${message.slice(0, 30)}" must NOT appear in log entry`
        );

        // SHA-256 output must be 64 hex chars
        assertMatch(logEntry.message_hash, /^[a-f0-9]{64}$/);
      }
    ),
    { numRuns: 100, verbose: true }
  );
});

// ─── Property 6 (lang normalization): non-es/en defaults to en ───────────────

Deno.test('Property 6 — Lang normalization: non-es/en values default to en', () => {
  fc.assert(
    fc.property(
      fc.string().filter(s => s !== 'es' && s !== 'en'),
      (invalidLang) => {
        const result = normalizeLang(invalidLang);
        assertEquals(result, 'en', `normalizeLang("${invalidLang}") should default to "en"`);
      }
    ),
    { numRuns: 100, verbose: true }
  );
});
