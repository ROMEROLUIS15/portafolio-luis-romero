# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Luis Romero's personal portfolio: a static, framework-free site (HTML/CSS/vanilla JS, no build step) plus a
production RAG conversational agent running on Supabase Edge Functions (Deno) with Groq as the LLM.
Everything runs on free tiers by design — Supabase free tier + Groq free tier, $0 total. Keep it that way
when proposing changes.

The RAG pipeline is hand-written: no LangChain / LlamaIndex / orchestration framework. Just `fetch` against
the provider APIs.

## Commands

```bash
npm test                 # Widget tests — Vitest + jsdom + fast-check (27 tests)
npm run test:watch       # Same, in watch mode
npm run test:edge        # Edge Function unit + property tests — Deno, over lib.ts (33 tests)
npm run test:db          # pgTAP RLS tests — requires Docker + `supabase start` first
npm run test:e2e         # Agent evaluation against the deployed project (see below) — 15 tests
npm run test:all         # test + test:edge + test:db

npm run ingest           # Rebuild the vector store from the CV markdown + cronix-stats.json
npm run seed:availability  # Idempotent: (re)insert the availability fact
npm run dedupe           # Remove duplicate rows from `documents`

npm run deploy:chat      # supabase functions deploy chat  --no-verify-jwt
npm run deploy:embed     # supabase functions deploy embed
npm run db:migrate       # supabase db push
```

Run a single test:

```bash
npx vitest run -t "panel opens when bubble is clicked"
deno test --config supabase/functions/deno.json --allow-env --allow-net \
  supabase/functions/chat/chat.test.ts --filter "buildSystemPrompt"
```

The site itself has no build: open `index.html`, or use VS Code Live Server (configured on port 5502).

`npm run deploy:*` and `db:migrate` hardcode `--project-ref dsrxcqjivhvhvpqumcvb` in `package.json`.
The Deno/Supabase CLIs are expected on PATH; Node is only used to run Vitest.

**There is no linter and no formatter** — no ESLint, no Prettier, no `npm run lint`. Match the surrounding
style by reading it. `npx vitest run --coverage` is the only quality gate beyond the tests: `vitest.config.js`
instruments **`chat-widget.js` only** and fails under 75% line coverage, and it excludes `supabase/**` — that
exclusion is why `npm test` doesn't try to run the Deno tests as Vitest suites.

## Architecture

### Three runtimes, one repo

| Code | Runtime | Notes |
|------|---------|-------|
| `assets/js/*.js` | Browser | No modules, no bundler — plain `<script>` tags, IIFEs |
| `supabase/functions/**`, `scripts/*.ts` | Deno | ESM via `https://esm.sh/...` URLs, `Deno.env` |
| `assets/js/chat-widget.test.js` | Node (Vitest) | Loads the browser IIFE with `new Function(src)` |

`supabase/functions/deno.json` scopes Deno to that folder. Without it Deno walks up to the root
`package.json`, picks up the Node toolchain, and fails resolving `npm:@types/node`.

Because the widget tests execute `chat-widget.js` through `new Function()`, the widget must stay a
self-contained IIFE with no ESM syntax and no import of anything — adding `import`/`export` breaks the whole
Vitest suite, not just one test.

### The chat Edge Function: `lib.ts` vs `index.ts`

`supabase/functions/chat/lib.ts` holds all pure logic with **zero module-level side effects** — no
`Deno.env` reads, no Supabase clients. `index.ts` is only wiring: env, clients, orchestration, HTTP.
`chat.test.ts` imports the exact same functions from `lib.ts`.

Never reimplement logic inside a test file. An earlier version kept private copies of `isValidMessage`,
`buildSystemPrompt` etc.; they drifted from the real code (asserting a 500-char limit against the real 1000,
asserting a system prompt that had since been rewritten) and passed while verifying dead code.

**`lib.ts` constants are the source of truth**, not the README (whose numbers have gone stale): similarity
threshold `0.75`, max message `1000` chars, `RAG_MATCH_COUNT` 6, `MAX_CHUNK_CHARS` 2100, Groq models
`openai/gpt-oss-120b` → `openai/gpt-oss-20b`, cache TTL 7 days. (One stale copy still says otherwise and is
wrong: `scripts/ingest.ts` comments about a "1600-char cap" that is now 2100. The widget's `errorInvalidMsg`
was a second one — it said "500 characters" while enforcing 1000 — and now states 1000 in both languages.)

### Request pipeline

```
CORS preflight → origin guard (403) → session token UUID v4 (400) → body validation (422)
  → rate limit, 10/min/IP (429)
  → answer cache lookup, sha256(lang + normalized message) — hit short-circuits everything below
  → embedding via the `embed` Edge Function (Supabase gte-small, 384 dims, free)
  → match_documents() RPC, top-6, language-prioritized then cosine
  → below threshold? FALLBACK without calling the LLM (cached — it's deterministic)
  → buildSystemPrompt → callGroqWithFallback → stripMetaPrefix → stripMarkdown
  → write cache + log (fire-and-forget) → { answer, sources }
```

Two Edge Functions must both be deployed: `chat` and `embed`. `chat` calls `embed` over HTTP with the anon
key — deploying only one leaves the pipeline broken.

`callGroqWithFallback` walks `GROQ_MODELS` in order: each model has its own rate-limit bucket, so a 429 or an
empty completion (a reasoning model can burn the entire token budget on chain-of-thought) falls through to
the next. Only if every model is rate-limited does the request degrade to `BUSY_MESSAGE` — returned with
HTTP 200 and deliberately *not* cached.

`stripMetaPrefix` and `stripMarkdown` are deterministic safety nets for models that ignore the prompt — one
for answers opening with "Based on the provided context…", the other for the markdown both prompts forbid and
gpt-oss emits anyway (a production answer read `**Motosmax Cordialidad**`; the widget renders answers verbatim
as `textContent`, so the asterisks are what the visitor sees). `stripMarkdown` iterates to a fixed point, so
it is idempotent, and every rule needs a matched pair or a line-start anchor — `17*23`, `chat_logs` and
`gpt-oss-120b` come out untouched.

A poisoned answer outlives the fix by up to the 7-day cache TTL. After changing anything that shapes the
answer text, sweep `chat_cache` for rows that still carry the old shape and delete them by `cache_key`; nine
of forty-three rows had to go on the markdown fix alone.

### The pipeline fails open — HTTP 200 proves nothing

Rate limiting, the answer cache and logging all swallow their errors and continue. If the `service_role` key
is revoked, all three fail silently and the function still answers 200. That happened in production and went
unnoticed. This is why `e2e.test.ts` asserts that a **new row lands in `chat_logs`**, that the answer is
non-empty and that it contains no markdown — never just a status code. Preserve that property when touching
the E2E tests.

### Agent evaluation: `e2e.test.ts`

This is the agent's eval suite, not a smoke test. It drives the **deployed** function and grades the whole
pipeline — embedding, vector search, prompt, model — in four layers:

- **Contract**: status codes, logging, cache-hit is faster and identical, origin guard, no markdown.
- **Grounding** (the `GROUNDING` table): facts that have already gone stale once — current employer, start
  date, LinkedIn URL, city, phone, newest client project, Cronix test count. What breaks is *retrieval*, not
  the prompt: when Luis moved to Complexity, "where does he work?" kept answering with client projects
  because `match_documents` never surfaced the right chunk. **When a CV fact changes, add or update a case
  here** — a prompt-level evaluator would pass that bug.
  **Phrase cases the way visitors actually type**, which is the second person, addressing the assistant as if
  it were Luis. Every case here asked "Donde vive Luis?" and passed while "¿Cuál es tu ubicación?" was
  answered with the off-topic guard-rail ("solo puedo ayudar con información sobre Luis") — the retrieval was
  fine, the model just read "tu" as being about itself. Both prompts now say those questions are about Luis,
  and the table carries two second-person cases.
- **Availability**: see the product decision below. `declaresAvailability()` splits into sentences and drops
  negated ones; a flat regex fails the *correct* answer, since it contains the same words.
- **LLM-as-judge**: two cases only, for what a regex cannot decide (does the answer actually answer). Uses
  `gpt-oss-20b` from the same free tier. Keep judge criteria single-clause — an "and ideally…" clause gets
  enforced as a requirement and fails correct answers.

Env vars, each gate skipping instead of failing: `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` enable
everything, `SUPABASE_URL` + `GROQ_API_KEY` (reachable) enable the judge, `CHAT_ORIGIN` overrides the origin.
The suite self-throttles to ~9 req/min because the function allows 10 — it takes minutes, and removing the
pacing turns the later cases into 429s that read as agent failures.

**Groq answers 403 to Luis's VPN exit IP, and the VPN is not optional for him**, so the judge cases cannot run
from his machine. `.github/workflows/agent-eval.yml` (manual `workflow_dispatch`) runs the suite from a GitHub
runner for exactly that reason. It deliberately carries no `SUPABASE_SERVICE_ROLE_KEY` — the `chat_logs`
tests skip themselves rather than put the most powerful key in a public repo's secrets. Tests reported as
"ignored" there are that, not failures.

### Origin guard

`isOriginAllowed` matches with anchored regexes on purpose: a bare `startsWith()` would admit
`http://localhost.evil.com` and `https://portafolio-luis-romero-x.evil.com`. `HARDCODED_ORIGINS` in `lib.ts`
is always allowed on top of the `ALLOWED_ORIGINS` secret; Vercel preview deployments are matched by pattern.

### Database

Migrations `001`–`005` in `supabase/migrations/`, applied with `npm run db:migrate`. Tables: `documents`
(vector(384) + HNSW, public read / service_role insert), `rate_limits`, `chat_logs`, `chat_cache` — the last
three are RLS-enabled with **no policies at all**, i.e. deny-all for `anon`; only the Edge Function touches
them via `service_role`, which bypasses RLS.

Migration `005` exists because `rate_limits` was created without RLS and only had it in production thanks to
Supabase's `rls_auto_enable` event trigger — a fresh project provisioned from these migrations alone would
have let visitors reset their own counters. Assume nothing about implicit platform behaviour in new
migrations.

A `SELECT` under deny-all RLS returns zero rows rather than raising; `supabase/tests/rls.test.sql` asserts by
counting rows, not by expecting errors.

### Knowledge base and ingestion

`scripts/ingest.ts` reads `LuisRomero_CV_ATS_EN.md`, `LuisRomero_CV_ATS_ES.md` and `cronix-stats.json` — the
hand-curated markdown CVs, **not** the PDFs in `assets/images/` (PDF extraction produced noisy, duplicated,
out-of-date chunks). The README's structure section still claims the PDFs; it's stale. Editing those two
markdown files is how you change what the agent knows — then re-run `npm run ingest`.

Both CV markdown files are **git-ignored** (`.gitignore:21-22`) because they carry personal contact details.
They exist only in the local working copy, so a fresh clone cannot run `npm run ingest`, and `git status`
will never show changes to them — verify edits to them by reading the file, not through git.

`ingest.ts` is idempotent: it deletes the existing rows for each source before inserting the new chunks, so
re-running it is safe and does not duplicate. `seed-availability.ts` behaves the same way. `npm run dedupe`
exists because an earlier version of the ingest used plain INSERTs and left duplicates behind; it is a repair
tool, not a required follow-up step.

Note that ingest only clears the sources it is about to write. Rows from other sources — currently
`profile-availability`, inserted by `seed-availability.ts` — survive a re-ingest and must be maintained
separately.

### The agent must never declare availability

Product decision, not an oversight. Luis is employed at Complexity and happy there: saying he is available
reads to his employer as one foot out the door, saying he is not cools off anyone who might approach him. The
`profile-availability` seed therefore states the situation and a contact channel, and qualifies nothing — no
"open to new opportunities", no list of what he accepts. The model used to fill that silence on its own
(answering "available" in Spanish and "not actively looking" in English the same day), which is what the two
availability cases in `e2e.test.ts` guard. Don't "improve" the seed text with an availability clause.

That seed also carries the **start date at Complexity (July 2026)** even though the date lives in the CV: the
`profile-availability` chunk scores so high on employment questions that it pushed the CV's EXPERIENCE chunk
out of the top 6 entirely, and the agent knew where he worked but not since when. Duplication there is
load-bearing — a fact only reachable from a chunk that retrieval never returns is a fact the agent does not
have.

For the same reason it now also carries the **city (Mérida, Venezuela)**. The CV states it once, in its
header chunk, which loses: on this corpus a short Spanish question scores every chunk within ~0.03 of every
other (0.80–0.83 against a 0.75 threshold), so the top-6 is close to arbitrary and phrasing decides it.
"¿Dónde vives actualmente?" retrieved six chunks, none of them the header, and the agent answered that it
didn't have the detail — while "¿En dónde estás ubicado?" answered correctly. **When a fact reads as missing
from one phrasing and present from another, that is retrieval, not the prompt**: measure it by embedding the
question and calling `match_documents` directly before changing anything else.

### Frontend

`index.html` (EN) and `spanish/index.html` (ES) are parallel full copies of the same page — **any content or
markup change must be mirrored in both**. The Spanish page references assets with `../` prefixes. Language is
never stored: everything derives from `document.documentElement.lang`, and the widget reads it at the exact
moment of send (a verified correctness property — see Property 13 in the tests).

The widget's two failure messages are not interchangeable. `fallback` ("the agent is currently unavailable",
with the email) is only for an HTTP 5xx — the agent really did answer badly. Anything else that lands in the
`catch` (a rejected `fetch`, an abort) never completed a round trip and gets `errorNetwork`, which points at
the connection. Both used to print `fallback`, and a real conversation showed it four times while the Edge
Function logs proved the agent was healthy every time: three of those requests never reached Supabase at all
(no preflight, no POST) and the fourth was served in 1181 ms, logged, and its response simply never got back
to the browser. **A visitor-reported "the agent is down" is not evidence the agent was down** — check
`function_edge_logs` through the Management API for the minute in question before touching the pipeline.
`requestTimeoutMs` is 20 s for the same reason: the function's own `response_time_ms` starts inside the
handler, so a cold isolate boot is invisible in the logs and fully counted by the client.

Both pages inline `window.__CHAT_ENDPOINT__` and `window.__CHAT_ANON_KEY__` before loading
`assets/js/chat-widget.js`. The anon/publishable key is in the HTML by design — it's browser-facing and
protected by RLS.

An answer that hands out a contact channel grows a WhatsApp and/or an email button underneath it, built in
`renderMessage`. The detection is client-side and deterministic, and the split matters: **the model's text
decides only whether a button appears, never where it points**. Both hrefs come from the `CONTACT` constant
in `chat-widget.js` (`mailto:` and `wa.me/584247092980`), so nothing parsed out of an answer ever reaches an
href. The phone is matched on digits alone, which is why any spacing or dashes the model picks still resolve.

Two decisions there that look arbitrary and are not. **Error messages are excluded**: the widget's own
fallback copy contains `lueduar15@gmail.com`, so a plain text match would turn every outage into a contact
card. And the buttons are *added under* the answer rather than replacing the address in it, so a detection
miss degrades to the old behaviour instead of leaving a sentence with a hole in it. `mailto:` over a Gmail
compose URL, to hand off to whatever mail client the visitor already uses.

`chat-widget.js` builds DOM through an `el()` factory; every piece of text — answers included — goes in as
`textContent`. Exactly one `innerHTML` in the file writes markup: `svgIcon()`, fed only by literal SVG path
strings (`chat-widget.js:186`). The other two are `dom.suggestions.innerHTML = ''` clears
(`:473`, `:492`). Keep it that way: no user or model content near `innerHTML` in the widget.

### The other three page scripts

`chat-widget.js` is the only frontend file with tests, but it is one of five. Load order, identical in both
pages (`index.html:915-926`, `spanish/index.html:896-906`, the Spanish copy prefixing `../`):
typed.js from unpkg → `main.js` → `terminal.js` → `casestudy.js` → `cronix-live.js` → the inline
`window.__CHAT_*` globals → `chat-widget.js` (`defer`).

| File | What it owns |
|------|--------------|
| `main.js` | scroll-to-top on load, nav shrink + active link, dark mode (`localStorage`, **dark by default**), the `IntersectionObserver` that adds `.visible` |
| `terminal.js` | the interactive CLI section — command table, history, `open [github\|linkedin\|cronix\|whatsapp]` |
| `cronix-live.js` | fetches `cronix-stats.json`, animates the metric counters, renders changelog + the 6-layer diagram |
| `casestudy.js` | the Cronix case-study drawer (open/close/overlay/Escape) |

**All four are IIFEs that branch on `document.documentElement.lang` and carry their own EN/ES content tables
inside the JS.** So "mirror every content change across both HTML pages" is only half the rule: terminal
output, metric labels and diagram copy are *not* in either HTML — they are `en`/`es` object literals in the
script, and a change made in one branch and not the other ships a half-translated page. `cronix-live.js` also
branches on the *path* (`../cronix-stats.json` vs `cronix-stats.json`, `cronix-live.js:9-11`); anything else
fetched from the page needs that same branch or it 404s only in Spanish.

The widget's `textContent` discipline does **not** hold across these. `cronix-live.js` builds the metrics
grid, the changelog and the diagram with template literals into `innerHTML` (`:175`, `:208`, `:323`), and the
changelog interpolates `item.msg` — a Cronix commit message that arrives via `repository_dispatch`. The
workflow hardened the shell and JSON layers (`jq --arg`, so quotes and newlines can't break the document) but
nothing escapes HTML on the way in, so a commit message containing markup would render as markup. It is
Luis's own repo, so this is a trust boundary to keep in mind rather than an open hole — but don't widen it,
and don't reuse those renderers for anything less trusted. `terminal.js` is fine: its only `innerHTML` is the
`clear` command wiping the output (`:409`), and typed commands are echoed through `textContent` (`:380`).

`cronix-stats.json` is generated: the `update-cronix-stats.yml` workflow rewrites and commits it on
`repository_dispatch` from the Cronix repo. Don't hand-edit it expecting the change to survive.

Those numbers exist in **three** places, and only one of them is generated: the JSON, the hand-written
fallback object `cronix-live.js` renders when the fetch fails (`:377-384`), and the agent's vector store via
`scripts/ingest.ts`. The workflow updates only the first. The fallback is in sync today; when a metric
changes, update it by hand and re-run `npm run ingest`, or the site silently shows last year's figures to
anyone whose fetch fails.

### Responsive, and why you cannot eyeball it

`html` and `body` carry `overflow-x: hidden` (`style.css:53`, `:59`). **A horizontal overflow therefore never
shows up as a scrollbar — it shows up as content clipped off the right edge with no way to reach it**, and
only on the narrow phones nobody tests on. Both instances found so far were invisible at 360px and up: a
`minmax(320px, 1fr)` grid floor wider than the viewport, and a 38-character LinkedIn URL with no break
opportunity setting the min-content width of its whole column. The fixes are the general ones —
`minmax(min(320px, 100%), 1fr)`, and `min-width: 0` plus `overflow-wrap: anywhere` on the long value.

To measure rather than guess, three traps, all of which produced a wrong answer here first:

- **Chrome headless clamps its window at ~500px**, so `--window-size=320` renders ~498px wide and then crops
  the screenshot to 320 — which looks exactly like a layout that overflows. Render the page in an `<iframe>`
  of the exact width instead (media queries honour it) and compare `documentElement.scrollWidth` against
  `clientWidth`.
- **Everything starts at `opacity: 0`** until the `IntersectionObserver` in `main.js` adds `.visible`, so a
  screenshot of an untouched page is a black rectangle. Neutralise `.reveal`/`.reveal-left`/`.reveal-right`,
  and `scroll-behavior: smooth` too — it eats the jump to a `#section` before the capture.
- **A rotating element reports a bounding box wider than it paints** (`.image-ring`), so a per-element audit
  will report a 2–3px overflow that does not exist. `scrollWidth` is the honest signal.

The two pages being full copies makes divergence easy to miss by reading. Diffing every `class` attribute
across `index.html` and `spanish/index.html` catches it in one shot; that is how the Spanish contact card
turned out to be the only one in the file using `contact-info` where the English uses `contact-detail`.

## Secrets

`.env` (git-ignored) holds the real values; `.env.example` documents the shape. Only two are user secrets:

```bash
supabase secrets set GROQ_API_KEY="$(grep '^GROQ_API_KEY=' .env | cut -d= -f2-)"
supabase secrets set ALLOWED_ORIGINS="$(grep '^ALLOWED_ORIGINS=' .env | cut -d= -f2-)"
```

The Supabase CLI has no persistent login in this environment — `supabase functions deploy` fails with
`403 … does not have the necessary privileges`. The personal access token lives in `.env` as
`SUPABASE_SECRET_CLI`; export it under the name the CLI expects before deploying:

```bash
set -a && . ./.env && set +a
export SUPABASE_ACCESS_TOKEN="${SUPABASE_SECRET_CLI}"
npm run deploy:chat
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform and
**cannot** be set manually — the API rejects any name prefixed `SUPABASE_`. Rotated keys propagate on their
own. Never pass a key as a literal on the command line; `setup.bat` and `run_ingest.bat` read `.env` the same
way and abort on a missing variable.

## Supabase free-tier keep-alive

A free-tier project pauses after ~7 days of inactivity and loses its DNS record, at which point the widget
shows "the agent is currently unavailable" until it's restored by hand.
`.github/workflows/supabase-keepalive.yml` runs a real `SELECT` against `documents` daily (a request to the
REST root returns 401 and doesn't count as activity). It runs daily rather than weekly because GitHub delays
crons under load, and it fails red on any non-200 so a paused project is visible. GitHub also disables
scheduled workflows in repos with 60 days of inactivity — re-enable from the Actions tab if that happens.

## Spec-driven development

`.kiro/specs/portfolio-conversational-agent/` holds `requirements.md` (numbered functional requirements with
acceptance criteria), `design.md` (architecture + 13 formal correctness properties defined before any code),
and `tasks.md` (implementation plan with requirement → task → test traceability).

Source files carry `Requirements: 3.x, 4.x` headers and tests carry `— Req 1.2` / `Property 11` labels that
point back into those documents. Preserve that traceability when editing, and consult the spec before
changing agent behaviour — the correctness properties are what the property-based tests encode.

Code and code comments are in English. The prose docs are mixed: the README, `PENDIENTE_SETUP.md`,
`INSTRUCCIONES_FINALES.md` and `TERMINAL_COMMANDS.md` are in Spanish; `CHAT_AGENT_SETUP.md`,
`CONFIGURATION_CHECKLIST.md` and `CRONIX_SETUP.md` in English. Match the language of the file you are
editing, and answer Luis in Spanish.

The four setup docs (`CHAT_AGENT_SETUP.md`, `CONFIGURATION_CHECKLIST.md`, `PENDIENTE_SETUP.md`,
`INSTRUCCIONES_FINALES.md`) describe a first-time provisioning that is long done and have drifted — e.g.
`CHAT_AGENT_SETUP.md` still says "OpenAI embeddings" when the pipeline uses Supabase gte-small. Read them as
history; trust `lib.ts`, `package.json` and this file over them wherever they disagree.

The README has drifted the same way and is the doc most likely to be believed, since it reads current: its
structure section still lists the CV PDFs as the ingest source, its threshold/limit numbers are stale, and
its terminal section lists an `about` command that does not exist while omitting `whoami`, `cronix` and
`open` (`terminal.js:396-435` is the real list). Verify against the code before repeating anything from it.
