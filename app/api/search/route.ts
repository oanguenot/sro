import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q');
  if (!q) return NextResponse.json([]);

  try {
    const url = `https://www.athle.fr/ajax/autocompletion.aspx?mode=1&recherche=${encodeURIComponent(q)}`;
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*',
        'Referer': 'https://www.athle.fr/',
      },
      signal: AbortSignal.timeout(8000),
    });

    const text = await resp.text();

    // athle.fr retourne du JSON ou du JSONP — on extrait le tableau
    const trimmed = text.trim();
    let parsed: any[];
    if (trimmed.startsWith('[')) {
      parsed = JSON.parse(trimmed);
    } else {
      // JSONP style: callback([...])
      const match = trimmed.match(/\[[\s\S]*\]/);
      if (!match) return NextResponse.json([]);
      parsed = JSON.parse(match[0]);
    }

    // athle.fr retourne [{actseq, nom, sexe, club}]
    const results = parsed.map((item: any) => ({
      id:  item.actseq || '',
      nom: item.nom   || '',
      raw: item,
    })).filter((r: any) => r.id);

    return NextResponse.json(results);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
