import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Client Supabase côté serveur (routes Next.js uniquement).
 *
 * Variables d'environnement attendues (voir .env.local) :
 *   SUPABASE_URL       — ex. https://xxxx.supabase.co
 *   SUPABASE_ANON_KEY  — clé publishable / anon
 *
 * On préfère la clé service_role si elle est présente (accès complet,
 * contourne la RLS), sinon on retombe sur la clé anon.
 */
const url =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  '';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!url || !key) {
    throw new Error(
      'Supabase non configuré : définis SUPABASE_URL et SUPABASE_ANON_KEY dans .env.local',
    );
  }
  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
