# Chat Agent — Setup Guide

Portfolio conversational RAG agent. Stack: Supabase (pgvector + Edge Function) + OpenAI embeddings + Groq LLM.

---

## Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli) installed
- [Deno](https://deno.land/) installed (for ingest script)
- A Supabase project created at [supabase.com](https://supabase.com)
- Groq API key — **free tier** at [console.groq.com](https://console.groq.com) (no credit card needed)

> **No OpenAI key needed.** Embeddings use Supabase's built-in `gte-small` model (384 dims, completely free).

---

## Step 1 — Run database migrations

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# Apply all 3 migrations
supabase db push
```

Or run manually in the Supabase SQL editor:
1. `supabase/migrations/001_create_documents.sql`
2. `supabase/migrations/002_create_rate_limits_and_logs.sql`
3. `supabase/migrations/003_match_documents_fn.sql`

> **Note:** Make sure the `vector` extension is enabled in your Supabase project:  
> Dashboard → Database → Extensions → search "vector" → enable.

---

## Step 2 — Set Edge Function secrets

```bash
supabase secrets set \
  GROQ_API_KEY=gsk_... \
  SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co \
  SUPABASE_ANON_KEY=eyJ... \
  SUPABASE_SERVICE_ROLE_KEY=eyJ... \
  ALLOWED_ORIGINS=https://YOUR_PORTFOLIO.vercel.app
```

For multiple allowed origins separate with commas:
```
ALLOWED_ORIGINS=https://your-portfolio.vercel.app,https://your-custom-domain.com
```

---

## Step 3 — Deploy the Edge Function

```bash
supabase functions deploy chat --project-ref YOUR_PROJECT_REF
```

The function URL will be:
```
https://YOUR_PROJECT_REF.supabase.co/functions/v1/chat
```

---

## Step 4 — Run the ingestion script

This populates the vector store with chunks from your CVs and cronix-stats.json.

```bash
# Set env vars for the script
export SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=eyJ...
export SUPABASE_ANON_KEY=eyJ...

# Run ingest
deno run --allow-read --allow-net --allow-env scripts/ingest.ts
```

Expected output:
```
[ingest] Starting portfolio knowledge base ingestion...

[ingest] Processing PDF: ./assets/images/LuisRomero_AIEngineer-Backend_2026_EN.pdf (lang=en)
[ingest] Created N chunks from LuisRomero_AIEngineer-Backend_2026_EN.pdf
[ingest] ✓ Ingested N/N chunks for LuisRomero_AIEngineer-Backend_2026_EN.pdf

[ingest] Processing PDF: ./assets/images/LuisRomero_AIEngineer-Backend_2026_ES.pdf (lang=es)
...

[ingest] Processing cronix-stats.json
...

[ingest] ✓ Ingestion complete.
```

---

## Step 5 — Update the endpoint in the HTML files

Replace `YOUR_SUPABASE_PROJECT` with your actual project ref in both HTML files:

**`index.html`** (line near `</body>`):
```html
<script>
  window.__CHAT_ENDPOINT__ = 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/chat';
</script>
```

**`spanish/index.html`** (same pattern):
```html
<script>
  window.__CHAT_ENDPOINT__ = 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/chat';
</script>
```

---

## Step 6 — Deploy the portfolio

Push to your repo. Vercel will auto-deploy. The chat widget will appear as a floating bubble bottom-right on both EN and ES versions.

---

## Architecture at a glance

```
Visitor clicks bubble
  → chat-widget.js sends POST to Edge Function
    → Validates origin, session token, message, rate limit
    → OpenAI: generates embedding of message
    → Supabase RPC: match_documents (pgvector cosine search)
    → If max similarity < 0.70: returns fallback (no LLM call)
    → Groq openai/gpt-oss-120b: generates answer from context chunks
    → Logs SHA-256 hash to chat_logs (never plaintext)
    → Returns { answer, sources } to widget
  → Widget renders response with source chips
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Widget doesn't appear | Script not loaded | Check browser console for JS errors |
| 403 on all requests | ALLOWED_ORIGINS mismatch | Add your domain to the secret |
| Answers are always fallback | Vector store empty | Run `scripts/ingest.ts` |
| Embeddings fail | Wrong OPENAI_API_KEY | Check secret value in Supabase dashboard |
| Rate limit errors immediately | IP already at limit | Wait 60s or check `rate_limits` table |
| CORS error in browser | Origin not in ALLOWED_ORIGINS | Add `localhost:PORT` for local dev |

---

## Local development

For local testing, add `http://localhost:PORT` to `ALLOWED_ORIGINS` when running `supabase functions serve`:

```bash
supabase functions serve chat --env-file .env.local
```

Create `.env.local` with all the secrets from Step 2.
