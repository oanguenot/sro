import { getSupabase } from './supabase';

/**
 * Couche de stockage des athlètes, sur Supabase.
 *
 * Deux tables :
 *   - `athletes`      : le profil de chaque athlète (les "utilisateurs")
 *   - `performances`  : les résultats individuels rattachés à un athlète
 *
 * Le reste de l'application manipule la forme "AthleteData" (voir lib/parser.ts) :
 * un objet avec un dictionnaire `disciplines`, chacune contenant ses `resultats`.
 * Ces helpers font la conversion entre cette forme et les deux tables.
 */

interface PerfRow {
  actseq: string;
  discipline: string;
  lower: boolean;
  unit: string | null;
  date: string | null;
  perf: number | null;
  perf_str: string;
  vent: string;
  lieu: string;
  place: number | null;
  comp: string;
  salle: boolean;
  dq: boolean;
  niveau: string;
  pts: number | null;
}

// Aplati le dictionnaire `disciplines` en lignes de la table `performances`.
function toPerfRows(actseq: string, data: any): PerfRow[] {
  const rows: PerfRow[] = [];
  for (const [discipline, info] of Object.entries<any>(data.disciplines ?? {})) {
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

// Reconstruit le dictionnaire `disciplines` depuis des lignes ordonnées par id.
function toDisciplines(rows: PerfRow[]): Record<string, any> {
  const disciplines: Record<string, any> = {};
  for (const row of rows) {
    let disc = disciplines[row.discipline];
    if (!disc) {
      disc = {
        lower: row.lower,
        ...(row.unit ? { unit: row.unit } : {}),
        resultats: [],
      };
      disciplines[row.discipline] = disc;
    }
    disc.resultats.push({
      date: row.date ?? '',
      perf: row.perf,
      perfStr: row.perf_str,
      vent: row.vent,
      lieu: row.lieu,
      place: row.place,
      comp: row.comp,
      salle: row.salle,
      dq: row.dq,
      niveau: row.niveau,
      pts: row.pts,
    });
  }
  return disciplines;
}

export async function getAthlete(actseq: string): Promise<any | null> {
  const sb = getSupabase();

  const { data: athlete, error } = await sb
    .from('athletes')
    .select('*')
    .eq('actseq', actseq)
    .maybeSingle();

  if (error) throw new Error(`Supabase getAthlete: ${error.message}`);
  if (!athlete) return null;

  const { data: perfs, error: perfErr } = await sb
    .from('performances')
    .select('*')
    .eq('actseq', actseq)
    .order('id', { ascending: true });

  if (perfErr) throw new Error(`Supabase getAthlete (perfs): ${perfErr.message}`);

  return {
    nom: athlete.nom,
    club: athlete.club,
    categorie: athlete.categorie,
    licence: athlete.licence,
    nee: athlete.nee,
    niveau: athlete.niveau,
    podiums: athlete.podiums,
    disciplines: toDisciplines((perfs ?? []) as PerfRow[]),
    _actseq: actseq,
    _loadedAt: athlete.loaded_at
      ? new Date(athlete.loaded_at).toLocaleString('fr-FR')
      : undefined,
  };
}

export async function saveAthlete(actseq: string, data: any): Promise<void> {
  const sb = getSupabase();
  const now = new Date().toISOString();

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
      loaded_at: now,
      updated_at: now,
    },
    { onConflict: 'actseq' },
  );
  if (upErr) throw new Error(`Supabase saveAthlete: ${upErr.message}`);

  // On remplace intégralement les performances de l'athlète.
  const { error: delErr } = await sb
    .from('performances')
    .delete()
    .eq('actseq', actseq);
  if (delErr) throw new Error(`Supabase saveAthlete (clean): ${delErr.message}`);

  const rows = toPerfRows(actseq, data);
  if (rows.length > 0) {
    const { error: insErr } = await sb.from('performances').insert(rows);
    if (insErr) throw new Error(`Supabase saveAthlete (insert): ${insErr.message}`);
  }
}

export async function deleteAthlete(actseq: string): Promise<boolean> {
  const sb = getSupabase();

  // on delete cascade supprime aussi les performances.
  const { data, error } = await sb
    .from('athletes')
    .delete()
    .eq('actseq', actseq)
    .select('actseq');

  if (error) throw new Error(`Supabase deleteAthlete: ${error.message}`);
  return (data?.length ?? 0) > 0;
}
