/**
 * End-to-end tests — drive the deployed Edge Function against the real project.
 *
 * Run:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... CHAT_ORIGIN=... \
 *     deno test --config supabase/functions/deno.json --allow-env --allow-net \
 *       supabase/functions/chat/e2e.test.ts
 *
 * `SUPABASE_URL` alone runs everything except the one case that reads chat_logs;
 * `SUPABASE_SERVICE_ROLE_KEY` adds that one; `GROQ_API_KEY` (reachable) adds the
 * two judge cases. Each gate skips rather than fails, so `deno test` on the whole
 * folder stays green offline — but see the note on the gates below: a skip that
 * nobody counts is indistinguishable from a pass.
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

// Imported, never redeclared: a private copy of this string would drift from the
// function's the moment the wording changes, and the drift is invisible — the
// suite would just stop recognising a busy agent and start failing on grounding.
import { BUSY_MESSAGE } from './lib.ts';

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ORIGIN            = Deno.env.get('CHAT_ORIGIN') ?? 'https://portafolio-luis-romero.vercel.app';

// Two gates, not one. Driving the deployed function needs nothing but its URL;
// only the chat_logs assertion needs the service_role key. Gating everything on
// both meant `agent-eval.yml` — which deliberately carries no service_role key —
// reported success while running 2 of 27 cases: every grounding case, every
// availability guard and every language check skipped, silently, for months.
const CONFIGURED    = Boolean(SUPABASE_URL);
const LOGS_READABLE = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY);
const opts    = { ignore: !CONFIGURED };
const logOpts = { ignore: !LOGS_READABLE };

/** Unique suffix so every run misses the answer cache and exercises the LLM. */
const nonce = () => `e2e-${crypto.randomUUID().slice(0, 8)}`;

// ─── Throttle ─────────────────────────────────────────────────────────────────
// The function allows 10 requests per minute per IP and this suite sends more
// than that. Without spacing, the later cases come back 429 and read as agent
// failures when they are really the rate limiter doing its job.

const MIN_GAP_MS = 6_500; // ~9 requests/minute, comfortably under the limit
let lastCallAt = 0;

async function throttle(): Promise<void> {
  const wait = lastCallAt + MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAt = Date.now();
}

/** Sends the request as-is. Callers are responsible for pacing. */
async function rawAsk(message: string, lang: 'es' | 'en', origin = ORIGIN) {
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

/**
 * Asks, and refuses to accept `BUSY_MESSAGE` as an answer.
 *
 * The suite's pacing was built for Supabase's 10 req/min. Groq's free tier is
 * the tighter budget: a full run sends a ~2.7k-token prompt per case, both
 * models hit their limit partway through, and the function soft-degrades to
 * BUSY_MESSAGE with HTTP 200 — by design. The first run of this file after the
 * gate was fixed showed five "grounding failures" that were all that message.
 * A grounding assertion against it says nothing about grounding, so wait for the
 * budget to come back instead, and if it does not, fail saying exactly that.
 */
const BUSY = new Set<string>(Object.values(BUSY_MESSAGE));
const BUSY_RETRIES    = 2;
const BUSY_BACKOFF_MS = 30_000;

async function askChat(message: string, lang: 'es' | 'en', origin = ORIGIN) {
  for (let attempt = 0; ; attempt++) {
    await throttle();
    const res = await rawAsk(message, lang, origin);

    if (typeof res.body?.answer !== 'string' || !BUSY.has(res.body.answer)) return res;

    if (attempt === BUSY_RETRIES) {
      throw new Error(
        'Groq is rate-limited on every model, so the agent answered BUSY_MESSAGE ' +
          `${BUSY_RETRIES + 1} times for: ${JSON.stringify(message)}. This is the free-tier ` +
          'token budget, not a grounding regression — re-run the eval later.'
      );
    }
    await new Promise((r) => setTimeout(r, BUSY_BACKOFF_MS * (attempt + 1)));
  }
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

Deno.test('e2e — a fresh question is answered and logged', logOpts, async () => {
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

  // Throttle outside the measurement: a pause inside it would dwarf the very
  // difference this test exists to detect.
  await throttle();
  const t0 = performance.now();
  const first = await rawAsk(question, 'es');
  const coldMs = performance.now() - t0;
  assertEquals(first.status, 200);

  // The cache write is fire-and-forget.
  await new Promise((r) => setTimeout(r, 2500));

  await throttle();
  const t1 = performance.now();
  const second = await rawAsk(question, 'es');
  const warmMs = performance.now() - t1;

  assertEquals(second.status, 200);
  assertEquals(second.body.answer, first.body.answer, 'cache must return the same answer');
  assert(
    warmMs < coldMs,
    `cache hit (${warmMs.toFixed(0)}ms) should beat the cold path (${coldMs.toFixed(0)}ms)`
  );
});

// ─── Grounding ────────────────────────────────────────────────────────────────
// What breaks here is retrieval, not the prompt. When Luis moved to Complexity,
// "where does he work?" kept answering with his client projects: the system
// prompt was fine, match_documents simply never surfaced the right chunk. A
// prompt-level evaluator would have passed that.
//
// Each case therefore drives the whole pipeline — embedding, vector search,
// prompt, model — and asserts on facts that have already gone stale once.

interface GroundingCase {
  name:          string;
  ask:           string;
  lang:          'es' | 'en';
  /** The answer has to contain this. */
  mustMatch?:    RegExp;
  /** And must never contain this — usually the superseded value. */
  mustNotMatch?: RegExp;
  /** Retrieval has to reach this source. */
  fromSource?:   RegExp;
}

const GROUNDING: GroundingCase[] = [
  {
    name:       'current employer (en)',
    ask:        'Where does Luis work right now?',
    lang:       'en',
    mustMatch:  /complexity/i,
  },
  {
    name:       'current employer (es)',
    ask:        'En que empresa trabaja Luis actualmente?',
    lang:       'es',
    mustMatch:  /complexity/i,
  },
  {
    name:         'linkedin url is the current one',
    ask:          'Cual es el LinkedIn de Luis?',
    lang:         'es',
    mustMatch:    /hernandezrs955/i,
    mustNotMatch: /luis-romero-dev-back15|15-luis-romero|luisromero15/i,
  },
  // The third-person case above passed while both of these failed. The URL lived
  // in exactly one chunk — the CV header — and it lost the top-6 on the phrasings
  // visitors actually use: "¿Cuál es tu LinkedIn?" and "What is your LinkedIn?"
  // both retrieved six chunks with the URL in none of them, and the agent said it
  // didn't have the detail. The profile-contact chunk carries the links for that
  // reason, the same way profile-availability carries the city.
  {
    name:         'linkedin url, asked in the second person (es)',
    ask:          'Cual es tu LinkedIn?',
    lang:         'es',
    mustMatch:    /hernandezrs955/i,
    mustNotMatch: /luis-romero-dev-back15|no tengo ese detalle|no tengo esa informaci[oó]n|solo puedo ayudar/i,
  },
  {
    name:         'linkedin url, asked in the second person (en)',
    ask:          'What is your LinkedIn profile?',
    lang:         'en',
    mustMatch:    /hernandezrs955/i,
    mustNotMatch: /luis-romero-dev-back15|don.t have that detail|can only help/i,
  },
  {
    name:         'location moved to Venezuela',
    ask:          'Donde vive Luis?',
    lang:         'es',
    mustMatch:    /m[ée]rida|venezuela/i,
    mustNotMatch: /barranquilla|colombia/i,
  },
  {
    name:         'phone is the Venezuelan number',
    ask:          'Cual es el telefono o WhatsApp de Luis?',
    lang:         'es',
    mustMatch:    /\+?\s?58[\s-]?424/,
    mustNotMatch: /\+?\s?57[\s-]?324/,
  },
  {
    name:       'knows the newest client project',
    ask:        'Que hizo Luis para Motosmax Cordialidad?',
    lang:       'es',
    mustMatch:  /taller|moto|whatsapp/i,
  },
  {
    name:       'knows the Complexity technical challenge',
    ask:        'Tell me about the Advanced Product Search API',
    lang:       'en',
    mustMatch:  /elasticsearch|search/i,
  },
  {
    name:         'Cronix test count is current',
    ask:          'Cuantos tests tiene Cronix?',
    lang:         'es',
    mustMatch:    /1[.,]?600/,
    mustNotMatch: /\b1[.,]?000\b/,
  },
  {
    name:       'knows the IBIME promotion',
    ask:        'What was Luis role at IBIME Connect?',
    lang:       'en',
    mustMatch:  /lead/i,
  },
  {
    // Found by the judge, not by these assertions: the agent knew *where* he
    // worked but not *since when*. The date lives in the CV, yet the
    // profile-availability chunk scores so high on employment questions that it
    // pushed the CV's EXPERIENCE chunk out of the top 6 entirely. The date now
    // lives in that winning chunk too.
    name:       'knows when he joined Complexity',
    ask:        'Since when has Luis been working at Complexity?',
    lang:       'en',
    mustMatch:  /july\s*2026|07\/2026|2026/i,
  },
  // Visitors address the assistant as if it were Luis, and both halves of that
  // broke at once in production. "¿Dónde vives?" retrieved six chunks, none of
  // them the CV header that carries the city, and the agent said it didn't have
  // the detail — the location now also lives in the profile-availability chunk,
  // which does rank on every phrasing. "¿Cuál es tu ubicación?" retrieved the
  // city and *still* refused, because the second person read as a question about
  // the assistant and tripped the off-topic guard-rail. The third-person case
  // above passed throughout: only asking the way visitors ask catches this.
  {
    name:         'location, asked in the second person',
    ask:          'Donde vives actualmente?',
    lang:         'es',
    mustMatch:    /m[ée]rida|venezuela/i,
    mustNotMatch: /no tengo ese detalle|no tengo esa informaci[oó]n/i,
  },
  {
    name:         'a second-person question is never treated as off-topic',
    ask:          'Cual es tu ubicacion?',
    lang:         'es',
    mustMatch:    /m[ée]rida|venezuela/i,
    mustNotMatch: /solo puedo ayudar/i,
  },
  {
    // "¿Cuánto tardaste?" used to get "no tengo ese detalle": the CV carried
    // date ranges but never a span, and the model would not do the arithmetic.
    // Kiura on purpose — it is the one closed range, so the expected number
    // never moves. Asserting a duration that is still running would fail this
    // suite every month for no reason other than the calendar.
    name:         'knows how long a finished engagement lasted',
    ask:          'Cuanto tiempo trabajaste en Kiura?',
    lang:         'es',
    mustMatch:    /\b9\b|nueve/i,
    mustNotMatch: /no tengo ese detalle|no tengo esa informaci[oó]n/i,
  },
];

for (const c of GROUNDING) {
  Deno.test(`e2e grounding — ${c.name}`, opts, async () => {
    const { status, body } = await askChat(`${c.ask} (${nonce()})`, c.lang);
    const answer: string = body.answer ?? '';

    assertEquals(status, 200);
    assert(answer.length > 0, 'answer must not be empty');

    if (c.mustMatch) {
      assertMatch(answer, c.mustMatch, `expected ${c.mustMatch} in: ${answer}`);
    }
    if (c.mustNotMatch) {
      assertNotMatch(answer, c.mustNotMatch, `stale value leaked into: ${answer}`);
    }
    if (c.fromSource) {
      const sources = (body.sources ?? []).join(', ');
      assertMatch(sources, c.fromSource, `retrieval missed the source, got: ${sources}`);
    }
  });
}

// ─── Availability, which the agent must not declare ───────────────────────────
// Deliberate product decision, not an oversight: Luis is employed and content.
// Saying he is available reads to his employer as one foot out the door; saying
// he is not cools off anyone who might approach him. The seed states neither,
// and the model used to fill that silence on its own — answering "he is
// available" in Spanish and "he isn't actively looking" in English on the same
// day. These guard that silence.

/**
 * True when some sentence *asserts* availability, rather than merely mentioning
 * it under a negation.
 *
 * A flat regex is not enough here. The correct answer — "Luis doesn't publish
 * his availability or indicate whether he's actively looking" — contains the
 * very words that would signal a violation, which failed this test on its first
 * run. Splitting into sentences and discarding the negated ones tells the two
 * cases apart without guessing at the model's phrasing.
 */
function declaresAvailability(answer: string, claim: RegExp, negation: RegExp): string | null {
  const offending = answer
    .split(/(?<=[.!?])\s+/)
    .find((sentence) => claim.test(sentence) && !negation.test(sentence));
  return offending ?? null;
}

Deno.test('e2e — never claims Luis is available or job-hunting (es)', opts, async () => {
  const { body } = await askChat(`Luis esta buscando trabajo? Esta disponible? (${nonce()})`, 'es');
  const answer: string = body.answer ?? '';

  const offending = declaresAvailability(
    answer,
    /\b(disponible|buscando\s+(trabajo|empleo)|abierto\s+a\s+(nuevas\s+)?oportunidades)\b/i,
    /\b(no|ni|sin|tampoco|whether|si\s+est[áa])\b/i
  );
  assertEquals(offending, null, `declares availability: ${offending}`);

  // It still has to be useful: point at a way to reach him.
  assertMatch(answer, /lueduar15@gmail\.com|whatsapp|\+?\s?58/i, `must offer a contact route: ${answer}`);
});

Deno.test('e2e — never claims Luis is available or job-hunting (en)', opts, async () => {
  const { body } = await askChat(`Is Luis available for hire? Is he looking for a job? (${nonce()})`, 'en');
  const answer: string = body.answer ?? '';

  const offending = declaresAvailability(
    answer,
    /\b(available|actively\s+(looking|seeking)|open\s+to\s+(new\s+)?(opportunities|roles|positions))\b/i,
    /\b(not|n[’']?t|never|whether|nor|without|doesn|does\s+not)\b/i
  );
  assertEquals(offending, null, `declares availability: ${offending}`);

  assertMatch(answer, /lueduar15@gmail\.com|whatsapp|\+?\s?58/i, `must offer a contact route: ${answer}`);
});

// ─── Language ─────────────────────────────────────────────────────────────────
// Property 5/6.2: the reply follows the requested language, not the language the
// retrieved chunks happen to be in.

const ES_MARKERS = /\b(el|la|los|las|de|que|con|para|su|es|en)\b/gi;
const EN_MARKERS = /\b(the|of|and|with|for|his|is|in|to)\b/gi;

Deno.test('e2e — a Spanish request is answered in Spanish', opts, async () => {
  const { body } = await askChat(`Resume brevemente la experiencia de Luis. (${nonce()})`, 'es');
  const answer: string = body.answer ?? '';

  const es = (answer.match(ES_MARKERS) ?? []).length;
  const en = (answer.match(EN_MARKERS) ?? []).length;
  assert(es > en, `expected Spanish, got (es=${es}, en=${en}): ${answer}`);
});

Deno.test('e2e — an English request is answered in English', opts, async () => {
  const { body } = await askChat(`Briefly summarise Luis's experience. (${nonce()})`, 'en');
  const answer: string = body.answer ?? '';

  const es = (answer.match(ES_MARKERS) ?? []).length;
  const en = (answer.match(EN_MARKERS) ?? []).length;
  assert(en > es, `expected English, got (es=${es}, en=${en}): ${answer}`);
});

// ─── LLM-as-judge ─────────────────────────────────────────────────────────────
// Only for what a regex cannot decide: whether the answer actually answers.
// Uses the small model already in the fallback chain — same free tier, no extra
// key — and runs only when GROQ_API_KEY is present, so the suite above stays
// usable without it.

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY') ?? '';

/**
 * Groq is not reachable from every network: it answers 403 "Access denied" to
 * some IPs while the deployed function, running inside Supabase's network,
 * reaches it fine. A judge that cannot run is not a failing agent, so probe once
 * and skip instead of reporting red for something the agent did not do.
 */
async function groqReachable(): Promise<boolean> {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
    });
    await res.body?.cancel();
    if (!res.ok) console.warn(`[e2e] judge disabled — Groq unreachable (HTTP ${res.status})`);
    return res.ok;
  } catch (err) {
    console.warn(`[e2e] judge disabled — Groq unreachable (${(err as Error).message})`);
    return false;
  }
}

// Deliberately not gated on CONFIGURED: judging only needs to ask the deployed
// function a question and grade the reply, so SUPABASE_URL and GROQ_API_KEY are
// enough. Keeping service_role out of the requirement is what lets these two run
// in CI without putting that key in a public repo's secrets.
const JUDGE_READY = SUPABASE_URL && GROQ_API_KEY ? await groqReachable() : false;
const judgeOpts = { ignore: !JUDGE_READY };

async function judge(question: string, answer: string, criterion: string): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model:                 'openai/gpt-oss-20b',
      temperature:           0,
      max_completion_tokens: 200,
      reasoning_effort:      'low',
      messages: [
        {
          role: 'system',
          content:
            'You grade one answer against one criterion. Reply with exactly ' +
            '"PASS" or "FAIL: <reason in under 15 words>". Nothing else.',
        },
        {
          role: 'user',
          content: `CRITERION: ${criterion}\n\nQUESTION: ${question}\n\nANSWER: ${answer}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    await res.body?.cancel();
    return `FAIL: judge unavailable (HTTP ${res.status})`;
  }
  const data = await res.json();
  return (data.choices?.[0]?.message?.content ?? '').trim();
}

Deno.test('e2e judge — answers the question actually asked', judgeOpts, async () => {
  const question = 'What does Luis do at Complexity, and since when?';
  const { body } = await askChat(`${question} (${nonce()})`, 'en');

  const verdict = await judge(
    question,
    body.answer ?? '',
    'The answer names Complexity, says what he does there, and gives a start date ' +
      'or duration. It must not hedge or redirect without answering.'
  );
  assertMatch(verdict, /^PASS/, `judge said: ${verdict}`);
});

Deno.test('e2e judge — declines gracefully when it lacks the fact', judgeOpts, async () => {
  const question = 'What is the exact salary Luis earns at Complexity?';
  const { body } = await askChat(`${question} (${nonce()})`, 'en');

  // The criterion covers one thing on purpose. An earlier version added
  // "and ideally offers a way to contact Luis"; the judge read "ideally" as a
  // requirement and failed a correct answer. A criterion with an optional
  // clause is a criterion the judge will enforce anyway.
  const verdict = await judge(
    question,
    body.answer ?? '',
    'The answer does NOT invent, estimate or guess a salary figure. It states ' +
      'plainly that it does not have that information.'
  );
  assertMatch(verdict, /^PASS/, `judge said: ${verdict}`);
});
