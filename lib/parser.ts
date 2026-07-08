import * as cheerio from 'cheerio';

const MONTHS: Record<string, number> = {
  'jan': 1, 'janv': 1, 'fév': 2, 'fevr': 2, 'févr': 2, 'mar': 3, 'mars': 3,
  'avr': 4, 'mai': 5, 'jun': 6, 'juin': 6, 'jul': 7, 'juil': 7,
  'aoû': 8, 'aout': 8, 'sep': 9, 'sept': 9, 'oct': 10, 'nov': 11, 'déc': 12, 'dec': 12,
};

// Distances piste où lower = better (espaces enlevés avant comparaison)
const LOWER_TRACK = [
  '50m','60m','80m','100m','120m','200m','400m','800m',
  '1000m','1500m','3000m','5000m','10000m',
  'haies','relais','marche',
];

function isRoadDisc(disc: string): boolean {
  const d = disc.toLowerCase();
  return /\d+\s*km/.test(d)      // "10km", "10 km", "21km500"
    || /km[s]?\b/.test(d)        // "kms", "km" en fin de mot
    || /\b\d+\s*k\b/.test(d)     // "16k" (notation sans m)
    || /\broute\b/.test(d)
    || /marathon/.test(d)
    || /\bsemi\b/.test(d)
    || /\btrail\b/.test(d)
    || /\bcross\b/.test(d)
    || /foul[eé]e/.test(d);
}

function isLower(epreuve: string): boolean {
  const e = epreuve.toLowerCase().replace(/\s/g, '');
  return LOWER_TRACK.some(k => e.includes(k)) || isRoadDisc(epreuve);
}

// Normalise les disciplines "route" en canoniques : "5 km", "10 km", "Semi-marathon"…
function normalizeDisc(raw: string): string {
  const r = raw.toLowerCase();

  // Semi-marathon (21 km)
  if (/semi.?marathon|1\/2.?marathon/.test(r)) return 'Semi-marathon';
  if (/21[,.]?1?\s*km/.test(r) || /\b21\s*km\b/.test(r)) return 'Semi-marathon';

  // Marathon (42 km)
  if (/\bmarathon\b/.test(r) && !/semi|1\/2/.test(r)) return 'Marathon';

  // Distance en km : "5km", "10 km", "foulees de xxx 5km / tcx", "10 km d'ottrott", "28km"…
  const mKm = raw.match(/(\d+(?:[,\.]\d+)?)\s*km/i);
  if (mKm) {
    const km = parseFloat(mKm[1].replace(',', '.'));
    if (!isNaN(km)) return `${Number.isInteger(km) ? km : km} km`;
  }

  // "16k / tcx" → "16 km"
  const mK = raw.match(/^(\d+)\s*k\b/i);
  if (mK) return `${parseInt(mK[1])} km`;

  return raw;
}

// Formate un temps en secondes → "35'31" ou "1h02'30"
function formatRoadTime(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.round(totalSec % 60);
  if (h > 0) return `${h}h${String(m).padStart(2,'0')}'${String(s).padStart(2,'0')}`;
  return `${m}'${String(s).padStart(2,'0')}`;
}

// Vrai pour les disciplines où X'YY sans centièmes = mm'ss (demi-fonds/fonds)
function medalFromPlace(place: string): 'or' | 'argent' | 'bronze' | null {
  const p = place.toLowerCase().trim();
  if (/^(vice[ -]?champion|2[eè]me|2e\b)/.test(p)) return 'argent';
  if (/^3[eè]me/.test(p)) return 'bronze';
  if (/^(champion|1er\b|1[eè]re\b)/.test(p)) return 'or';
  return null;
}

function isMiddleLong(disc: string): boolean {
  const e = disc.toLowerCase().replace(/\s/g, '');
  return /^[89]\d{2}m/.test(e)       // 800m–999m
    || /^\d{4,}m/.test(e)            // 1000m et +
    || isRoadDisc(disc);
}

// Parse une performance brute depuis athle.fr
// disc : nom de la discipline (pour choisir le bon format)
function parsePerfStr(raw: string, disc = ''): { perf: number | null; perfStr: string; salle: boolean; dq: boolean } {
  const isMidLng = isMiddleLong(disc);

  // Nettoie : enlève le doublon entre parenthèses "42'04 (42'03)" → "42'04"
  let s = raw.trim().replace(/\s*\([^)]*\)\s*$/, '').trim();

  if (!s || s === '-' || /^(dq|dsq|ab|np)$/i.test(s)) {
    return { perf: null, perfStr: s || 'DQ', salle: false, dq: true };
  }

  // Hauteur/longueur/lancer : "1m30", "4m22", "12m34"
  const mMatch = s.match(/^(\d+)m(\d+)$/i);
  if (mMatch) {
    const perf = parseFloat(`${mMatch[1]}.${mMatch[2].padEnd(2, '0')}`);
    return { perf, perfStr: s, salle: false, dq: false };
  }

  // "1h07'04" ou "1h17'59''" (trailing '' optionnel)
  const hpMatch = s.match(/^(\d+)[hH](\d{1,2})'(\d{2})''?$/);
  if (hpMatch) {
    const perf = parseInt(hpMatch[1]) * 3600 + parseInt(hpMatch[2]) * 60 + parseInt(hpMatch[3]);
    return { perf, perfStr: formatRoadTime(perf), salle: false, dq: false };
  }

  // "1:17:31" (H:MM:SS colon)
  const hmsColonMatch = s.match(/^(\d+):(\d{2}):(\d{2})$/);
  if (hmsColonMatch) {
    const perf = parseInt(hmsColonMatch[1]) * 3600 + parseInt(hmsColonMatch[2]) * 60 + parseInt(hmsColonMatch[3]);
    return { perf, perfStr: formatRoadTime(perf), salle: false, dq: false };
  }

  // "34:02" (MM:SS colon)
  const mmssColonMatch = s.match(/^(\d{1,2}):(\d{2})$/);
  if (mmssColonMatch) {
    const perf = parseInt(mmssColonMatch[1]) * 60 + parseInt(mmssColonMatch[2]);
    return { perf, perfStr: formatRoadTime(perf), salle: false, dq: false };
  }

  // "34'53''" (mm'ss'' sans centièmes — trailing double-quote)
  const mqMatch = s.match(/^(\d+)'(\d{2})''$/);
  if (mqMatch) {
    const perf = parseInt(mqMatch[1]) * 60 + parseInt(mqMatch[2]);
    return { perf, perfStr: formatRoadTime(perf), salle: false, dq: false };
  }

  // "4'27''47" (mm'ss''cc piste — 3 groupes, centièmes < 100)
  const hmsMatch = s.match(/^(\d+)'(\d+)''(\d+)$/) || s.match(/^(\d+)'(\d+)'(\d+)$/);
  if (hmsMatch && parseInt(hmsMatch[2]) < 60 && parseInt(hmsMatch[3]) < 100) {
    const h = parseInt(hmsMatch[1]);
    const perf = h * 60 + parseFloat(`${hmsMatch[2]}.${hmsMatch[3]}`);
    return { perf, perfStr: s.replace("''", '"'), salle: false, dq: false };
  }

  // "26''47" (ss''cc — secondes.centièmes piste)
  const ccMatch = s.match(/^(\d+)''(\d+)$/);
  if (ccMatch) {
    const perf = parseFloat(`${ccMatch[1]}.${ccMatch[2]}`);
    return { perf, perfStr: `${ccMatch[1]}"${ccMatch[2]}`, salle: false, dq: false };
  }

  // "35'31" ou "4'22" :
  // - demi-fond/route : mm'ss  (1500m, 5km…)
  // - sprint piste    : ss'cc  (200m → 26'47)
  const sqMatch = s.match(/^(\d+)'(\d+)$/);
  if (sqMatch) {
    if (isMidLng) {
      const perf = parseInt(sqMatch[1]) * 60 + parseInt(sqMatch[2]);
      return { perf, perfStr: formatRoadTime(perf), salle: false, dq: false };
    } else {
      const perf = parseFloat(`${sqMatch[1]}.${sqMatch[2]}`);
      return { perf, perfStr: `${sqMatch[1]}"${sqMatch[2]}`, salle: false, dq: false };
    }
  }

  // Nombre pur → points (triathlon, classement FFA routes)
  const pts = parseFloat(s);
  if (!isNaN(pts)) return { perf: pts, perfStr: `${pts} pts`, salle: false, dq: false };

  return { perf: null, perfStr: s, salle: false, dq: false };
}

function parseDate(dayMonth: string, year: number): string {
  const parts = dayMonth.trim().split(/\s+/);
  if (parts.length < 2) return '';
  const day = parts[0].replace(/\D/g, '').padStart(2, '0');
  const monthKey = parts[1].toLowerCase().replace(/[.\s]/g, '').substring(0, 4);
  const month = MONTHS[monthKey] ?? MONTHS[monthKey.substring(0, 3)];
  if (!month) return '';
  return `${day}/${String(month).padStart(2, '0')}/${year}`;
}

export interface AthleteData {
  nom: string;
  club: string;
  categorie: string;
  licence: string;
  nee: number | null;
  niveau: { annee: number; niveau: string; pts: number } | null;
  podiums: {
    total:    { or: number; argent: number; bronze: number };
    national: { or: number; argent: number; bronze: number };
    regional: { or: number; argent: number; bronze: number };
    dept:     { or: number; argent: number; bronze: number };
  };
  disciplines: Record<string, {
    lower: boolean;
    unit?: string;
    resultats: Array<{
      date: string; perf: number | null; perfStr: string;
      vent: string; lieu: string; place: number | null;
      comp: string; salle: boolean; dq: boolean; niveau: string;
      pts: number | null;
    }>;
  }>;
}

export function parseAthletePage(html: string, year: number): Partial<AthleteData> & { availableYears: number[] } {
  const $ = cheerio.load(html);

  // ── Années disponibles ──────────────────────────────
  const availableYears: number[] = [];
  $('[data-value]').each((_, el) => {
    const v = parseInt($(el).attr('data-value') ?? '');
    if (v > 2000 && v < 2100) availableYears.push(v);
  });
  $('[value]').each((_, el) => {
    const v = parseInt($(el).attr('value') ?? '');
    if (v > 2000 && v < 2100) availableYears.push(v);
  });
  const uniqueYears = [...new Set(availableYears)].sort((a, b) => b - a);

  // ── Nom ─────────────────────────────────────────────
  const h1 = $('h1.title-2').first().text().replace(/\s+/g, ' ').trim();
  const nom = h1.replace('<br>', ' ').replace(/\s+/g, ' ').trim();

  // ── Infos athlète ───────────────────────────────────
  let club = '', categorie = '', licence = '', nee: number | null = null;
  $('p.text-white').each((_, el) => {
    const label = $(el).find('span.text-blue').text();
    const val   = $(el).text().replace(label, '').trim();
    if (/club/i.test(label))      club      = val;
    if (/catégorie/i.test(label)) categorie = val.replace(/\s*\/\s*/g, '/').trim();
    if (/licence/i.test(label))   licence   = val.split('-')[0].trim();
    if (/né/i.test(label))        nee       = parseInt(val) || null;
  });

  // ── Résultats ────────────────────────────────────────
  const disciplines: AthleteData['disciplines'] = {};
  let bestNiveau = '';
  let bestNiveauPts = 0;

  // Format 1 : table#res_athlete (standard)
  $('table#res_athlete tbody tr').each((_, row) => {
    if ($(row).hasClass('detail-row')) return;

    const tds = $(row).find('td');
    if (tds.length < 9) return;

    const dateRaw  = $(tds[0]).text().trim();
    const epreuve  = $(tds[1]).text().trim();
    const perfRaw  = $(tds[2]).text().trim();
    const vent     = $(tds[3]).text().trim();
    const placeRaw = $(tds[5]).text().trim();
    const niveau   = $(tds[6]).text().trim();
    const ptsRaw   = $(tds[7]).text().trim();
    const lieu     = $(tds[8]).text().trim();

    if (!epreuve || !perfRaw) return;

    const date = parseDate(dateRaw, year);
    const salle = epreuve.toLowerCase().includes('salle') || epreuve.toLowerCase().includes('indoor');
    const place = parseInt(placeRaw) || null;
    const ptsBareme = parseInt(ptsRaw) || null;

    // Discipline normalisée : enlève "- Salle", puis regroupe les courses route
    const discRaw = epreuve.replace(/\s*[-–]\s*salle/i, '').trim();
    const road = isRoadDisc(discRaw);
    const disc = road ? normalizeDisc(discRaw) : discRaw;

    const { perf, perfStr, dq } = parsePerfStr(perfRaw, disc);

    if (!disciplines[disc]) {
      const isTriathlon = disc.toLowerCase().includes('triathlon') || disc.toLowerCase().includes('athlon');
      disciplines[disc] = {
        lower: isLower(disc),
        ...(isTriathlon ? { unit: 'pts' } : {}),
        resultats: [],
      };
    }

    // Évite les doublons : même date + même perf = doublon (50m et 50m-Salle le même jour)
    const isDuplicate = disciplines[disc].resultats.some(r => r.date === date && r.perf === perf);
    if (isDuplicate) return;

    disciplines[disc].resultats.push({
      date, perf, perfStr, vent, lieu, place, comp: '', salle, dq, niveau,
      pts: ptsBareme,
    });

    if (niveau) {
      const pts = ptsBareme ?? 0;
      if (pts > bestNiveauPts) { bestNiveau = niveau; bestNiveauPts = pts; }
    }
  });

  // Format 2 : table tbody alt (colonnes: Saison | Date | Performance | Club | Lig./Dpt. | Lieu)
  // Cherche les tables tbody contenant des headers de discipline, mais exclut les nested/detail tables
  let currentDisc = '';
  $('tbody').each((_, tbody) => {
    const $tbody = $(tbody);
    // Saute table#res_athlete et les nested tables (detail-inner-table)
    if ($tbody.closest('table#res_athlete').length || $tbody.find('.detail-inner-table').length) return;
    // Saute les tbody vides ou sans structure de disciplines
    if (!$tbody.find('.headers').length && !$tbody.find('tr').length) return;

    $(tbody).find('tr').each((_, row) => {
    const $row = $(row);
    if ($row.hasClass('detail-row')) return;

    const tds = $row.find('td');
    if (tds.length === 0) return;

    // Cherche header de discipline
    const headerDiv = $row.find('.headers');
    if (headerDiv.length) {
      const headerText = headerDiv.text().trim();
      // Ignore les sections podiums (Régional, Départemental, National)
      if (!/^(national|r[ée]gional|d[ée]partemental|podium)/i.test(headerText)) {
        currentDisc = headerText;
      }
      return;
    }

    // Row sans th/td ou que th → sauter
    if (!currentDisc || tds.length < 6) return;

    // Check si c'est une row de headers (contient th)
    const ths = $row.find('th');
    if (ths.length) return;

    // Parse : Saison | Date | Performance | Club | Lig./Dpt. | Lieu
    const saisonRaw = $(tds[0]).text().trim();
    const dateRaw   = $(tds[1]).text().trim();
    const perfRaw   = $(tds[2]).text().trim();
    // Club : tds[3]
    // Lig/Dpt : tds[4]
    const lieu      = $(tds[5]).text().trim();

    if (!saisonRaw || !perfRaw) return;

    const saison = parseInt(saisonRaw);
    if (saison < 2000 || saison > 2100) return;

    const date = parseDate(dateRaw, saison);
    const salle = currentDisc.toLowerCase().includes('salle') || currentDisc.toLowerCase().includes('indoor');
    const disc = currentDisc.replace(/\s*[-–]\s*salle/i, '').trim();

    const { perf, perfStr, dq } = parsePerfStr(perfRaw, disc);

    // Skip si pas de perf parsée et marqué DQ
    if (perf === null && dq) return;

    if (!disciplines[disc]) {
      const isTriathlon = disc.toLowerCase().includes('triathlon') || disc.toLowerCase().includes('athlon');
      disciplines[disc] = {
        lower: isLower(disc),
        ...(isTriathlon ? { unit: 'pts' } : {}),
        resultats: [],
      };
    }

    // Évite les doublons : même date + même perf = doublon (60m et 60m-Salle le même jour)
    const isDuplicate = disciplines[disc].resultats.some(r => r.date === date && r.perf === perf);
    if (isDuplicate) return;

    disciplines[disc].resultats.push({
      date, perf, perfStr, vent: '', lieu, place: null, comp: '', salle, dq, niveau: '',
      pts: null,
    });
    });
  });

  const niveauObj = bestNiveau ? { annee: year, niveau: bestNiveau, pts: bestNiveauPts } : null;

  // ── Podiums officiels depuis la section "Podiums" (section_6) ─────────────
  const podiumsChamp = {
    national: { or: 0, argent: 0, bronze: 0 },
    regional: { or: 0, argent: 0, bronze: 0 },
    dept:     { or: 0, argent: 0, bronze: 0 },
  };
  let currentPodLvl: 'national' | 'regional' | 'dept' | null = null;
  $('[data-section="section_6"] table tbody tr').each((_, row) => {
    const $row = $(row);
    if ($row.hasClass('detail-row')) return;
    const headerText = $row.find('.headers').text().trim().toLowerCase();
    if (headerText) {
      currentPodLvl = headerText.includes('national') ? 'national'
        : headerText.includes('gion') ? 'regional'
        : (headerText.includes('part') || headerText.includes('dept')) ? 'dept'
        : null;
      return;
    }
    if (!currentPodLvl) return;
    const tds = $row.find('td');
    if (tds.length < 2) return;
    const medal = medalFromPlace($(tds[1]).text().trim());
    if (medal) podiumsChamp[currentPodLvl][medal]++;
  });

  return {
    nom, club, categorie, licence, nee,
    niveau: niveauObj,
    podiums: {
      total:    { or: 0, argent: 0, bronze: 0 },
      ...podiumsChamp,
    },
    disciplines,
    availableYears: uniqueYears,
  };
}

export function mergeAthleteData(pages: Array<ReturnType<typeof parseAthletePage>>): AthleteData {
  const base = pages[0];
  const merged: AthleteData = {
    nom:       base.nom      ?? '',
    club:      base.club     ?? '',
    categorie: base.categorie ?? '',
    licence:   base.licence  ?? '',
    nee:       base.nee      ?? null,
    niveau:    null,
    podiums: {
    total:    { or: 0, argent: 0, bronze: 0 },
    national: pages[0]?.podiums?.national ?? { or: 0, argent: 0, bronze: 0 },
    regional: pages[0]?.podiums?.regional ?? { or: 0, argent: 0, bronze: 0 },
    dept:     pages[0]?.podiums?.dept     ?? { or: 0, argent: 0, bronze: 0 },
  },
    disciplines: {},
  };

  // Meilleur niveau toutes saisons
  let bestPts = 0;
  for (const p of pages) {
    if (p.niveau && p.niveau.pts > bestPts) { merged.niveau = p.niveau; bestPts = p.niveau.pts; }
  }

  // Fusionner les disciplines
  for (const p of pages) {
    for (const [disc, info] of Object.entries(p.disciplines ?? {})) {
      if (!merged.disciplines[disc]) {
        merged.disciplines[disc] = { lower: info.lower, ...(info.unit ? { unit: info.unit } : {}), resultats: [] };
      }
      merged.disciplines[disc].resultats.push(...info.resultats);
    }
  }

  // Trier chaque discipline par date
  for (const disc of Object.values(merged.disciplines)) {
    disc.resultats.sort((a, b) => {
      const da = a.date.split('/').reverse().join('');
      const db = b.date.split('/').reverse().join('');
      return da.localeCompare(db);
    });
  }

  // Total podiums depuis toutes les courses (place ≤ 3)
  for (const info of Object.values(merged.disciplines)) {
    for (const r of info.resultats) {
      if (r.dq || !r.place || r.place > 3) continue;
      if (r.place === 1) merged.podiums.total.or++;
      else if (r.place === 2) merged.podiums.total.argent++;
      else merged.podiums.total.bronze++;
    }
  }

  return merged;
}
