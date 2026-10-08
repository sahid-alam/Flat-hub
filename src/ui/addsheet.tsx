// The add sheet. Four labelled tiles, Pinterest-style — a radial or arc menu was rejected, and
// PATTERNS §7 warns specifically against parking *destinations* in an action menu, so the kitty and
// the profile are not in here. Four fits; six is the ceiling.
//
// It grows out of the + circle rather than sliding up from the screen edge: "the animation should
// look like coming from the + icon/button." The transform origin is arithmetic — addButtonCentre()
// in navbar.tsx derives it from the same constants that lay the capsule out, so nothing is measured.
//
// This is the one custom sheet in the app, and it overrides DESIGN.md rule 11 (which said there was
// none). The rule is amended there rather than quietly broken here.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatINR } from '@/domain/money';
import { suggestedTopup } from '@/domain/kitty';
import { useHousehold } from '@/lib/books';
import { addButtonCentre } from '@/ui/navbar';
import { Icon, T, usePalette, type IconName } from '@/ui/kit';

const IN = { duration: 280, easing: Easing.out(Easing.cubic) } as const;
const OUT = { duration: 180, easing: Easing.in(Easing.cubic) } as const;
/** How small the sheet starts: the + circle is a small round thing, so the sheet comes out of a point. */
const FROM = 0.2;

export function AddSheet({ onClose }: { onClose: () => void }) {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { books, me, isTreasurer } = useHousehold();
  const origin = addButtonCentre(width, insets.bottom);

  // Both the entry and the exit are driven from one effect: the shared value is never written from
  // a callback, which is what keeps the animation's only writer in one place (and the linter happy).
  // Reduced motion makes both durations 0 by itself — withTiming defaults to ReduceMotion.System.
  const [leaving, setLeaving] = useState(false);
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(leaving ? 0 : 1, leaving ? OUT : IN);
    if (!leaving) return;
    const t = setTimeout(onClose, OUT.duration);
    return () => clearTimeout(t);
  }, [leaving, onClose, p]);
  const close = () => setLeaving(true);

  const scrim = useAnimatedStyle(() => ({ opacity: p.value }));
  const sheet = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ scale: FROM + (1 - FROM) * p.value }],
  }));

  const topup = suggestedTopup(books, me.id);
  const go = (path: string) => () => {
    close();
    router.push(path as never);
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }, scrim]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close the add sheet"
          onPress={close}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Animated.View
        accessibilityViewIsModal
        style={[
          styles.sheet,
          {
            backgroundColor: c.surface,
            borderColor: c.edge,
            paddingBottom: insets.bottom + 20,
            // the growth emanates from the + button's column, at the sheet's lower edge. The button's
            // centre is ~42px further down, which at this scale is not a distance anyone can see.
            transformOrigin: [origin.x, '100%', 0],
          },
          sheet,
        ]}>
        <View style={[styles.grab, { backgroundColor: c.hair }]} />
        <View style={styles.head}>
          <T size={20} weight="800">
            Add
          </T>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={close}
            style={({ pressed }) => [styles.x, pressed && { opacity: 0.6 }]}>
            <Icon name={{ ios: 'xmark', android: 'close' }} size={18} color={c.muted} />
          </Pressable>
        </View>
        <View style={styles.tiles}>
          <SheetTile
            label="Log a spend"
            icon={{ ios: 'wallet.bifold', android: 'account_balance_wallet' }}
            onPress={go('/spend')}
          />
          <SheetTile label="Import an order" icon={{ ios: 'doc.viewfinder', android: 'receipt_long' }} onPress={go('/import')} />
          <SheetTile
            // the treasurer records top-ups; everyone else pays one
            label={isTreasurer ? 'Record a top-up' : topup ? `Pay ${formatINR(topup)}` : 'Record a top-up'}
            icon={{ ios: 'arrow.up.right', android: 'north_east' }}
            onPress={go('/topup')}
          />
          <SheetTile
            label="Add to the list"
            icon={{ ios: 'cart', android: 'shopping_cart' }}
            onPress={go('/shopping')}
          />
        </View>
      </Animated.View>
    </View>
  );
}

/** Every tile is labelled — an icon-only action grid is a guessing game for six people. */
function SheetTile({ label, icon, onPress }: { label: string; icon: IconName; onPress: () => void }) {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: c.raised },
        pressed && { transform: [{ scale: 0.97 }] },
      ]}>
      <Icon name={icon} size={24} color={c.ink} />
      <T size={14.5} weight="700" numberOfLines={2}>
        {label}
      </T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    paddingTop: 10,
    paddingHorizontal: 16,
    gap: 14,
  },
  grab: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  x: { width: 48, height: 48, alignItems: 'flex-end', justifyContent: 'center' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    // two across, whatever the phone's width
    flexGrow: 1,
    flexBasis: '45%',
    minHeight: 96,
    borderRadius: 20,
    padding: 14,
    gap: 10,
    justifyContent: 'space-between',
  },
});
