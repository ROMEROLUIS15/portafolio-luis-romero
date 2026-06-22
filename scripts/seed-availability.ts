/**
 * Seed script — Luis Romero's work availability fact
 * Inserts an explicit, authoritative availability statement (ES + EN) into the
 * `documents` vector store so the agent answers "is he looking for a job?"
 * accurately instead of inferring/hallucinating.
 *
 * Idempotent: deletes any prior rows for this source before inserting, so it is
 * safe to re-run and never duplicates rows (unlike the bulk ingest).
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
    'Disponibilidad laboral de Luis Romero. Sí, Luis está abierto a nuevas oportunidades y disponible para comenzar de inmediato. ' +
    'Busca tanto empleo de tiempo completo (full-time) como AI Engineer o Backend Developer, como proyectos freelance o por contrato. ' +
    'Trabaja de forma remota y está abierto a reubicarse para la posición correcta, incluso a otro país (reubicación internacional). ' +
    'Para conversar sobre oportunidades de trabajo, contrataciones, vacantes o colaboraciones, puedes escribirle a lueduar15@gmail.com.',
  en:
    "Luis Romero's work availability. Yes, Luis is open to new opportunities and available to start right away. " +
    'He is looking for both full-time employment as an AI Engineer or Backend Developer and freelance or contract projects. ' +
    'He works remotely and is open to relocating for the right role, including to another country (international relocation). ' +
    'To discuss job opportunities, hiring, open roles, or collaborations, reach him at lueduar15@gmail.com.',
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
