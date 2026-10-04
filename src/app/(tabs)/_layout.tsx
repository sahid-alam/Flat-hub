// The five-tab shell: Kitty · Kitchen · Add · Duties · Spending. Labels are always on (six flatmates
// should never have to guess an icon), active is brass AND a heavier label, inactive is muted.
// The bar is chrome, so its brass sits outside each screen's one-accent budget.
import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs'; // JS tabs, not unstable-native-tabs: this ships as a web build.
import { View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, T, TAB_BAR, usePalette } from '@/ui/kit';

type IconName = { ios: string; android: string };

/** One tab's options: an icon, a label that gets heavier when selected, and a spoken name. */
function tab(label: string, icon: IconName, aria: string) {
  return {
    title: label,
    tabBarAccessibilityLabel: aria,
    // The tints are our own token strings, never a platform OpaqueColorValue.
    tabBarIcon: ({ color, focused }: { color: ColorValue; focused: boolean }) => (
      <Icon name={icon} size={focused ? 24 : 22} color={color as string} />
    ),
    tabBarLabel: ({ color, focused }: { color: ColorValue; focused: boolean }) => (
      <T size={11} weight={focused ? '700' : '600'} color={color as string}>
        {label}
      </T>
    ),
  };
}

export default function TabLayout() {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false, // every tab screen draws its own pinned header
        sceneStyle: { backgroundColor: c.ground },
        tabBarLabelPosition: 'below-icon', // react-navigation flips to beside-icon on wide web viewports
        tabBarActiveTintColor: c.accentText,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: {
          position: 'absolute',
          height: TAB_BAR + insets.bottom,
          paddingBottom: insets.bottom,
          backgroundColor: c.surface,
          borderTopWidth: 1,
          borderTopColor: c.hair,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={tab('Kitty', { ios: 'indianrupeesign.circle', android: 'account_balance_wallet' }, 'Kitty — the balance, top-ups and recent entries')}
      />
      <Tabs.Screen
        name="kitchen"
        options={tab('Kitchen', { ios: 'refrigerator', android: 'kitchen' }, 'Kitchen — fridge, shopping and stock')}
      />
      <Tabs.Screen
        name="add"
        options={{
          ...tab('Add', { ios: 'plus', android: 'add' }, 'Add a spend — opens the spend sheet'),
          // The centre is an action, not a destination: a filled mark, never the selected state.
          // The icon box is 31x28 by default (Apple HIG sizes), so the 34pt mark gets its own.
          tabBarIconStyle: { width: 34, height: 34 },
          tabBarIcon: () => (
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                backgroundColor: c.solid,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Icon name={{ ios: 'plus', android: 'add' }} size={20} color={c.onSolid} />
            </View>
          ),
          tabBarLabel: () => (
            <T size={11} weight="600" color={c.ink}>
              Add
            </T>
          ),
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault(); // stay on the tab you were on; /spend opens over it as a modal
            router.push('/spend');
          },
        }}
      />
      <Tabs.Screen
        name="duties"
        options={tab('Duties', { ios: 'checklist', android: 'checklist' }, 'Duties — today’s turns and the rota')}
      />
      <Tabs.Screen
        name="spending"
        options={tab('Spending', { ios: 'chart.bar', android: 'bar_chart' }, 'Spending — where the money went')}
      />
    </Tabs>
  );
}
