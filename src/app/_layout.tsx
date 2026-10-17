import { BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import {
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import { Righteous_400Regular } from '@expo-google-fonts/righteous';
import { DarkTheme, DefaultTheme, ThemeProvider, router, type ErrorBoundaryProps } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Pressable, View, useColorScheme } from 'react-native';

import { BooksProvider, useBooks } from '@/lib/books';
import '@/lib/invite'; // captures an invite code from the opening URL before the auth redirect
import { Block, Icon, MagnetButton, T, UI, usePalette } from '@/ui/kit';
import { Stack } from '@/ui/stack'; // platform split: native stack on the APK, the JS card stack on web, so screens animate at all

SplashScreen.preventAutoHideAsync();

function Routes() {
  const { session, data, reload, loadError } = useBooks();
  const c = usePalette();
  // A failed read counts as ready: the splash has to lift either way, or a dropped connection on
  // the first open is indistinguishable from a hung app.
  const ready = session === null || (session && (data !== undefined || loadError !== null));
  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;
  if (loadError && data === undefined) return <Unreachable detail={loadError} onRetry={reload} />;

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
        // Web only: the JS card stack reads cardStyle, the native stack ignores it. A spread, because the
        // types follow stack.ts (native), which has no such option. The card stack has a "page
        // overflow" mode for every non-modal screen: it drops the screen's height limit and expects
        // document.body to scroll. index.html sets `body { overflow: hidden }`, so nothing scrolls and
        // a screen taller than the phone is cut off — Edit duty's Save sat 1,059px below the fold,
        // unreachable. flex: 1 bounds the card again, so each screen's own ScrollView does the
        // scrolling, as modals already do.
        ...{ cardStyle: { flex: 1, backgroundColor: c.ground } },
        // The push. On web `presentation: 'modal'` is a no-op, so the modal screens below name
        // slide_from_bottom themselves; on native the presentation still does the work.
        animation: 'slide_from_right',
      }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!!session && !data}>
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!!data}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        {/* the kitty ledger: off the tab bar in V3, reached from Home's brass tile */}
        <Stack.Screen name="kitty" options={{ title: 'The kitty' }} />
        <Stack.Screen name="flat" options={{ presentation: 'modal', animation: 'slide_from_bottom', title: 'The flat' }} />
        <Stack.Screen name="spend" options={{ presentation: 'modal', animation: 'slide_from_bottom', title: 'Add a spend' }} />
        <Stack.Screen name="topup" options={{ presentation: 'modal', animation: 'slide_from_bottom', title: 'Record a top-up' }} />
        <Stack.Screen name="away" options={{ title: 'Away' }} />
        <Stack.Screen name="reimburse" options={{ title: 'To reimburse' }} />
        <Stack.Screen name="bills" options={{ title: 'Bills' }} />
        <Stack.Screen name="bills/new" options={{ presentation: 'modal', title: 'Add a bill' }} />
        <Stack.Screen name="bills/[id]" options={{ title: 'Bill' }} />
        <Stack.Screen name="statement" options={{ title: 'Statements' }} />
        <Stack.Screen name="statement/[month]" options={{ title: 'Statement' }} />
        <Stack.Screen name="mates" options={{ title: 'Mates' }} />
        <Stack.Screen name="profile" options={{ title: 'Profile' }} />
        <Stack.Screen name="profile/notifications" options={{ title: 'Notifications' }} />
        <Stack.Screen name="favourites" options={{ title: 'Favourites' }} />
        <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
        <Stack.Screen name="stock" options={{ headerShown: false }} />
        <Stack.Screen name="fridge" options={{ headerShown: false }} />
        <Stack.Screen name="shopping" options={{ headerShown: false }} />
        {/* /fridge /shopping /stock are Redirects into the Kitchen tab: no header on the way through. */}
        <Stack.Screen name="duties/manage" options={{ title: 'Duties' }} />
        <Stack.Screen name="calendar" options={{ title: 'Calendar' }} />
        <Stack.Screen name="duties/edit" options={{ title: 'Edit duty' }} />
        <Stack.Screen name="import" options={{ presentation: 'modal', animation: 'slide_from_bottom', title: 'Read a bill' }} />
      </Stack.Protected>
    </Stack>
  );
}

/** The web build is deep-linkable, and every screen outside `(tabs)` sits outside the tab bar: a
 *  statement link pasted into the flat's WhatsApp group, opened cold from a Home Screen install,
 *  has no history, no tab bar and no browser chrome — without this there is no way back to Home.
 *  It is the whole Stack's headerLeft, so one cold deep link can never strand anyone. */
function Back() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={router.canGoBack() ? 'Back' : 'Home'}
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      style={({ pressed }) => [
        { minHeight: 48, minWidth: 48, justifyContent: 'center' },
        pressed && { opacity: 0.6 },
      ]}>
      <Icon name={{ ios: 'chevron.left', android: 'chevron_left' }} size={22} />
    </Pressable>
  );
}

/** The kitty's own tables did not come back. Not a crash — the connection, usually — so it says so
 *  and offers the one thing that helps, rather than a splash screen that never lifts. */
function Unreachable({ detail, onRetry }: { detail: string; onRetry: () => Promise<void> }) {
  const c = usePalette();
  return (
    <View style={{ flex: 1, backgroundColor: c.ground, justifyContent: 'center', padding: 24, gap: 16 }}>
      <T size={24} weight="800">
        Can&apos;t reach the flat
      </T>
      <T size={16} soft>
        FlatHub could not load the kitty. This is almost always the connection — nothing has been
        lost, and nothing has changed.
      </T>
      <Block tone="raised">
        <T size={13} soft>
          {detail}
        </T>
      </Block>
      <MagnetButton label="Try again" color="brass" onPress={() => void onRetry()} />
    </View>
  );
}

/**
 * The last line before a blank screen. Expo Router renders this for any error thrown while
 * rendering anything beneath the root route, and hands back `retry` to re-render the tree.
 *
 * It exists because of a real one: /bills/new threw out of its render body on a bill dated before
 * the flat signed up, and with nothing to catch it the throw unwound past the Stack and left a
 * white page with no way back but a reload. That particular throw is fixed, but "any uncaught
 * render error takes the whole app down and says nothing" is the standing hazard, and six people
 * on their phones cannot open a console to find out what happened.
 *
 * ErrorBoundary must be a plain export named exactly this — Expo Router looks for it by name. The
 * body is a function component so it can still use the palette; the class that catches cannot.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const c = usePalette();
  return (
    <View style={{ flex: 1, backgroundColor: c.ground, justifyContent: 'center', padding: 24, gap: 16 }}>
      <T size={24} weight="800">
        That screen broke
      </T>
      <T size={16} soft>
        Nothing you typed was saved, and nothing in the kitty has changed. Try again, and if it keeps
        happening tell Sahid what you were doing.
      </T>
      <Block tone="raised">
        <T size={13} soft>
          {error?.message ?? 'Unknown error'}
        </T>
      </Block>
      <MagnetButton label="Try again" color="brass" onPress={() => void retry()} />
      {typeof window !== 'undefined' && (
        <MagnetButton label="Reload FlatHub" onPress={() => window.location.reload()} />
      )}
    </View>
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
    Manrope_800ExtraBold,
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
