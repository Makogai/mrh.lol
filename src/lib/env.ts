// Build-time constants (Vite inlines VITE_*). The anon/publishable key is meant to be public.
const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

export const env = { supabaseUrl: url || null, supabaseAnonKey: key || null } as const;
export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);

/** New `sb_publishable_…` keys belong on `apikey` only (Supabase docs); legacy anon keys are JWTs and also want Bearer. */
export function supabaseHeaders(anonKey: string): Record<string, string> {
  const h: Record<string, string> = { apikey: anonKey, 'Content-Type': 'application/json', Accept: 'application/json' };
  if (anonKey.startsWith('eyJ')) h.Authorization = `Bearer ${anonKey}`;
  return h;
}
