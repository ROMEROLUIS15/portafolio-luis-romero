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

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @ts-ignore — unpdf via esm.sh
import { extractText } from 'https://esm.sh/unpdf@0.11.0';

// ─── Config ───────────────────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !SUPABASE_ANON_KEY) {
  console.error(
    '[ingest] Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY'
  );
  Deno.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const CHUNK_MAX_TOKENS = 500;
const CHUNK_OVERLAP = 50;
const EMBEDDING_BATCH_SIZE = 20;
const EMBEDDING_MAX_RETRIES = 3;
const INSERT_MAX_RETRIES = 2;

// ─── Chunker — Requirement 2.1 ────────────────────────────────────────────────

/**
 * Naive token estimator: ~4 chars per token (GPT-style approximation).
 * Sufficient for chunking purposes without importing a tokenizer.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Split text into chunks of ~maxTokens with `overlap` token overlap.
 * Requirements: 2.1
 */
export function chunkText(
  text: string,
  maxTokens = CHUNK_MAX_TOKENS,
  overlap = CHUNK_OVERLAP
): string[] {
  // Split into words to keep word boundaries
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];

  // Approximate words per chunk (4 chars/token avg, ~5 chars/word avg)
  const wordsPerToken = 1 / 1.25; // ~1 token per 1.25 words
  const maxWords = Math.floor(maxTokens / wordsPerToken);
  const overlapWords = Math.floor(overlap / wordsPerToken);

  let start = 0;
  while (start < words.length) {
    const end = Math.min(start + maxWords, words.length);
    const chunk = words.slice(start, end).join(' ');

    if (chunk.trim().length > 0) {
      chunks.push(chunk.trim());
    }

    if (end >= words.length) break;
    start = end - overlapWords;
    if (start <= 0) start = end; // safety: avoid infinite loop
  }

  return chunks;
}

// ─── Embeddings via Supabase (free, gte-small, 384 dims) — Requirements 2.3, 2.4

async function generateEmbeddingBatch(
  texts: string[]
): Promise<number[][]> {
  // Supabase embed function processes one text at a time — batch sequentially
  const embeddings: number[][] = [];

  for (let i = 0; i < texts.length; i++) {
    for (let attempt = 1; attempt <= EMBEDDING_MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/embed`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ input: texts[i] }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }

        const data = await response.json();
        embeddings.push(data.embedding as number[]);
        break;
      } catch (err) {
        if (attempt === EMBEDDING_MAX_RETRIES) throw err;
        const waitMs = Math.pow(2, attempt) * 500;
        console.warn(
          `[ingest] Embed attempt ${attempt} failed for chunk ${i}, retrying in ${waitMs}ms...`,
          (err as Error).message
        );
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
  }

  return embeddings;
}

// ─── Supabase upsert — Requirement 2.3, 2.4 ──────────────────────────────────

interface DocumentRow {
  content: string;
  embedding: number[];
  metadata: {
    source: string;
    lang: string;
    chunk_index: number;
    created_at: string;
  };
}

async function upsertDocuments(rows: DocumentRow[]): Promise<void> {
  for (let attempt = 1; attempt <= INSERT_MAX_RETRIES + 1; attempt++) {
    const { error } = await supabase.from('documents').insert(rows);
    if (!error) return;

    if (attempt > INSERT_MAX_RETRIES) {
      throw new Error(`Supabase insert failed after ${INSERT_MAX_RETRIES} retries: ${error.message}`);
    }
    console.warn(`[ingest] Insert attempt ${attempt} failed, retrying...`, error.message);
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
}

// ─── Process chunks in batches ────────────────────────────────────────────────

async function processAndIngest(
  chunks: string[],
  source: string,
  lang: string
): Promise<{ ingested: number; errors: number }> {
  let ingested = 0;
  let errors = 0;
  const now = new Date().toISOString();

  for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
    const batchIndices = Array.from({ length: batch.length }, (_, k) => i + k);

    let embeddings: number[][];
    try {
      embeddings = await generateEmbeddingBatch(batch);
    } catch (err) {
      console.warn(
        `[ingest] Skipping batch ${Math.floor(i / EMBEDDING_BATCH_SIZE) + 1} for ${source}:`,
        (err as Error).message
      );
      errors += batch.length;
      continue;
    }

    const rows: DocumentRow[] = batch.map((content, k) => ({
      content,
      embedding: embeddings[k],
      metadata: {
        source,
        lang,
        chunk_index: batchIndices[k],
        created_at: now,
      },
    }));

    try {
      await upsertDocuments(rows);
      ingested += rows.length;
      console.log(
        `[ingest] ✓ Ingested ${ingested}/${chunks.length} chunks for ${source}`
      );
    } catch (err) {
      console.error(
        `[ingest] ✗ Insert failed for batch ${Math.floor(i / EMBEDDING_BATCH_SIZE) + 1}:`,
        (err as Error).message
      );
      errors += rows.length;
      throw err; // abort on insert failure per requirements
    }
  }

  return { ingested, errors };
}

// ─── PDF source processing — Requirement 2.1 ─────────────────────────────────

async function processPDF(filePath: string, lang: string): Promise<void> {
  console.log(`\n[ingest] Processing PDF: ${filePath} (lang=${lang})`);

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await Deno.readFile(filePath);
  } catch {
    // Requirement 2.4: log error and continue with other files
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

  if (!text || text.trim().length === 0) {
    console.warn(`[ingest] ⚠ No text extracted from ${filePath}`);
    return;
  }

  const source = filePath.split('/').pop() ?? filePath;
  const chunks = chunkText(text);
  console.log(`[ingest] Created ${chunks.length} chunks from ${source}`);

  const { ingested, errors } = await processAndIngest(chunks, source, lang);
  console.log(`[ingest] ${source}: ingested=${ingested}, errors=${errors}`);
}

// ─── cronix-stats.json processing — Requirement 2.2 ─────────────────────────

async function processCronixStats(filePath: string): Promise<void> {
  console.log(`\n[ingest] Processing cronix-stats.json`);

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
    console.error(`[ingest] ✗ Failed to parse cronix-stats.json:`, (err as Error).message);
    return;
  }

  // Serialize each scalar field and changelog entry as readable text chunks
  const textParts: string[] = [];

  for (const [key, value] of Object.entries(stats)) {
    if (key === 'changelog' && Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === 'object' && entry !== null) {
          const entryText = Object.entries(entry)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ');
          textParts.push(`Cronix changelog entry — ${entryText}`);
        }
      }
    } else if (typeof value !== 'object') {
      textParts.push(`Cronix ${key}: ${value}`);
    } else if (value !== null) {
      textParts.push(`Cronix ${key}: ${JSON.stringify(value)}`);
    }
  }

  // Join into one text blob and chunk
  const fullText = textParts.join('\n');
  const source = 'cronix-stats.json';
  const chunks = chunkText(fullText);
  console.log(`[ingest] Created ${chunks.length} chunks from ${source}`);

  const { ingested, errors } = await processAndIngest(chunks, source, 'en');
  console.log(`[ingest] ${source}: ingested=${ingested}, errors=${errors}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log('[ingest] Starting portfolio knowledge base ingestion...\n');

const pdfBase = './assets/images';
const sources: Array<{ path: string; lang: string; type: 'pdf' | 'json' }> = [
  {
    path: `${pdfBase}/LuisRomero_AIEngineer-Backend_2026_EN.pdf`,
    lang: 'en',
    type: 'pdf',
  },
  {
    path: `${pdfBase}/LuisRomero_AIEngineer-Backend_2026_ES.pdf`,
    lang: 'es',
    type: 'pdf',
  },
  { path: './cronix-stats.json', lang: 'en', type: 'json' },
];

for (const src of sources) {
  if (src.type === 'pdf') {
    await processPDF(src.path, src.lang);
  } else {
    await processCronixStats(src.path);
  }
}

console.log('\n[ingest] ✓ Ingestion complete.');
