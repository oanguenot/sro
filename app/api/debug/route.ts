import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';

export async function GET(req: NextRequest) {
  const actseq = req.nextUrl.searchParams.get('actseq') ?? '969674';
  const year   = parseInt(req.nextUrl.searchParams.get('year') ?? '2026');

  const url = `https://www.athle.fr/athletes/${actseq}/resultats?saison=${year}`;
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'fr-FR,fr;q=0.9',
      'Referer': 'https://www.athle.fr/',
    },
    signal: AbortSignal.timeout(15000),
  });

  const html = await resp.text();

  // Sauvegarde le HTML brut
  const outPath = path.join(process.cwd(), 'data', `debug_${actseq}_${year}.html`);
  fs.writeFileSync(outPath, html, 'utf8');

  // Analyse les lignes de la table de résultats
  const $ = cheerio.load(html);
  const rows: any[] = [];

  $('table#res_athlete tbody tr').each((_, row) => {
    if ($(row).hasClass('detail-row')) return;
    const tds = $(row).find('td');
    if (tds.length < 5) return;

    const epreuve = $(tds[1]).text().trim();
    if (!/km|route|foul/i.test(epreuve) && !epreuve.includes('500') && !epreuve.includes('000')) return;

    const allTds = Array.from({ length: tds.length }, (_, i) => ({
      i,
      text: $(tds[i]).text().trim().substring(0, 40),
      html: $(tds[i]).html()?.substring(0, 100),
    }));

    rows.push({ epreuve, tdCount: tds.length, tds: allTds });
  });

  return NextResponse.json({ savedTo: outPath, rows });
}
