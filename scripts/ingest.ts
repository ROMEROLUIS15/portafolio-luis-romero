/**
 * Ingestion script — Portfolio Conversational Agent
 * Processes the curated CV markdown + cronix-stats.json → embeddings → Supabase pgvector
 * Embeddings: Supabase built-in gte-small (384 dims, FREE — no OpenAI key needed)
 *
 * The CV source is the hand-curated `LuisRomero_CV_ATS_{EN,ES}.md` (clean, already
 * categorized, no duplicates), NOT the PDF — PDF text extraction produced noisy,
 * duplicated chunks and was out of date (it still said 150 appointments vs 250+).
 *
 * Usage:
 *   deno run --allow-read --allow-net --allow-env scripts/ingest.ts
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Types ────────────────────────────────────────────────────────────────────

type Lang = 'en' | 'es';

interface DocumentRow {
  content:   string;
  embedding: number[];
  metadata:  {
    source:      string;
    lang:        string;
    chunk_index: number;
    created_at:  string;
  };
}

interface IngestResult {
  ingested: number;
  errors:   number;
}

interface SourceConfig {
  path: string;
  lang: Lang;
  type: 'markdown' | 'json';
}

// ─── Environment (read once, validated at startup) ────────────────────────────

const ENV = {
  supabaseUrl:        Deno.env.get('SUPABASE_URL')              ?? '',
  supabaseServiceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  supabaseAnonKey:    Deno.env.get('SUPABASE_ANON_KEY')         ?? '',
} as const;

const MISSING_VARS = Object.entries(ENV)
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (MISSING_VARS.length > 0) {
  console.error(`[ingest] Missing required env vars: ${MISSING_VARS.join(', ')}`);
  Deno.exit(1);
}

// ─── Supabase client (created once) ──────────────────────────────────────────

const supabase = createClient(ENV.supabaseUrl, ENV.supabaseServiceKey);

// ─── Constants ────────────────────────────────────────────────────────────────

const CHUNK_MAX_TOKENS   = 350;  // keeps each chunk under the chat fn's 1600-char cap
const CHUNK_OVERLAP      = 40;
const BATCH_SIZE         = 20;
const EMBED_MAX_RETRIES  = 3;
const INSERT_MAX_RETRIES = 2;

const SOURCES: SourceConfig[] = [
  { path: './LuisRomero_CV_ATS_EN.md', lang: 'en', type: 'markdown' },
  { path: './LuisRomero_CV_ATS_ES.md', lang: 'es', type: 'markdown' },
  { path: './cronix-stats.json',       lang: 'en', type: 'json'     },
];

// ─── Chunker — Requirement 2.1 ────────────────────────────────────────────────

/**
 * Naive token estimator: ~4 chars per token (GPT-style approximation).
 * Sufficient for chunking without importing a full tokenizer in Deno.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Splits text into overlapping chunks of ~maxTokens tokens.
 * Uses word boundaries to avoid cutting mid-word.
 */
export function chunkText(
  text:      string,
  maxTokens: number = CHUNK_MAX_TOKENS,
  overlap:   number = CHUNK_OVERLAP
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  // ~1 token ≈ 0.75 words (a token ≈ 4 chars, a word ≈ 5-6 chars incl. space).
  // Previously this divided by (1/1.25), producing chunks ~1.6x too large.
  const maxWords     = Math.max(1, Math.floor(maxTokens * 0.75));
  const overlapWords = Math.max(0, Math.floor(overlap   * 0.75));

  const chunks: string[] = [];
  let start = 0;

  while (start < words.length) {
    const end   = Math.min(start + maxWords, words.length);
    const chunk = words.slice(start, end).join(' ').trim();

    if (chunk.length > 0) chunks.push(chunk);
    if (end >= words.length) break;

    start = end - overlapWords;
    if (start <= 0) start = end; // guard against infinite loop
  }

  return chunks;
}

/**
 * Section-aware chunker for the curated CV markdown. Splits on `#`/`##`/`###`
 * headers so each job, project, and the (already-categorized) skills block stays
 * intact in a single chunk — which keeps tech lists complete and duplicate-free.
 * Sections longer than the token budget fall back to the word chunker, re-prefixing
 * the header so each piece keeps its context. Header-only fragments are dropped.
 */
// Synthetic lead-in prepended to the skills chunk so its embedding scores high on
// generic "what technologies / languages / stack does he know?" queries — otherwise
// a single skills blob loses retrieval to short bullets that echo a few of the words.
const SKILLS_LEAD: Record<Lang, string> = {
  es: 'Tecnologías, lenguajes de programación, frameworks, stack técnico y herramientas que domina Luis Romero:',
  en: "Technologies, programming languages, frameworks, technical stack and tools Luis Romero knows:",
};

export function chunkMarkdown(text: string, lang: Lang): string[] {
  const blocks = text
    .split(/\n(?=#{1,3} )/)
    .map((b) => b.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  for (const block of blocks) {
    const lines      = block.split('\n');
    const headerLine = /^#{1,3} /.test(lines[0]) ? lines[0] : '';
    const body       = headerLine ? lines.slice(1).join('\n').trim() : block;

    // Drop standalone section headers with no content of their own (e.g. "## EXPERIENCIA"
    // whose body lives in the ### subsections that were split out).
    if (headerLine && body.length < 20) continue;

    // Skills-style sections list one "**Category:** a, b, c" per line. Keep ALL
    // categories together in ONE chunk (so a single retrieval returns the complete,
    // deduped list and the model never sees a partial list to meta-comment on), but
    // prepend a keyword lead-in so the chunk actually gets retrieved for tech queries.
    const categoryLines = lines.filter((l) => /^\*\*[^*]+:\*\*/.test(l.trim()));
    if (categoryLines.length >= 2) {
      chunks.push(`${SKILLS_LEAD[lang]}\n${categoryLines.map((l) => l.trim()).join('\n')}`);
      continue;
    }

    if (estimateTokens(block) <= CHUNK_MAX_TOKENS) {
      chunks.push(block);
    } else {
      for (const piece of chunkText(block)) {
        chunks.push(headerLine && !piece.startsWith(headerLine) ? `${headerLine}\n${piece}` : piece);
      }
    }
  }
  return chunks;
}

// ─── Embeddings — Supabase gte-small (free, 384 dims) ────────────────────────

async function fetchEmbedding(text: string, attempt = 1): Promise<number[]> {
  const response = await fetch(`${ENV.supabaseUrl}/functions/v1/embed`, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${ENV.supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input: text }),
  });

  if (!response.ok) {
    const message = `HTTP ${response.status}: ${await response.text()}`;

    if (attempt < EMBED_MAX_RETRIES) {
      const waitMs = Math.pow(2, attempt) * 500;
      console.warn(`[ingest] Embed attempt ${attempt} failed, retrying in ${waitMs}ms — ${message}`);
      await sleep(waitMs);
      return fetchEmbedding(text, attempt + 1);
    }

    throw new Error(`Embedding failed after ${EMBED_MAX_RETRIES} attempts: ${message}`);
  }

  const data = await response.json();
  return data.embedding as number[];
}

async function generateEmbeddingBatch(texts: string[]): Promise<number[][]> {
  // Supabase embed processes one text at a time — run sequentially
  const results: number[][] = [];
  for (const text of texts) {
    results.push(await fetchEmbedding(text));
  }
  return results;
}

// ─── Persistence ──────────────────────────────────────────────────────────────

async function insertRows(rows: DocumentRow[], attempt = 1): Promise<void> {
  const { error } = await supabase.from('documents').insert(rows);

  if (!error) return;

  if (attempt <= INSERT_MAX_RETRIES) {
    console.warn(`[ingest] Insert attempt ${attempt} failed, retrying...`, error.message);
    await sleep(1000 * attempt);
    return insertRows(rows, attempt + 1);
  }

  throw new Error(`Insert failed after ${INSERT_MAX_RETRIES} retries: ${error.message}`);
}

// ─── Pipeline: chunks → embeddings → DB ──────────────────────────────────────

async function ingestChunks(
  chunks: string[],
  source: string,
  lang:   Lang
): Promise<IngestResult> {
  const now      = new Date().toISOString();
  let   ingested = 0;
  let   errors   = 0;

  // Idempotency: clear any previously-ingested rows for this source before
  // re-inserting, so re-running the ingest never duplicates content.
  const { error: delError } = await supabase
    .from('documents')
    .delete()
    .eq('metadata->>source', source);
  if (delError) {
    throw new Error(`[ingest] Failed to clear existing rows for "${source}": ${delError.message}`);
  }
  console.log(`[ingest] Cleared existing rows for "${source}" (idempotent re-ingest)`);

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch        = chunks.slice(i, i + BATCH_SIZE);
    const batchIndices = batch.map((_, k) => i + k);

    let embeddings: number[][];
    try {
      embeddings = await generateEmbeddingBatch(batch);
    } catch (err) {
      console.warn(
        `[ingest] Skipping batch starting at chunk ${i} for "${source}":`,
        (err as Error).message
      );
      errors += batch.length;
      continue;
    }

    const rows: DocumentRow[] = batch.map((content, k) => ({
      content,
      embedding: embeddings[k],
      metadata:  { source, lang, chunk_index: batchIndices[k], created_at: now },
    }));

    // insertRows throws on exhausted retries — let it propagate to abort the run
    await insertRows(rows);
    ingested += rows.length;
    console.log(`[ingest] ✓ ${source}: ${ingested}/${chunks.length} chunks ingested`);
  }

  return { ingested, errors };
}

// ─── Source processors ────────────────────────────────────────────────────────

async function processMarkdown(filePath: string, lang: Lang): Promise<void> {
  console.log(`\n[ingest] Processing markdown: ${filePath} (lang=${lang})`);

  let text: string;
  try {
    text = await Deno.readTextFile(filePath);
  } catch {
    // Requirement 2.4: log and continue — do not abort the whole run
    console.error(`[ingest] ✗ File not found: ${filePath} — skipping`);
    return;
  }

  if (!text?.trim()) {
    console.warn(`[ingest] ⚠ Empty file: ${filePath}`);
    return;
  }

  const source = filePath.split('/').pop() ?? filePath;
  const chunks = chunkMarkdown(text, lang);
  console.log(`[ingest] Created ${chunks.length} chunks from "${source}"`);

  const { ingested, errors } = await ingestChunks(chunks, source, lang);
  console.log(`[ingest] "${source}" done — ingested=${ingested}, errors=${errors}`);
}

async function processCronixStats(filePath: string): Promise<void> {
  console.log(`\n[ingest] Processing: ${filePath}`);

  let raw: string;
  try {
    raw = await Deno.readTextFile(filePath);
  } catch {
    console.error(`[ingest] ✗ File not found: ${filePath} — skipping`);
    return;
  }

  let stats: Record<string, unknown>;
  try {
    stats = JSON.parse(raw);
  } catch (err) {
    console.error(`[ingest] ✗ Failed to parse ${filePath}:`, (err as Error).message);
    return;
  }

  const lines: string[] = [];

  for (const [key, value] of Object.entries(stats)) {
    if (key === 'changelog' && Array.isArray(value)) {
      for (const entry of value) {
        if (entry !== null && typeof entry === 'object') {
          const line = Object.entries(entry as Record<string, unknown>)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ');
          lines.push(`Cronix changelog entry — ${line}`);
        }
      }
    } else {
      const serialized = typeof value === 'object' ? JSON.stringify(value) : String(value);
      lines.push(`Cronix ${key}: ${serialized}`);
    }
  }

  const chunks = chunkText(lines.join('\n'));
  console.log(`[ingest] Created ${chunks.length} chunks from "cronix-stats.json"`);

  const { ingested, errors } = await ingestChunks(chunks, 'cronix-stats.json', 'en');
  console.log(`[ingest] "cronix-stats.json" done — ingested=${ingested}, errors=${errors}`);
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Main (only runs when executed directly, not when imported) ───────────────

async function main(): Promise<void> {
  console.log('[ingest] Starting portfolio knowledge base ingestion...\n');

  for (const src of SOURCES) {
    if (src.type === 'markdown') {
      await processMarkdown(src.path, src.lang);
    } else {
      await processCronixStats(src.path);
    }
  }

  console.log('\n[ingest] ✓ Ingestion complete.');
}

if (import.meta.main) {
  await main();
}
