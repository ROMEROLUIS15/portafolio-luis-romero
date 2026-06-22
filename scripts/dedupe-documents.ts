/**
 * Dedupe script — removes duplicate rows from the `documents` vector store.
 *
 * Earlier the bulk ingest was run multiple times with a plain INSERT, so the
 * table accumulated identical chunks. Duplicates waste Groq tokens (the same
 * text is sent repeatedly as RAG context) and reduce answer diversity.
 *
 * Strategy: group rows by exact content, keep the lowest id of each group,
 * delete the rest. Safe to re-run (a deduped table is a no-op).
 *
 * Usage:
 *   deno run --allow-net --allow-env scripts/dedupe-documents.ts
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ENV = {
  supabaseUrl:        Deno.env.get('SUPABASE_URL')              ?? '',
  supabaseServiceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
} as const;

const missing = Object.entries(ENV).filter(([, v]) => !v).map(([k]) => k);
if (missing.length > 0) {
  console.error(`[dedupe] Missing env vars: ${missing.join(', ')}`);
  Deno.exit(1);
}

const PAGE = 1000;

async function main(): Promise<void> {
  const supabase = createClient(ENV.supabaseUrl, ENV.supabaseServiceKey);

  // Fetch all rows (id + content), paginated
  const rows: { id: number; content: string }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('documents')
      .select('id, content')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`select failed: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...(data as { id: number; content: string }[]));
    if (data.length < PAGE) break;
  }

  // Group by exact content, keep the lowest id, mark the rest for deletion
  const seen = new Set<string>();
  const toDelete: number[] = [];
  for (const row of rows) {
    if (seen.has(row.content)) toDelete.push(row.id);
    else seen.add(row.content);
  }

  console.log(`[dedupe] Total rows: ${rows.length} | unique: ${seen.size} | duplicates: ${toDelete.length}`);

  if (toDelete.length === 0) {
    console.log('[dedupe] ✓ Nothing to do — table already deduplicated.');
    return;
  }

  // Delete duplicates in batches
  for (let i = 0; i < toDelete.length; i += 200) {
    const batch = toDelete.slice(i, i + 200);
    const { error } = await supabase.from('documents').delete().in('id', batch);
    if (error) throw new Error(`delete batch failed: ${error.message}`);
    console.log(`[dedupe] Deleted ${Math.min(i + 200, toDelete.length)}/${toDelete.length}`);
  }

  console.log(`[dedupe] ✓ Removed ${toDelete.length} duplicate rows. Remaining: ${seen.size}.`);
}

if (import.meta.main) {
  await main();
}
