import { NextResponse } from 'next/server';
import { listAthletes } from '@/lib/storage';

// Roster des athlètes suivis, lu exclusivement depuis la base.
// Rien n'est codé en dur côté application (voir HomeClient).
export async function GET() {
  try {
    const athletes = await listAthletes();
    return NextResponse.json({ ok: true, athletes });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
