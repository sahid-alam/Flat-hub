import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

export const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL!, process.env.EXPO_PUBLIC_SUPABASE_KEY!, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});

// Refresh tokens only while the app is in the foreground.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) =>
    state === 'active' ? supabase.auth.startAutoRefresh() : supabase.auth.stopAutoRefresh(),
  );
}

/** Ledger inserts carry client ids, so a retried insert that already landed is a success. */
export async function insertOnce(table: string, row: object) {
  const { error } = await supabase.from(table).insert(row);
  if (error && error.code !== '23505') throw error;
}

/** After a failed save with a client id: did it commit anyway (response lost)? Then the user must not
 * edit and resave, because the retry would be a silent no-op on the old values. */
export async function landed(table: string, id: string) {
  const { data } = await supabase.from(table).select('id').eq('id', id).maybeSingle();
  return !!data;
}
