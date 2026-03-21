import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// ── Dev safety check ──
if (__DEV__) {
  if (!supabaseUrl) console.error('[Supabase] EXPO_PUBLIC_SUPABASE_URL is missing! Check .env file.');
  if (!supabaseAnonKey) console.error('[Supabase] EXPO_PUBLIC_SUPABASE_ANON_KEY is missing! Check .env file.');
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
