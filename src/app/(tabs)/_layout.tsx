// The shell: four destinations in a floating capsule — Home · Fridge · Duties · Spending — with the
// + as a separate circle outside it. Nav Option A, confirmed.
//
// The kitty is NOT a tab any more: it is reached from the brass tile on Home, which is why that tile
// is unconditional there. Your profile is reached from the avatar. Two destinations fewer in the bar,
// and the + can never show a selected state because it is not a bar item at all.
//
// The bar itself is src/ui/navbar.tsx; it is a custom tabBar, so it re-emits the roles and labels the
// stock one gave us for free. docs/NATIVE_FEEL.md §D4 and §D7.
import { Tabs } from 'expo-router/js-tabs'; // JS tabs, not unstable-native-tabs: this ships as a web build.
import { useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddSheet } from '@/ui/addsheet';
import { usePalette } from '@/ui/kit';
import { CapsuleNav } from '@/ui/navbar';

/** The spoken name for each destination: four of the five bar items are icon-only. */
const ARIA: Record<string, string> = {
  index: 'Home — your morning, the kitty and today in the flat',
  kitchen: 'Fridge — what is in it, the shopping list and the stock',
  duties: 'Duties — today’s turns and the rota',
  spending: 'Spending — where the money went',
};

export default function TabLayout() {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  // The sheet lives here, not in the bar: a sheet rendered inside the tabBar's own container cannot
  // cover the scene above it. The + button just raises the flag.
  const [adding, setAdding] = useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: c.ground }}>
      <Tabs
        tabBar={(props) => <CapsuleNav {...props} onAdd={() => setAdding(true)} />}
        screenOptions={{
          headerShown: false, // every tab screen draws its own pinned header
          // react-navigation defaults tab animation to 'none' with no platform guard, so the APK did not
          // animate either. 'shift' fades the outgoing scene out with a -50px slide and the incoming one in.
          animation: 'shift',
          // Every tab draws its own pinned header instead of a nav header, so the top inset has to
          // come from here: public/index.html ships viewport-fit=cover, so on a notched iPhone in
          // Home Screen mode the document starts under the status bar and the titles sat behind the
          // clock. (Invisible in a desktop browser, where every inset is 0.)
          sceneStyle: { backgroundColor: c.ground, paddingTop: insets.top },
        }}>
        <Tabs.Screen name="index" options={{ title: 'Home', tabBarAccessibilityLabel: ARIA.index }} />
        <Tabs.Screen name="kitchen" options={{ title: 'Fridge', tabBarAccessibilityLabel: ARIA.kitchen }} />
        <Tabs.Screen name="duties" options={{ title: 'Duties', tabBarAccessibilityLabel: ARIA.duties }} />
        <Tabs.Screen name="spending" options={{ title: 'Spending', tabBarAccessibilityLabel: ARIA.spending }} />
      </Tabs>
      {adding && <AddSheet onClose={() => setAdding(false)} />}
    </View>
  );
}
