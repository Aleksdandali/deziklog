import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { LargeSecureStore } from './large-secure-store';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// ── Dev safety check ──
if (__DEV__) {
  if (!supabaseUrl) console.error('[Supabase] EXPO_PUBLIC_SUPABASE_URL is missing! Check .env file.');
  if (!supabaseAnonKey) console.error('[Supabase] EXPO_PUBLIC_SUPABASE_ANON_KEY is missing! Check .env file.');
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
  auth: {
    // Native: session encrypted at rest (AES key in Keychain/Keystore, blob in
    // AsyncStorage — see large-secure-store.ts). SecureStore doesn't exist on
    // web, so the web dev build keeps plain AsyncStorage.
    storage: Platform.OS === 'web' ? AsyncStorage : new LargeSecureStore(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
