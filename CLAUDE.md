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
npm test                 # Widget tests — Vitest + jsdom + fast-check (18 tests)
npm run test:edge        # Edge Function unit + property tests — Deno, over lib.ts (31 tests)
npm run test:db          # pgTAP RLS tests — requires Docker + `supabase start` first
npm run test:e2e         # E2E against the deployed project — needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
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
threshold `0.75`, max message `1000` chars, `RAG_MATCH_COUNT` 6, Groq models `openai/gpt-oss-120b` →
`openai/gpt-oss-20b`, cache TTL 7 days. (The widget's `errorInvalidMsg` copy still says "500 characters"
while it actually enforces 1000 — cosmetic, but don't take it as the limit.)

### Request pipeline

```
CORS preflight → origin guard (403) → session token UUID v4 (400) → body validation (422)
  → rate limit, 10/min/IP (429)
  → answer cache lookup, sha256(lang + normalized message) — hit short-circuits everything below
  → embedding via the `embed` Edge Function (Supabase gte-small, 384 dims, free)
  → match_documents() RPC, top-6, language-prioritized then cosine
  → below threshold? FALLBACK without calling the LLM (cached — it's deterministic)
  → buildSystemPrompt → callGroqWithFallback → stripMetaPrefix
  → write cache + log (fire-and-forget) → { answer, sources }
```

Two Edge Functions must both be deployed: `chat` and `embed`. `chat` calls `embed` over HTTP with the anon
key — deploying only one leaves the pipeline broken.

`callGroqWithFallback` walks `GROQ_MODELS` in order: each model has its own rate-limit bucket, so a 429 or an
empty completion (a reasoning model can burn the entire token budget on chain-of-thought) falls through to
the next. Only if every model is rate-limited does the request degrade to `BUSY_MESSAGE` — returned with
HTTP 200 and deliberately *not* cached.

`stripMetaPrefix` is a deterministic safety net for models that ignore the prompt and open with "Based on the
provided context…". The system prompt also forbids markdown, because the widget renders answers verbatim as
text.

### The pipeline fails open — HTTP 200 proves nothing

Rate limiting, the answer cache and logging all swallow their errors and continue. If the `service_role` key
is revoked, all three fail silently and the function still answers 200. That happened in production and went
unnoticed. This is why `e2e.test.ts` asserts that a **new row lands in `chat_logs`**, that the answer is
non-empty and that it contains no markdown — never just a status code. Preserve that property when touching
the E2E tests.

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

`ingest.ts` uses plain INSERTs and is **not** idempotent: re-running it duplicates chunks, which wastes Groq
tokens and dilutes retrieval. Follow it with `npm run dedupe`. `seed-availability.ts` is idempotent (deletes
its own source rows first).

### Frontend

`index.html` (EN) and `spanish/index.html` (ES) are parallel full copies of the same page — **any content or
markup change must be mirrored in both**. The Spanish page references assets with `../` prefixes. Language is
never stored: everything derives from `document.documentElement.lang`, and the widget reads it at the exact
moment of send (a verified correctness property — see Property 13 in the tests).

Both pages inline `window.__CHAT_ENDPOINT__` and `window.__CHAT_ANON_KEY__` before loading
`assets/js/chat-widget.js`. The anon/publishable key is in the HTML by design — it's browser-facing and
protected by RLS.

`chat-widget.js` builds DOM through an `el()` factory and never uses `innerHTML`. Keep it that way.

`cronix-stats.json` is generated: the `update-cronix-stats.yml` workflow rewrites and commits it on
`repository_dispatch` from the Cronix repo. Don't hand-edit it expecting the change to survive.

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

The setup/troubleshooting docs (`CHAT_AGENT_SETUP.md`, `CONFIGURATION_CHECKLIST.md`, `PENDIENTE_SETUP.md`,
`CRONIX_SETUP.md`, `TERMINAL_COMMANDS.md`) and the README are written in Spanish; code and code comments are
in English.
