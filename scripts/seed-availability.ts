/**
 * Seed script — Luis Romero's professional situation
 * Inserts an explicit, authoritative statement (ES + EN) into the `documents`
 * vector store so the agent answers "where does he work?" / "is he available?"
 * from fact instead of inferring it from the CV chunks.
 *
 * Deliberately states no availability and lists no reasons to get in touch.
 * Luis is employed at Complexity and happy there; any phrasing like "open to
 * new opportunities" or an enumeration of what he accepts (a project, a role)
 * reads to his current employer as one foot out the door. A contact channel in
 * a portfolio is already an open door — nobody needs permission to send an
 * offer — so the text gives the channel and qualifies nothing.
 *
 * Idempotent: deletes any prior rows for this source before inserting, so it is
 * safe to re-run and never duplicates rows.
 *
 * Usage:
 *   deno run --allow-net --allow-env scripts/seed-availability.ts
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SOURCE = 'profile-availability';

const ENV = {
  supabaseUrl:        Deno.env.get('SUPABASE_URL')              ?? '',
  supabaseServiceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  supabaseAnonKey:    Deno.env.get('SUPABASE_ANON_KEY')         ?? '',
} as const;

const missing = Object.entries(ENV).filter(([, v]) => !v).map(([k]) => k);
if (missing.length > 0) {
  console.error(`[seed] Missing env vars: ${missing.join(', ')}`);
  Deno.exit(1);
}

const CONTENT: Record<'es' | 'en', string> = {
  es:
    'Situación profesional de Luis Romero. Trabaja como Backend Developer en Complexity ' +
    '(Texas, Estados Unidos, remoto), un equipo con el que está comprometido y donde disfruta lo que hace. ' +
    'Su terreno es el desarrollo backend y la integración de IA en producción. ' +
    'Luis no publica información sobre su disponibilidad ni sobre si busca otro trabajo; ' +
    'cualquier propuesta o consulta la conversa directamente con quien se la plantea. ' +
    'Si quieres escribirle, puedes hacerlo a lueduar15@gmail.com o por WhatsApp al +58 424 709 2980.',
  en:
    "Luis Romero's professional situation. He works as a Backend Developer at Complexity " +
    '(Texas, United States, remote), a team he is committed to and where he enjoys the work. ' +
    'His ground is backend development and shipping AI to production. ' +
    'Luis does not publish information about his availability or about whether he is looking for other work; ' +
    'any proposal or enquiry is discussed directly with whoever raises it. ' +
    'To write to him: lueduar15@gmail.com or WhatsApp +58 424 709 2980.',
};

async function embed(text: string): Promise<number[]> {
  const res = await fetch(`${ENV.supabaseUrl}/functions/v1/embed`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${ENV.supabaseAnonKey}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ input: text }),
  });
  if (!res.ok) throw new Error(`embed HTTP ${res.status}: ${await res.text()}`);
  return (await res.json()).embedding as number[];
}

async function main(): Promise<void> {
  const supabase = createClient(ENV.supabaseUrl, ENV.supabaseServiceKey);

  // Idempotency: clear previous availability rows before re-inserting
  const del = await supabase.from('documents').delete().eq('metadata->>source', SOURCE);
  if (del.error) throw new Error(`delete failed: ${del.error.message}`);
  console.log(`[seed] Cleared previous "${SOURCE}" rows`);

  const now = new Date().toISOString();
  const rows = [];
  for (const lang of ['es', 'en'] as const) {
    const content = CONTENT[lang];
    const embedding = await embed(content);
    rows.push({ content, embedding, metadata: { source: SOURCE, lang, chunk_index: 0, created_at: now } });
    console.log(`[seed] Embedded ${lang} (${embedding.length} dims)`);
  }

  const { error } = await supabase.from('documents').insert(rows);
  if (error) throw new Error(`insert failed: ${error.message}`);

  console.log(`[seed] ✓ Inserted ${rows.length} availability rows.`);
}

if (import.meta.main) {
  await main();
}
