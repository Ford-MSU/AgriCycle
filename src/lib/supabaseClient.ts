import { createClient, SupabaseClient } from '@supabase/supabase-js';

const rawUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || '';
const rawKey =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim() ||
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ||
  '';

function isPlaceholder(val: string): boolean {
  if (!val) return true;
  const lower = val.toLowerCase();
  return (
    lower.includes('your-project-ref') ||
    lower.includes('your-supabase') ||
    lower === 'my_supabase_url' ||
    lower === 'my_supabase_key'
  );
}

function isSecretKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true;
  // Check JWT payload if it's a standard 3-part JWT
  const parts = key.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(atob(parts[1]));
      if (payload.role === 'service_role') {
        return true;
      }
    } catch {
      // Ignore parse errors
    }
  }
  return false;
}

if (rawKey && isSecretKey(rawKey)) {
  console.error(
    'SECURITY ERROR: A Supabase service_role or secret key was detected in VITE_SUPABASE_PUBLISHABLE_KEY. ' +
      'Never expose secret keys in browser environment variables. Use the publishable / anon key instead.'
  );
}

export const isSupabaseConfigured: boolean =
  Boolean(rawUrl) &&
  Boolean(rawKey) &&
  !isPlaceholder(rawUrl) &&
  !isPlaceholder(rawKey) &&
  !isSecretKey(rawKey) &&
  (rawUrl.startsWith('https://') || rawUrl.startsWith('http://'));

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(rawUrl, rawKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export function getSupabaseClient(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      'Supabase client is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in your environment.'
    );
  }
  return supabase;
}
