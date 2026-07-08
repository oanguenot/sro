/**
 * Backfill unique : data/athletes.json -> tables Supabase (athletes + performances).
 *
 * Usage : node scripts/migrate-json-to-supabase.mjs
 * Lit SUPABASE_URL / SUPABASE_ANON_KEY (ou SUPABASE_SERVICE_ROLE_KEY) depuis .env.local.
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

// ── Charge .env.local (parse minimal) ─────────────────
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith('#')) process.env[m[1]] ??= m[2];
  }
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('SUPABASE_URL / SUPABASE_ANON_KEY manquants dans .env.local');
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

// ── Lecture du JSON ───────────────────────────────────
const store = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'data', 'athletes.json'), 'utf8'),
);
const entries = Object.entries(store);
console.log(`${entries.length} athlètes à migrer…`);

function toPerfRows(actseq, data) {
  const rows = [];
  for (const [discipline, info] of Object.entries(data.disciplines ?? {})) {
    for (const r of info.resultats ?? []) {
      rows.push({
        actseq,
        discipline,
        lower: !!info.lower,
        unit: info.unit ?? null,
        date: r.date ?? null,
        perf: r.perf ?? null,
        perf_str: r.perfStr ?? '',
        vent: r.vent ?? '',
        lieu: r.lieu ?? '',
        place: r.place ?? null,
        comp: r.comp ?? '',
        salle: !!r.salle,
        dq: !!r.dq,
        niveau: r.niveau ?? '',
        pts: r.pts ?? null,
      });
    }
  }
  return rows;
}

let totalPerfs = 0;
for (const [actseq, data] of entries) {
  const { error: upErr } = await sb.from('athletes').upsert(
    {
      actseq,
      nom: data.nom ?? '',
      club: data.club ?? '',
      categorie: data.categorie ?? '',
      licence: data.licence ?? '',
      nee: data.nee ?? null,
      niveau: data.niveau ?? null,
      podiums: data.podiums ?? {},
    },
    { onConflict: 'actseq' },
  );
  if (upErr) { console.error(`  ✗ ${actseq} (athlete): ${upErr.message}`); continue; }

  await sb.from('performances').delete().eq('actseq', actseq);

  const rows = toPerfRows(actseq, data);
  // Insertion par lots de 500 lignes.
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await sb.from('performances').insert(chunk);
    if (error) { console.error(`  ✗ ${actseq} (perfs): ${error.message}`); break; }
  }
  totalPerfs += rows.length;
  console.log(`  ✓ ${actseq} — ${data.nom ?? ''} (${rows.length} résultats)`);
}

console.log(`\nTerminé : ${entries.length} athlètes, ${totalPerfs} performances.`);
