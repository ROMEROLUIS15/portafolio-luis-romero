/**
 * Edge Function — unit + property-based tests
 * Feature: portfolio-conversational-agent
 *
 * Run: deno test --config supabase/functions/deno.json --allow-env --allow-net \
 *        supabase/functions/chat/chat.test.ts
 *
 * Everything under test is imported from ./lib.ts. Nothing is reimplemented here:
 * an earlier version of this file kept private copies of isValidMessage,
 * buildSystemPrompt and friends, which silently drifted from the real code (a
 * 500-char limit against the real 1000, assertions against a system prompt that
 * had been rewritten). Those tests passed while verifying dead code.
 */

// @ts-ignore — fast-check via esm.sh
import fc from 'https://esm.sh/fast-check@3.20.0';
import {
  assert,
  assertEquals,
  assertNotEquals,
  assertMatch,
  assertRejects,
  assertStringIncludes,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';

import {
  GROQ_MAX_TOKENS,
  GROQ_MODELS,
  GroqEmptyCompletionError,
  GroqRateLimitError,
  MAX_MESSAGE_LENGTH,
  META_PREFIXES,
  SIMILARITY_THRESHOLD,
  buildAllowedOrigins,
  buildCorsHeaders,
  buildSystemPrompt,
  cacheKey,
  callGroqWithFallback,
  isOriginAllowed,
  isValidMessage,
  isValidUUIDv4,
  normalizeLang,
  normalizeMessage,
  sha256hex,
  shouldUseFallback,
  stripMetaPrefix,
  type ChunkResult,
} from './lib.ts';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function chunk(similarity: number, overrides: Partial<ChunkResult> = {}): ChunkResult {
  return {
    id: 1n,
    content: 'Luis Romero is an AI Engineer.',
    source: 'cv.md',
    lang: 'en',
    similarity,
    ...overrides,
  };
}

/** Builds a fetch stub that replays a queued response per call, recording models. */
function stubFetch(
  queue: Array<{ status: number; body: unknown }>
): { fetchImpl: typeof fetch; modelsCalled: string[] } {
  const modelsCalled: string[] = [];
  let i = 0;

  const fetchImpl = ((_url: string | URL | Request, init?: RequestInit) => {
    modelsCalled.push(JSON.parse(String(init?.body)).model);
    const next = queue[i++];
    if (!next) throw new Error('stubFetch: more calls than queued responses');
    return Promise.resolve(
      new Response(JSON.stringify(next.body), { status: next.status })
    );
  }) as unknown as typeof fetch;

  return { fetchImpl, modelsCalled };
}

const okBody = (content: string) => ({
  choices: [{ message: { content }, finish_reason: 'stop' }],
});

// ─── Property 1: message validation ───────────────────────────────────────────

Deno.test('Property 1 — Messages outside 1..MAX_MESSAGE_LENGTH are rejected', () => {
  assertEquals(isValidMessage(''), false);
  assertEquals(isValidMessage('a'.repeat(MAX_MESSAGE_LENGTH + 1)), false);
  assertEquals(isValidMessage(undefined), false);
  assertEquals(isValidMessage(null), false);
  assertEquals(isValidMessage(42), false);

  fc.assert(
    fc.property(
      fc.string({ minLength: MAX_MESSAGE_LENGTH + 1, maxLength: MAX_MESSAGE_LENGTH + 200 }),
      (tooLong) => assertEquals(isValidMessage(tooLong), false)
    ),
    { numRuns: 50 }
  );
});

Deno.test('Property 1 — Messages of 1..MAX_MESSAGE_LENGTH chars are accepted', () => {
  // Boundary: the real limit is 1000, not the 500 the old test asserted.
  assertEquals(isValidMessage('a'), true);
  assertEquals(isValidMessage('a'.repeat(MAX_MESSAGE_LENGTH)), true);

  fc.assert(
    fc.property(
      fc.string({ minLength: 1, maxLength: MAX_MESSAGE_LENGTH }),
      (msg) => assertEquals(isValidMessage(msg), true)
    ),
    { numRuns: 100 }
  );
});

// ─── Property 3: session token validation ─────────────────────────────────────

Deno.test('Property 3 — Invalid session tokens rejected', () => {
  for (const bad of ['', 'not-a-uuid', '123', null, undefined,
    '00000000-0000-0000-0000-000000000000']) {
    assertEquals(isValidUUIDv4(bad as string), false, `should reject: ${bad}`);
  }
});

Deno.test('Property 3 — Valid UUID v4 tokens accepted', () => {
  fc.assert(
    fc.property(fc.uuidV(4), (id: string) => assertEquals(isValidUUIDv4(id), true)),
    { numRuns: 100 }
  );
});

// ─── Property 4: retrieval threshold ──────────────────────────────────────────

Deno.test('Property 4 — Empty or low-similarity chunks trigger fallback', () => {
  assertEquals(shouldUseFallback([]), true);

  fc.assert(
    fc.property(
      fc.array(fc.double({ min: 0, max: SIMILARITY_THRESHOLD - 0.0001, noNaN: true }),
        { minLength: 1, maxLength: 5 }),
      (sims) => assertEquals(shouldUseFallback(sims.map((s) => chunk(s))), true)
    ),
    { numRuns: 100 }
  );
});

Deno.test('Property 4 — Any chunk at or above the threshold reaches the LLM', () => {
  fc.assert(
    fc.property(
      fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 0, maxLength: 4 }),
      fc.double({ min: SIMILARITY_THRESHOLD, max: 1, noNaN: true }),
      (noise, strong) => {
        const chunks = [...noise, strong].map((s) => chunk(s));
        assertEquals(shouldUseFallback(chunks), false);
      }
    ),
    { numRuns: 100 }
  );
});

// ─── Property 5 & 6: system prompt ────────────────────────────────────────────

Deno.test('Property 5 — System prompt language matches request lang', () => {
  const chunks = [chunk(0.9)];
  assertStringIncludes(buildSystemPrompt(chunks, 'es'), 'Responde siempre en español');
  assertStringIncludes(buildSystemPrompt(chunks, 'en'), 'Always respond in English');
});

Deno.test('Property 6 — System prompt always restricts the agent to Luis Romero', () => {
  fc.assert(
    fc.property(
      fc.constantFrom<'es' | 'en'>('es', 'en'),
      fc.array(fc.string({ maxLength: 80 }), { minLength: 1, maxLength: 4 }),
      (lang, contents) => {
        const prompt = buildSystemPrompt(contents.map((c) => chunk(0.9, { content: c })), lang);
        assertStringIncludes(prompt, 'Luis Romero');
        assertMatch(prompt, /NUNCA inventes|NEVER invent/);
      }
    ),
    { numRuns: 50 }
  );
});

Deno.test('Property 6 — System prompt forbids markdown (widget renders textContent)', () => {
  // Regression guard: gpt-oss emits markdown freely, and the widget prints the
  // answer verbatim, so "### Title" and "**bold**" would reach the user literally.
  assertMatch(buildSystemPrompt([chunk(0.9)], 'es'), /NUNCA uses markdown/);
  assertMatch(buildSystemPrompt([chunk(0.9)], 'en'), /NEVER use markdown/);
});

Deno.test('Property 6 — Lang normalization: non-es/en values default to en', () => {
  fc.assert(
    fc.property(fc.anything(), (v) => {
      const out = normalizeLang(v);
      assert(out === 'es' || out === 'en');
      if (v !== 'es') assertEquals(out, 'en');
    }),
    { numRuns: 100 }
  );
});

// ─── Property 7: message hashing ──────────────────────────────────────────────

Deno.test('Property 7 — Message stored as SHA-256 hash, never plaintext', async () => {
  const message = 'Cuál es el email de Luis?';
  const hash = await sha256hex(message);

  assertMatch(hash, /^[0-9a-f]{64}$/);
  assertNotEquals(hash, message);
  assertEquals(hash, await sha256hex(message)); // deterministic
  assertNotEquals(hash, await sha256hex(message + '.'));
});

// ─── stripMetaPrefix ──────────────────────────────────────────────────────────

Deno.test('stripMetaPrefix — removes meta lead-ins and recapitalises', () => {
  const cases: Array<[string, string]> = [
    ['Según la información proporcionada, Luis usa Deno.', 'Luis usa Deno.'],
    ['Basándome en el contexto: trabaja en Cronix.', 'Trabaja en Cronix.'],
    ['Based on the provided context, Luis is an engineer.', 'Luis is an engineer.'],
    ['According to the information, he uses Deno.', 'He uses Deno.'],
    ['From the data provided, he ships fast.', 'He ships fast.'],
  ];
  for (const [input, expected] of cases) {
    assertEquals(stripMetaPrefix(input), expected, `failed on: ${input}`);
  }
});

Deno.test('stripMetaPrefix — leaves clean answers untouched', () => {
  for (const clean of [
    'Luis Romero es AI Engineer.',
    'Segunda opción: usar Redis.',   // "Segun" is a prefix of "Segunda" — must not match
    'According to Luis, Deno is great.', // "According to Luis" is not a meta lead-in
    // Regression: recapitalisation used to run even when nothing was stripped,
    // so an answer that is just a link came back as "Linkedin.com/…".
    'linkedin.com/in/luis-romero-dev-back15',
    'lueduar15@gmail.com es su correo.',
    'pgvector con índice HNSW.',
  ]) {
    assertEquals(stripMetaPrefix(clean), clean, `mangled: ${clean}`);
  }
});

Deno.test('stripMetaPrefix — a stripped lead-in never recapitalises a link or email', () => {
  const cases: Array<[string, string]> = [
    [
      'Según la información proporcionada, lueduar15@gmail.com es su correo.',
      'lueduar15@gmail.com es su correo.',
    ],
    [
      'Based on the provided context, linkedin.com/in/luis-romero-dev-back15 is his profile.',
      'linkedin.com/in/luis-romero-dev-back15 is his profile.',
    ],
    [
      'According to the information, https://cronix-app.vercel.app is the demo.',
      'https://cronix-app.vercel.app is the demo.',
    ],
  ];
  for (const [input, expected] of cases) {
    assertEquals(stripMetaPrefix(input), expected, `failed on: ${input}`);
  }
});

Deno.test('stripMetaPrefix — an answer with no lead-in is returned verbatim', () => {
  fc.assert(
    fc.property(fc.string(), (s) => {
      const out = stripMetaPrefix(s);
      // Nothing to strip ⇒ the only permitted change is dropping leading blanks.
      if (out !== s.trimStart()) {
        assert(
          META_PREFIXES.some((re) => re.test(s.trimStart())),
          `mutated an answer that had no meta lead-in: ${JSON.stringify(s)}`,
        );
      }
    }),
    { numRuns: 200 }
  );
});

Deno.test('stripMetaPrefix — never returns an empty string', () => {
  fc.assert(
    fc.property(fc.string(), (s) => {
      const out = stripMetaPrefix(s);
      if (s.trim().length > 0) assert(out.length > 0);
    }),
    { numRuns: 100 }
  );
});

// ─── normalizeMessage / cacheKey ──────────────────────────────────────────────

Deno.test('normalizeMessage — accents, punctuation and spacing collapse to one key', () => {
  assertEquals(normalizeMessage('¿Está disponible?'), 'esta disponible');
  assertEquals(normalizeMessage('ESTA   disponible!!'), 'esta disponible');
  assertEquals(normalizeMessage('  ¡Está,  Disponible!  '), 'esta disponible');
});

Deno.test('cacheKey — same question in different shapes hits the same key', async () => {
  const a = await cacheKey('¿Está disponible?', 'es');
  const b = await cacheKey('esta disponible', 'es');
  assertEquals(a, b);
});

Deno.test('cacheKey — language is part of the key', async () => {
  assertNotEquals(await cacheKey('same text', 'es'), await cacheKey('same text', 'en'));
});

Deno.test('cacheKey — normalization is idempotent', () => {
  fc.assert(
    fc.property(fc.string(), (s) => {
      const once = normalizeMessage(s);
      assertEquals(normalizeMessage(once), once);
    }),
    { numRuns: 100 }
  );
});

// ─── isOriginAllowed ──────────────────────────────────────────────────────────

Deno.test('isOriginAllowed — allows production, previews and localhost', () => {
  const allowed = buildAllowedOrigins('');
  for (const ok of [
    'https://portafolio-luis-romero.vercel.app',
    'https://portafolio-luis-romero-abc123.vercel.app',
    'https://romeroluis15.github.io',
    'http://localhost:5500',
    'http://127.0.0.1:8080',
  ]) {
    assertEquals(isOriginAllowed(ok, allowed), true, `should allow: ${ok}`);
  }
});

Deno.test('isOriginAllowed — rejects null, look-alikes and unknown hosts', () => {
  const allowed = buildAllowedOrigins('');
  for (const bad of [
    null,
    '',
    'https://evil.com',
    'https://portafolio-luis-romero.vercel.app.evil.com',
    'https://romeroluis15.github.io.evil.com',
    // Prefix-confusion attacks: each of these begins with a string we allow.
    // A startsWith() guard would let all four through.
    'http://localhost.evil.com',
    'http://localhostx.evil.com',
    'http://127.0.0.1.evil.com',
    'https://portafolio-luis-romero-x.evil.com',
  ]) {
    assertEquals(isOriginAllowed(bad, allowed), false, `should reject: ${bad}`);
  }
});

Deno.test('isOriginAllowed — extra origins come from the env list', () => {
  const allowed = buildAllowedOrigins('https://custom.dev, https://other.dev');
  assertEquals(isOriginAllowed('https://custom.dev', allowed), true);
  assertEquals(isOriginAllowed('https://other.dev', allowed), true);
  assertEquals(isOriginAllowed('https://nope.dev', allowed), false);
});

Deno.test('buildCorsHeaders — echoes allowed origin, blanks a rejected one', () => {
  const allowed = buildAllowedOrigins('');
  assertEquals(
    buildCorsHeaders('https://romeroluis15.github.io', allowed)['Access-Control-Allow-Origin'],
    'https://romeroluis15.github.io'
  );
  assertEquals(
    buildCorsHeaders('https://evil.com', allowed)['Access-Control-Allow-Origin'],
    ''
  );
});

// ─── callGroqWithFallback ─────────────────────────────────────────────────────

Deno.test('callGroqWithFallback — returns the primary model answer on success', async () => {
  const { fetchImpl, modelsCalled } = stubFetch([{ status: 200, body: okBody('hola') }]);
  const out = await callGroqWithFallback('sys', 'msg', { apiKey: 'k', fetchImpl });

  assertEquals(out, 'hola');
  assertEquals(modelsCalled, [GROQ_MODELS[0]]);
});

Deno.test('callGroqWithFallback — a 429 falls through to the next model', async () => {
  const { fetchImpl, modelsCalled } = stubFetch([
    { status: 429, body: { error: 'rate limited' } },
    { status: 200, body: okBody('desde el fallback') },
  ]);
  const out = await callGroqWithFallback('sys', 'msg', { apiKey: 'k', fetchImpl });

  assertEquals(out, 'desde el fallback');
  assertEquals(modelsCalled, [GROQ_MODELS[0], GROQ_MODELS[1]]);
});

Deno.test('callGroqWithFallback — an empty completion falls through to the next model', async () => {
  // A reasoning model can spend the whole budget on its chain-of-thought and
  // return content: "". That must not surface as a blank chat bubble.
  const { fetchImpl, modelsCalled } = stubFetch([
    { status: 200, body: { choices: [{ message: { content: '' }, finish_reason: 'length' }] } },
    { status: 200, body: okBody('respuesta real') },
  ]);
  const out = await callGroqWithFallback('sys', 'msg', { apiKey: 'k', fetchImpl });

  assertEquals(out, 'respuesta real');
  assertEquals(modelsCalled, [GROQ_MODELS[0], GROQ_MODELS[1]]);
});

Deno.test('callGroqWithFallback — whitespace-only content counts as empty', async () => {
  const { fetchImpl } = stubFetch([
    { status: 200, body: okBody('   \n  ') },
    { status: 200, body: okBody('real') },
  ]);
  assertEquals(await callGroqWithFallback('sys', 'msg', { apiKey: 'k', fetchImpl }), 'real');
});

Deno.test('callGroqWithFallback — every model rate limited propagates GroqRateLimitError', async () => {
  const { fetchImpl, modelsCalled } = stubFetch([
    { status: 429, body: { error: 'rate limited' } },
    { status: 429, body: { error: 'rate limited' } },
  ]);
  await assertRejects(
    () => callGroqWithFallback('sys', 'msg', { apiKey: 'k', fetchImpl }),
    GroqRateLimitError
  );
  assertEquals(modelsCalled.length, GROQ_MODELS.length);
});

Deno.test('callGroqWithFallback — every model empty also throws, never returns ""', async () => {
  const { fetchImpl } = stubFetch([
    { status: 200, body: okBody('') },
    { status: 200, body: okBody('') },
  ]);
  await assertRejects(() => callGroqWithFallback('sys', 'msg', { apiKey: 'k', fetchImpl }));
});

Deno.test('callGroqWithFallback — a non-429 error aborts without trying the next model', async () => {
  const { fetchImpl, modelsCalled } = stubFetch([
    { status: 401, body: { error: 'invalid api key' } },
  ]);
  await assertRejects(
    () => callGroqWithFallback('sys', 'msg', { apiKey: 'bad', fetchImpl }),
    Error,
    'Groq API error: 401'
  );
  assertEquals(modelsCalled, [GROQ_MODELS[0]], 'must not burn the fallback on an auth error');
});

Deno.test('callGroqWithFallback — sends reasoning params gpt-oss needs', async () => {
  let sent: Record<string, unknown> = {};
  const fetchImpl = ((_u: unknown, init?: RequestInit) => {
    sent = JSON.parse(String(init?.body));
    return Promise.resolve(new Response(JSON.stringify(okBody('ok')), { status: 200 }));
  }) as unknown as typeof fetch;

  await callGroqWithFallback('sys', 'msg', { apiKey: 'k', fetchImpl });

  assertEquals(sent.max_completion_tokens, GROQ_MAX_TOKENS);
  assertEquals(sent.reasoning_effort, 'low');
  assertEquals(sent.temperature, 0.3);
  assertEquals((sent as { max_tokens?: number }).max_tokens, undefined);
});

Deno.test('GroqEmptyCompletionError is distinct from GroqRateLimitError', () => {
  assert(new GroqEmptyCompletionError('x') instanceof Error);
  assert(!(new GroqEmptyCompletionError('x') instanceof GroqRateLimitError));
});
