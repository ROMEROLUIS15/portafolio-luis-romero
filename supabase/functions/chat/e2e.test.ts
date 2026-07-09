/**
 * End-to-end tests — drive the deployed Edge Function against the real project.
 *
 * Run:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... CHAT_ORIGIN=... \
 *     deno test --config supabase/functions/deno.json --allow-env --allow-net \
 *       supabase/functions/chat/e2e.test.ts
 *
 * Skipped automatically when those env vars are absent, so `deno test` on the
 * whole folder stays green offline and in CI.
 *
 * Why these assertions and not just "HTTP 200":
 * the pipeline fails open. If the service_role key is revoked, the rate-limit
 * check, the cache and the logging all fail silently and the function still
 * answers 200. That happened in production and nobody noticed. A green status
 * code proves nothing here — so we assert that a row actually lands in
 * chat_logs, and that the answer is non-empty and free of markdown.
 */

import {
  assert,
  assertEquals,
  assertMatch,
  assertNotMatch,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ORIGIN            = Deno.env.get('CHAT_ORIGIN') ?? 'https://portafolio-luis-romero.vercel.app';

const CONFIGURED = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY);
const opts = { ignore: !CONFIGURED };

/** Unique suffix so every run misses the answer cache and exercises the LLM. */
const nonce = () => `e2e-${crypto.randomUUID().slice(0, 8)}`;

async function askChat(message: string, lang: 'es' | 'en', origin = ORIGIN) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/chat`, {
    method: 'POST',
    headers: {
      'Content-Type':    'application/json',
      'Origin':          origin,
      'x-session-token': crypto.randomUUID(),
    },
    body: JSON.stringify({ message, lang }),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function countChatLogs(): Promise<number> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/chat_logs?select=id`, {
    headers: {
      apikey:          SERVICE_ROLE_KEY,
      Authorization:   `Bearer ${SERVICE_ROLE_KEY}`,
      Prefer:          'count=exact',
      Range:           '0-0',
    },
  });
  // Content-Range looks like "0-0/123". Only the header matters, but the body
  // must still be drained or Deno's test runner reports a resource leak.
  const total = res.headers.get('content-range')?.split('/')[1];
  await res.body?.cancel();
  return Number(total ?? '0');
}

Deno.test('e2e — a fresh question is answered and logged', opts, async () => {
  const before = await countChatLogs();

  const { status, body } = await askChat(
    `Que lenguajes de programacion usa Luis? (${nonce()})`,
    'es'
  );

  assertEquals(status, 200);
  assert(typeof body.answer === 'string' && body.answer.length > 0, 'answer must not be empty');
  assert(Array.isArray(body.sources) && body.sources.length > 0, 'a grounded answer cites sources');

  // The write is fire-and-forget; give it a moment to land.
  await new Promise((r) => setTimeout(r, 2500));
  const after = await countChatLogs();

  assertEquals(
    after,
    before + 1,
    'chat_logs must gain a row — if it does not, service_role is broken and the ' +
      'function is failing open while still answering 200'
  );
});

Deno.test('e2e — answers contain no markdown (widget renders textContent)', opts, async () => {
  // gpt-oss loves markdown; the widget prints the answer verbatim. Ask something
  // that invites a list, which is when the model reaches for bullets and bold.
  const { status, body } = await askChat(
    `Enumera las tecnologias que domina Luis. (${nonce()})`,
    'es'
  );

  assertEquals(status, 200);
  assertNotMatch(body.answer, /\*\*|^#{1,6}\s|^\s*[-*]\s/m);
});

Deno.test('e2e — the domain guard-rail refuses unrelated questions', opts, async () => {
  const { status, body } = await askChat(
    `Cual es la capital de Francia y cuanto es 17*23? (${nonce()})`,
    'es'
  );

  assertEquals(status, 200);
  assertNotMatch(body.answer, /par[ií]s|391/i, 'must not answer general knowledge');
});

Deno.test('e2e — a disallowed origin is rejected before any work happens', opts, async () => {
  const { status } = await askChat('hola', 'es', 'https://evil.com');
  assertEquals(status, 403);
});

Deno.test('e2e — prefix-confusion origins are rejected', opts, async () => {
  // Regression guard for the startsWith() bug in isOriginAllowed.
  for (const origin of [
    'https://portafolio-luis-romero-x.evil.com',
    'http://localhost.evil.com',
  ]) {
    const { status } = await askChat('hola', 'es', origin);
    assertEquals(status, 403, `must reject origin: ${origin}`);
  }
});

Deno.test('e2e — a missing session token is a 400', opts, async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({ message: 'hola', lang: 'es' }),
  });
  assertEquals(res.status, 400);
  assertMatch((await res.json()).error, /invalid_session_token/);
});

Deno.test('e2e — an over-long message is a 422, without invoking the LLM', opts, async () => {
  const { status, body } = await askChat('a'.repeat(1001), 'es');
  assertEquals(status, 422);
  assertEquals(body.error, 'invalid_message');
  assertEquals(body.max_length, 1000);
});

Deno.test('e2e — the answer cache serves a repeat question faster', opts, async () => {
  const question = `Que experiencia tiene Luis con Docker? (${nonce()})`;

  const t0 = performance.now();
  const first = await askChat(question, 'es');
  const coldMs = performance.now() - t0;
  assertEquals(first.status, 200);

  // The cache write is fire-and-forget.
  await new Promise((r) => setTimeout(r, 2500));

  const t1 = performance.now();
  const second = await askChat(question, 'es');
  const warmMs = performance.now() - t1;

  assertEquals(second.status, 200);
  assertEquals(second.body.answer, first.body.answer, 'cache must return the same answer');
  assert(
    warmMs < coldMs,
    `cache hit (${warmMs.toFixed(0)}ms) should beat the cold path (${coldMs.toFixed(0)}ms)`
  );
});
