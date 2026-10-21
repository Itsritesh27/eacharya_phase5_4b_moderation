import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "./env";

/** Browser client. Uses only the publishable key; never a service-role key. */
export function createClient() {
  const env = getSupabaseEnv();
  if (!env) throw new Error("Supabase is not configured. See .env.example.");
  return createBrowserClient(env.url, env.key);
}
