import { Baloo2_600SemiBold, Baloo2_800ExtraBold, useFonts } from '@expo-google-fonts/baloo-2';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { BooksProvider, useBooks } from '@/lib/books';
import { DISPLAY, usePalette } from '@/ui/kit';

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
        headerStyle: { backgroundColor: c.enamel },
        headerShadowVisible: false,
        headerTintColor: c.ink,
        headerTitleStyle: { fontFamily: DISPLAY, fontSize: 20 },
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: c.enamel },
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
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const scheme = useColorScheme();
  const [fontsLoaded] = useFonts({ Baloo2_800ExtraBold, Baloo2_600SemiBold });
  if (!fontsLoaded) return null;
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style="auto" />
      <BooksProvider>
        <Routes />
      </BooksProvider>
    </ThemeProvider>
  );
}
