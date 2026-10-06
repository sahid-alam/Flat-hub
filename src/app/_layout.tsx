import { BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold } from '@expo-google-fonts/manrope';
import { Righteous_400Regular } from '@expo-google-fonts/righteous';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, router } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Pressable, useColorScheme } from 'react-native';

import { BooksProvider, useBooks } from '@/lib/books';
import '@/lib/invite'; // captures an invite code from the opening URL before the auth redirect
import { Icon, UI, usePalette } from '@/ui/kit';

SplashScreen.preventAutoHideAsync();

function Routes() {
  const { session, data } = useBooks();
  const c = usePalette();
  const ready = session === null || (session && data !== undefined);
  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.ground },
        headerShadowVisible: false,
        headerTintColor: c.ink,
        headerTitleStyle: { fontFamily: UI['700'], fontSize: 17 },
        headerBackButtonDisplayMode: 'minimal',
        headerLeft: Back, // every pushed screen, not just duties/manage: see Back below
        contentStyle: { backgroundColor: c.ground },
      }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!!session && !data}>
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!!data}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="flat" options={{ presentation: 'modal', title: 'The flat' }} />
        <Stack.Screen name="spend" options={{ presentation: 'modal', title: 'Add a spend' }} />
        <Stack.Screen name="topup" options={{ presentation: 'modal', title: 'Record a top-up' }} />
        <Stack.Screen name="away" options={{ title: 'Away' }} />
        <Stack.Screen name="reimburse" options={{ title: 'To reimburse' }} />
        <Stack.Screen name="statement" options={{ title: 'Statements' }} />
        <Stack.Screen name="statement/[month]" options={{ title: 'Statement' }} />
        <Stack.Screen name="mates" options={{ title: 'Mates' }} />
        <Stack.Screen name="favourites" options={{ title: 'Favourites' }} />
        <Stack.Screen name="stock" options={{ headerShown: false }} />
        <Stack.Screen name="fridge" options={{ headerShown: false }} />
        <Stack.Screen name="shopping" options={{ headerShown: false }} />
        {/* /fridge /shopping /stock are Redirects into the Kitchen tab: no header on the way through. */}
        <Stack.Screen name="duties/manage" options={{ title: 'Manage duties' }} />
        <Stack.Screen name="import" options={{ presentation: 'modal', title: 'Import Zepto order' }} />
      </Stack.Protected>
    </Stack>
  );
}

/** The web build is deep-linkable, and every screen outside `(tabs)` sits outside the tab bar: a
 *  statement link pasted into the flat's WhatsApp group, opened cold from a Home Screen install,
 *  has no history, no tab bar and no browser chrome — without this there is no way back to the
 *  Kitty. It is the whole Stack's headerLeft, so one cold deep link can never strand anyone. */
function Back() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={router.canGoBack() ? 'Back' : 'Kitty'}
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      style={({ pressed }) => [
        { minHeight: 48, minWidth: 48, justifyContent: 'center' },
        pressed && { opacity: 0.6 },
      ]}>
      <Icon name={{ ios: 'chevron.left', android: 'chevron_left' }} size={22} />
    </Pressable>
  );
}

export default function RootLayout() {
  const scheme = useColorScheme();
  const c = usePalette();
  const [fontsLoaded] = useFonts({
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Righteous_400Regular,
  });
  if (!fontsLoaded) return null;
  // Dark is the primary look; light (ivory) only when the phone asks for it.
  const base = scheme === 'light' ? DefaultTheme : DarkTheme;
  const theme = {
    ...base,
    colors: { ...base.colors, background: c.ground, card: c.ground, text: c.ink, border: c.hair, primary: c.accentText },
  };
  return (
    <ThemeProvider value={theme}>
      <StatusBar style={scheme === 'light' ? 'dark' : 'light'} />
      <BooksProvider>
        <Routes />
      </BooksProvider>
    </ThemeProvider>
  );
}
