import { NextRequest, NextResponse } from 'next/server';
import { parseAthletePage, mergeAthleteData } from '@/lib/parser';
import { getAthlete, saveAthlete, deleteAthlete } from '@/lib/storage';

async function fetchYear(actseq: string, year: number): Promise<string> {
  const resp = await fetch(`https://www.athle.fr/athletes/${actseq}/resultats?saison=${year}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'fr-FR,fr;q=0.9',
      'Referer': 'https://www.athle.fr/',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) throw new Error(`athle.fr HTTP ${resp.status} (saison ${year})`);
  return resp.text();
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ actseq: string }> }
) {
  const { actseq } = await params;
  const forceRefresh = req.nextUrl.searchParams.get('refresh') === '1';

  if (!forceRefresh) {
    const cached = await getAthlete(actseq);
    if (cached) {
      console.log(`[CACHE] actseq=${actseq}`);
      return NextResponse.json({ ok: true, data: cached, source: 'cache' });
    }
  }

  console.log(`[FETCH] athle.fr actseq=${actseq} — récupération de la saison courante…`);
  try {
    // 1. Fetch la saison courante pour obtenir les années disponibles
    const currentYear = new Date().getFullYear();
    const firstHtml = await fetchYear(actseq, currentYear);
    const firstPage = parseAthletePage(firstHtml, currentYear);

    let years = firstPage.availableYears;
    if (years.length === 0) {
      // Athlète inactif cette année — on sonde l'année précédente pour découvrir les saisons réelles
      console.log(`[INFO] Pas de saisons sur ${currentYear}, sondage de ${currentYear - 1}…`);
      try {
        const prevHtml = await fetchYear(actseq, currentYear - 1);
        const prevPage = parseAthletePage(prevHtml, currentYear - 1);
        years = prevPage.availableYears.length > 0 ? prevPage.availableYears : [currentYear - 1];
      } catch {
        years = [currentYear];
      }
    }

    console.log(`[OK] Années disponibles : ${years.join(', ')}`);

    // 2. Fetch toutes les autres années en parallèle
    const otherYears = years.filter(y => y !== currentYear);
    const otherPages = await Promise.all(
      otherYears.map(y =>
        fetchYear(actseq, y)
          .then(html => parseAthletePage(html, y))
          .catch(e => { console.warn(`[WARN] saison ${y}: ${e.message}`); return null; })
      )
    );

    const allPages = [firstPage, ...otherPages.filter(Boolean)] as ReturnType<typeof parseAthletePage>[];
    const data = mergeAthleteData(allPages) as any;

    data._loadedAt = new Date().toLocaleString('fr-FR');
    data._actseq   = actseq;

    await saveAthlete(actseq, data);

    const discCount = Object.keys(data.disciplines ?? {}).length;
    const resCount  = Object.values(data.disciplines ?? {}).reduce((s: number, d: any) => s + d.resultats.length, 0);
    console.log(`[OK] ${discCount} disciplines, ${resCount} résultats — sauvegardés dans Supabase`);

    return NextResponse.json({ ok: true, data, source: 'athle.fr' });
  } catch (e: any) {
    console.error(`[ERR] ${e.message}`);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ actseq: string }> }
) {
  const { actseq } = await params;
  const removed = await deleteAthlete(actseq);
  console.log(`[DELETE] actseq=${actseq} — ${removed ? 'données effacées' : 'rien en cache'}`);
  return NextResponse.json({ ok: true, removed });
}
