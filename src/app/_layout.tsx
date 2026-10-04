import { BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold } from '@expo-google-fonts/manrope';
import { Righteous_400Regular } from '@expo-google-fonts/righteous';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { BooksProvider, useBooks } from '@/lib/books';
import '@/lib/invite'; // captures an invite code from the opening URL before the auth redirect
import { UI, usePalette } from '@/ui/kit';

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
        contentStyle: { backgroundColor: c.ground },
      }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!!session && !data}>
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!!data}>
        <Stack.Screen name="index" options={{ headerShown: false, title: 'Kitty' }} />
        <Stack.Screen name="spend" options={{ presentation: 'modal', title: 'Add a spend' }} />
        <Stack.Screen name="topup" options={{ presentation: 'modal', title: 'Record a top-up' }} />
        <Stack.Screen name="away" options={{ title: 'Away' }} />
        <Stack.Screen name="reimburse" options={{ title: 'To reimburse' }} />
        <Stack.Screen name="statement" options={{ title: 'Month statement' }} />
        <Stack.Screen name="mates" options={{ title: 'Mates' }} />
        <Stack.Screen name="favourites" options={{ title: 'Favourites' }} />
        <Stack.Screen name="import" options={{ presentation: 'modal', title: 'Import Zepto order' }} />
      </Stack.Protected>
    </Stack>
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
