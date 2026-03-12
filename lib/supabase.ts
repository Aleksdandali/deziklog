import 'react-native-url-polyfill/dist/setup';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = 'https://csshbetufyocutdislkn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzc2hiZXR1ZnlvY3V0ZGlzbGtuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzMDQ4MjAsImV4cCI6MjA4ODg4MDgyMH0.QUm7jActUqQeYAMLo-pC30AX-PPgFpyy4fhaMGb7vMQ';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
