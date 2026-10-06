// The five-tab shell: Kitty · Kitchen · Add · Duties · Spending. Labels are always on (six flatmates
// should never have to guess an icon), active is brass AND a heavier label, inactive is muted.
// The bar is chrome, so its brass sits outside each screen's one-accent budget.
import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs'; // JS tabs, not unstable-native-tabs: this ships as a web build.
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Block, Icon, Row, Rule, T, TAB_BAR, usePalette } from '@/ui/kit';

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
  // Which way in: the manual form, or a Zepto order. Most of this flat's groceries arrive by Zepto,
  // and /import used to hang off one row under the favourites grid — five taps and a scroll behind
  // the form it is more common than.
  const [asking, setAsking] = useState(false);
  return (
    <>
    <Tabs
      screenOptions={{
        headerShown: false, // every tab screen draws its own pinned header
        // Every tab draws its own pinned header instead of a nav header, so the top inset has to
        // come from here: public/index.html ships viewport-fit=cover, so on a notched iPhone in
        // Home Screen mode the document starts under the status bar and the titles sat behind the
        // clock. (Invisible in a desktop browser, where every inset is 0.)
        sceneStyle: { backgroundColor: c.ground, paddingTop: insets.top },
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
          ...tab('Add', { ios: 'plus', android: 'add' }, 'Add — type a spend, or import a Zepto order'),
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
            e.preventDefault(); // stay on the tab you were on; the sheet opens over it
            setAsking(true);
          },
        }}
      />
      <Tabs.Screen
        name="duties"
        options={tab('Duties', { ios: 'checklist', android: 'checklist' }, 'Duties — today’s turns and the rota')}
      />
      <Tabs.Screen
        name="spending"
        // a stroke glyph, like the other four: filled `bar_chart` read as permanently selected.
        options={tab('Spending', { ios: 'chart.line.uptrend.xyaxis', android: 'show_chart' }, 'Spending — where the money went')}
      />
    </Tabs>
    <AddSheet open={asking} onClose={() => setAsking(false)} />
    </>
  );
}

/** The two ways a spend gets in. Both routes are modals of their own, so this one closes first —
 *  otherwise the sheet sits behind /spend and is still there when you come back.
 *  ponytail: the scrim and the rounded lip are the same shape as the fridge's lot sheet
 *  (src/ui/fridge.tsx:270-277); a shared <Sheet> is worth extracting at the third copy, not the second. */
function AddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const go = (path: '/spend' | '/import') => {
    onClose();
    router.push(path);
  };
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        {/* The backdrop is the sheet's sibling, never its parent: as a wrapper it made every row a
            <button> inside a <button>, which is invalid HTML and reaches a screen reader as one
            control. Esc still closes through onRequestClose. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]}
        />
        <View
          role="dialog"
          accessibilityLabel="Add a spend"
          style={{ backgroundColor: c.ground, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 8 }}>
          <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: c.line }} />
          <View style={{ padding: 16, paddingBottom: insets.bottom + 16, gap: 12 }}>
            <Block style={{ gap: 0, paddingVertical: 4 }}>
              <Row
                label="Add a spend"
                icon={{ ios: 'indianrupeesign', android: 'currency_rupee' }}
                detail="type it"
                onPress={() => go('/spend')}
              />
              <Rule />
              <Row
                label="Import a Zepto order"
                icon={{ ios: 'doc.viewfinder', android: 'receipt_long' }}
                detail="read the bill"
                onPress={() => go('/import')}
              />
            </Block>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              onPress={onClose}
              style={({ pressed }) => [{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }, pressed && { opacity: 0.6 }]}>
              <T size={15} weight="700" soft>
                Cancel
              </T>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
