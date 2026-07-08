import { NextRequest, NextResponse } from 'next/server';

// athle.fr expose deux index d'autocomplétion :
//   mode=1 → recherche par NOM (patronyme), gère aussi "NOM Prénom"
//   mode=2 → recherche par PRÉNOM
// Il est de plus sensible aux accents ("chloé" ne matche pas, "chloe" oui) et à
// l'ordre des mots ("louise steyer" ne matche pas, "steyer louise" oui).
// On interroge donc les deux modes, sans accents, et on tente l'ordre inversé
// pour les requêtes en deux mots, puis on fusionne les résultats.

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

async function autocomplete(query: string, mode: 1 | 2): Promise<any[]> {
  const url = `https://www.athle.fr/ajax/autocompletion.aspx?mode=${mode}&recherche=${encodeURIComponent(query)}`;
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      'Accept': 'application/json, text/javascript, */*',
      'Referer': 'https://www.athle.fr/',
    },
    signal: AbortSignal.timeout(8000),
  });
  const text = (await resp.text()).trim();
  let arr: any[];
  if (text.startsWith('[')) {
    arr = JSON.parse(text);
  } else {
    // JSONP éventuel : callback([...])
    const match = text.match(/\[[\s\S]*\]/);
    arr = match ? JSON.parse(match[0]) : [];
  }
  return Array.isArray(arr) ? arr : [];
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('q');
  if (!raw || !raw.trim()) return NextResponse.json([]);

  const query = stripAccents(raw.trim());
  const words = query.split(/\s+/).filter(Boolean);

  // Variantes interrogées.
  const variants: Array<[string, 1 | 2]> = [
    [query, 1], // par nom
    [query, 2], // par prénom
  ];
  if (words.length === 2) {
    // "Prénom Nom" saisi → athle.fr attend "Nom Prénom"
    variants.push([`${words[1]} ${words[0]}`, 1]);
  }

  try {
    const lists = await Promise.all(
      variants.map(([q, m]) => autocomplete(q, m).catch(() => [])),
    );

    const seen = new Set<string>();
    const results: Array<{ id: string; nom: string; raw: any }> = [];
    for (const arr of lists) {
      for (const item of arr) {
        const id = String(item?.actseq || '');
        if (!id || seen.has(id)) continue;
        seen.add(id);
        results.push({ id, nom: item?.nom || '', raw: item });
      }
    }

    return NextResponse.json(results.slice(0, 40));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
