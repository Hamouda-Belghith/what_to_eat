import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Client Supabase créé paresseusement (lazy) : si les variables
// d'environnement ne sont pas définies (build, SSR), on renvoie null
// plutôt que de planter. L'UI gère l'état "non configuré" (écran de
// configuration) au lieu de faire crasher l'app.
//
// NEXT_PUBLIC_* car utilisées côté navigateur (clé "anon", publique par
// design ; la sécurité réelle repose sur les policies RLS).
export type Supabase = SupabaseClient<Database>;

let cachedClient: Supabase | null = null;

export function getSupabase(): Supabase | null {
  if (cachedClient) return cachedClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) return null;

  cachedClient = createClient<Database>(url, anonKey);
  return cachedClient;
}
