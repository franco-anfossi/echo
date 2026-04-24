
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
if (!supabaseConfigured) {
  console.warn(
    '[echo] Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY — ' +
    'the app will render a setup screen until these are configured.'
  );
}

const isBrowser = typeof window !== 'undefined';
const isWeb = Platform.OS === 'web';
const canPersist = !isWeb || isBrowser;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: canPersist ? AsyncStorage : undefined,
    autoRefreshToken: canPersist,
    persistSession: canPersist,
    detectSessionInUrl: false,
  },
});

if (canPersist) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}

