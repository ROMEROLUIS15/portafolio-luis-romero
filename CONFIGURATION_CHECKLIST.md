# Configuration Checklist — Portfolio Conversational Agent

## ✅ What's Already Done

- [x] Supabase project created: `dsrxcqjivhvhvpqumcvb`
- [x] pgvector extension enabled (confirmed via `/functions/v1/embed`)
- [x] Database migrations executed (5 documents in DB)
- [x] Edge Function `chat` deployed
- [x] Embedding function `/functions/v1/embed` deployed and working
- [x] Widget frontend integrated into both `index.html` and `spanish/index.html`
- [x] All code files implemented with SOLID principles
- [x] Tests passing (18/18 Vitest + fast-check)
- [x] Deno ingest script created
- [x] CI/CD configured (GitHub Actions)
- [x] Documentation complete (README, CHAT_AGENT_SETUP.md, PENDIENTE_SETUP.md)

---

## ❌ What Needs to Be Done

### Step 1: Configure GROQ_API_KEY

**The Edge Function `chat` needs a Groq API key to function.**

#### Option A: Via Supabase Dashboard (RECOMMENDED)

1. Go to [Supabase Dashboard → Edge Functions](https://supabase.com/dashboard/project/dsrxcqjivhvhvpqumcvb/functions)
2. Click on `chat` function
3. Click **Settings** (gear icon)
4. Scroll to **Secrets** or **Environment Variables**
5. Add:
   - **Name**: `GROQ_API_KEY`
   - **Value**: `***REDACTED***|x`
6. Save and click **Deploy** (or **Save & Deploy**)

#### Option B: Via Supabase CLI (if PAT available)

```bash
# Login with Personal Access Token (PAT)
supabase login --token YOUR_PAT_HERE

# Set the secret
supabase secrets set GROQ_API_KEY=***REDACTED***|x

# Redeploy the function
supabase functions deploy chat --project-ref dsrxcqjivhvhvpqumcvb
```

> **Note**: If you don't have a PAT, generate one at [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens)

---

### Step 2: Complete Data Ingestion

**The database has only 5 documents. Full ingestion should add ~26+ chunks.**

#### Run the Ingest Script

Run `run_ingest.bat` (created in project root):

```bash
.\run_ingest.bat
```

Or manually:
```bash
deno run --allow-read --allow-net --allow-env scripts/ingest.ts
```

This will:
- Process `LuisRomero_AIEngineer-Backend_2026_EN.pdf` → ~12 chunks
- Process `LuisRomero_AIEngineer-Backend_2026_ES.pdf` → ~10 chunks  
- Process `cronix-stats.json` → ~4 chunks

**Expected result:**
```
[ingest] ✓ Ingested 12/12 chunks for LuisRomero_AIEngineer-Backend_2026_EN.pdf
[ingest] ✓ Ingested 10/10 chunks for LuisRomero_AIEngineer-Backend_2026_ES.pdf
[ingest] ✓ Ingested 4/4 chunks for cronix-stats.json
[ingest] ✓ Ingestion complete.
```

---

### Step 3: Test the Chat Widget

1. Deploy your portfolio to Vercel:
   ```bash
   git add -A
   git commit -m "Config: update chat widget endpoint"
   git push origin main
   ```

2. Visit `https://portafolio-luis-romero.vercel.app`
3. The chat bubble should appear in the bottom-right corner
4. Test:
   - Ask a question in English (e.g., "What is Luis's experience with LangGraph?")
   - Ask a question in Spanish (e.g., "¿Cuál es la experiencia de Luis con LangGraph?")
   - Check that the answer comes from your CV data (RAG working)
   - Check that the language detection is automatic

---

### Step 4: Verify Edge Function Logs

After testing:

1. Go to [Supabase Dashboard → Edge Functions → chat](https://supabase.com/dashboard/project/dsrxcqjivhvhvpqumcvb/functions/chat)
2. Click **Logs** tab
3. Check for any errors
4. Confirm successful requests with 200 status

---

## Troubleshooting

### Widget doesn't appear
- Check browser console for errors
- Verify `window.__CHAT_ENDPOINT__` is set correctly
- Check that `assets/js/chat-widget.js` loads

### Questions return no results
- Check document count: `SELECT COUNT(*) FROM documents;` (should be ~26+)
- Verify embeddings exist: `SELECT COUNT(*) FROM documents WHERE embedding IS NOT NULL;`
- Test the `match_documents` function manually in Supabase SQL Editor

### Edge Function returns 401/403
- Verify `GROQ_API_KEY` is set correctly
- Check that the key starts with `gsk_` and is valid
- Check function logs for Groq API errors

### Deno ingest fails
- Verify all env vars are set correctly
- Check network connectivity to Supabase
- Verify PDF files exist in `assets/images/`

---

## Quick Commands

```bash
# Check document count in DB
curl -H "apikey: eyJhbGci..." -H "Authorization: Bearer eyJhbG..." \
  "https://dsrxcqjivhvhvpqumcvb.supabase.co/rest/v1/documents?select=count"

# Test the ingest script
deno run --allow-read --allow-net --allow-env scripts/ingest.ts

# Check Edge Function status
curl -H "Authorization: Bearer eyJhbG..." \
  "https://dsrxcqjivhvhvpqumcvb.supabase.co/functions/v1/chat"
```

---

## Cost Summary

- **Supabase**: Free tier (pgvector, Edge Functions, 500k rows)
- **Groq**: Free tier (LLM API calls)
- **Total**: **$0/month**

No credit card required.
