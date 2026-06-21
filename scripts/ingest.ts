/**
 * Ingestion script — Portfolio Conversational Agent
 * Processes PDFs and cronix-stats.json → generates embeddings → upserts into Supabase pgvector
 * Embeddings: Supabase built-in gte-small (384 dims, FREE — no OpenAI key needed)
 *
 * Usage:
 *   deno run --allow-read --allow-net --allow-env scripts/ingest.ts
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @ts-ignore — unpdf via esm.sh
import { extractText } from 'https://esm.sh/unpdf@0.11.0';

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
  type: 'pdf' | 'json';
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

const CHUNK_MAX_TOKENS   = 500;
const CHUNK_OVERLAP      = 50;
const BATCH_SIZE         = 20;
const EMBED_MAX_RETRIES  = 3;
const INSERT_MAX_RETRIES = 2;

const PDF_SOURCES: SourceConfig[] = [
  { path: './assets/images/LuisRomero_AIEngineer-Backend_2026_EN.pdf', lang: 'en', type: 'pdf'  },
  { path: './assets/images/LuisRomero_AIEngineer-Backend_2026_ES.pdf', lang: 'es', type: 'pdf'  },
  { path: './cronix-stats.json',                                        lang: 'en', type: 'json' },
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

  // ~1 token per 1.25 words (avg 5 chars/word, 4 chars/token)
  const maxWords     = Math.floor(maxTokens / (1 / 1.25));
  const overlapWords = Math.floor(overlap   / (1 / 1.25));

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

async function processPDF(filePath: string, lang: Lang): Promise<void> {
  console.log(`\n[ingest] Processing PDF: ${filePath} (lang=${lang})`);

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await Deno.readFile(filePath);
  } catch {
    // Requirement 2.4: log and continue — do not abort the whole run
    console.error(`[ingest] ✗ File not found: ${filePath} — skipping`);
    return;
  }

  let text: string;
  try {
    const result = await extractText(pdfBytes, { mergePages: true });
    text = Array.isArray(result.text) ? result.text.join('\n') : result.text;
  } catch (err) {
    console.error(`[ingest] ✗ Failed to extract text from ${filePath}:`, (err as Error).message);
    return;
  }

  if (!text?.trim()) {
    console.warn(`[ingest] ⚠ No text extracted from ${filePath}`);
    return;
  }

  const source = filePath.split('/').pop() ?? filePath;
  const chunks = chunkText(text);
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

  for (const src of PDF_SOURCES) {
    if (src.type === 'pdf') {
      await processPDF(src.path, src.lang);
    } else {
      await processCronixStats(src.path);
    }
  }

  console.log('\n[ingest] ✓ Ingestion complete.');
}

if (import.meta.main) {
  await main();
}
