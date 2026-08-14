/**
 * Seed script — Luis Romero's contact and social links
 * Inserts an explicit, authoritative link list (ES + EN) into the `documents`
 * vector store so the agent answers "what is your LinkedIn?" from fact instead
 * of depending on the CV header chunk surfacing.
 *
 * Exists because the links lived in exactly one chunk — the CV header — and
 * that chunk loses the top-6 on the phrasings visitors actually use. Measured
 * against the live store: "¿Cuál es tu LinkedIn?", "What is your LinkedIn?",
 * "What is your LinkedIn profile?" and "What are your social profiles?" all
 * returned six chunks with the URL in none of them, and the agent answered that
 * it did not have the detail — while "¿Cuál es el LinkedIn de Luis?" answered
 * correctly. Same failure the city had before `profile-availability` carried
 * it: a fact only reachable from a chunk retrieval never returns is a fact the
 * agent does not have.
 *
 * The trailing sentence names the second-person phrasings on purpose. Visitors
 * address the assistant as if it were Luis ("tu LinkedIn"), and the corpus
 * scores every chunk within ~0.03 of every other, so lexical overlap is what
 * decides the top-6. It is written as a statement of who those words refer to,
 * never as an instruction — a retrieved document that tells the model what to
 * do can leak into the answer text.
 *
 * Deliberately carries no availability wording, for the reason spelled out in
 * seed-availability.ts: a contact channel is already an open door.
 *
 * Idempotent: deletes any prior rows for this source before inserting, so it is
 * safe to re-run and never duplicates rows.
 *
 * Usage:
 *   deno run --allow-net --allow-env scripts/seed-contact.ts
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SOURCE = 'profile-contact';

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
    'Enlaces de Luis Romero. ' +
    'LinkedIn: linkedin.com/in/hernandezrs955. ' +
    'GitHub: github.com/ROMEROLUIS15. ' +
    'Portafolio: portafolio-luis-romero.vercel.app. ' +
    'Correo: lueduar15@gmail.com. ' +
    'WhatsApp: +58 424 709 2980. ' +
    'En este portafolio, "tu LinkedIn", "tu perfil de LinkedIn", "tu GitHub", "tus redes" ' +
    'y "tus redes sociales" son los de Luis Romero.',
  en:
    "Luis Romero's links. " +
    'LinkedIn: linkedin.com/in/hernandezrs955. ' +
    'GitHub: github.com/ROMEROLUIS15. ' +
    'Portfolio: portafolio-luis-romero.vercel.app. ' +
    'Email: lueduar15@gmail.com. ' +
    'WhatsApp: +58 424 709 2980. ' +
    'In this portfolio, "your LinkedIn", "your LinkedIn profile", "your GitHub", "your socials" ' +
    "and \"your social profiles\" are Luis Romero's.",
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

  // Idempotency: clear previous contact rows before re-inserting
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

  console.log(`[seed] ✓ Inserted ${rows.length} contact rows.`);
}

if (import.meta.main) {
  await main();
}
