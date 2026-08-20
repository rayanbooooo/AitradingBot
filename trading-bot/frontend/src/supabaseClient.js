import { createClient } from '@supabase/supabase-js';

// Both values are meant to be public/client-side -- unlike the Binance
// keys, Supabase's "anon" key is designed to be embedded in a browser
// bundle. Real per-user data access is enforced server-side via Postgres
// Row Level Security policies, not by keeping this key secret.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// Auth/account features are skipped entirely (not just broken) when these
// aren't set, e.g. a local dev checkout that hasn't been given Supabase
// credentials yet -- the rest of the dashboard still works.
export const supabase = supabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
