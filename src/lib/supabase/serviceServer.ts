import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for server actions that need to bypass RLS
 * (e.g., updating bot_writes audit fields). Use sparingly — only when RLS
 * doesn't grant the operation to authenticated.
 *
 * This is server-only — never call from a Client Component or expose the key.
 */
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
