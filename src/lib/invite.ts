import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';

// An invite link's code has to survive sign-in: the auth guard redirects away from
// /welcome?code=…, and on web the email link may open in another tab.
const KEY = 'flathub.invite';

export const codeOf = (url: string | null): string | undefined => {
  const code = url ? Linking.parse(url).queryParams?.code : undefined;
  return typeof code === 'string' && code ? code : undefined;
};

// captured once at startup, before any redirect
const initial = codeOf(Linking.getLinkingURL());
if (initial) AsyncStorage.setItem(KEY, initial);

export const savedInvite = (): Promise<string | null> => AsyncStorage.getItem(KEY);
export const clearInvite = (): Promise<void> => AsyncStorage.removeItem(KEY);
