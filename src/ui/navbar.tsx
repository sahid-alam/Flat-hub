// The floating capsule nav. One capsule holding four destinations, the active one expanded into a
// pill with a filled icon badge and its label; the + is a separate circle outside it, so it
// structurally cannot take the selected state.
//
// It is a FLIP, and that is not a stylistic choice — docs/NATIVE_FEEL.md §D3 measured it. Animating
// `width` on flex siblings makes the icon row bulge ~19px on every switch (the growing and shrinking
// pills are not complementary mid-flight under an ease-out curve, and in flex every sibling's
// position is a function of its predecessors' widths) and snap **27.5px in a single frame** on a
// double tap. Plain CSS on width halves that to 12.2px. FLIP measured **0px**.
//
// So: every slot is `position: 'absolute'` at its FINAL left/width in one layout pass, and all
// visible motion is carried by `translateX` + `scaleX` from where the slot actually was. Absolute
// positioning is what makes a slot's position independent of every other slot's width, and that
// independence is the whole mechanism. **If you are about to simplify this back to animating width,
// re-measure the 0px column first.**
//
// Nothing is measured at runtime: `geom()` is arithmetic over four constants and the active index.
// No onLayout, no measureInWindow, so there is no measure→setState→re-render round trip to land a
// frame late and fight the animation. EXPANDED was measured once, offline — see the constant.
//
// A custom tabBar throws away everything the stock bar emitted (BottomTabItem.js:104 aria-label,
// :109 aria-selected, role="tab"), and four of the five items are icon-only. §D7's list is re-added
// by hand below; none of it is optional.
import { type ComponentProps, useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { Tabs } from 'expo-router/js-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, UI, usePalette, type Palette } from '@/ui/kit';

// @react-navigation/bottom-tabs is not a direct dependency, so the props type is derived from the
// navigator we already import rather than adding one.
type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const ICON = 48; // a collapsed slot, and the tap-target floor (§D7). Never smaller.
// Measured once, offline, with canvas.measureText against the app's real font: the longest label,
// "Spending", is 60.0px at Manrope_700Bold 13px and 61.3px in the system fallback — a 1.3px (2%)
// shift at font swap. At 12px it is ~55px, plus a 34px badge, an 8px gap and 6px of padding either
// side. Hardcoded on purpose: measuring with onLayout buys a visible twitch at font swap and a
// second layout pass on every cold load. §D5.
const EXPANDED = 110;
const GAP = 4;
const PAD = 6;
const BADGE = 34; // the filled circular icon badge inside the active pill
const H = ICON + PAD * 2; // 60: the capsule's height, and it never changes
const FAB = 56;
const FAB_GAP = 10;
const FLOAT = 12; // how far the capsule floats above the safe area

const TIMING = { duration: 280, easing: Easing.out(Easing.cubic) } as const;

/** The four destinations, in DOM and focus order. The + is not one of them, by design. */
const DEST = [
  { route: 'index', label: 'Home', icon: { ios: 'house', android: 'home' } },
  { route: 'kitchen', label: 'Fridge', icon: { ios: 'refrigerator', android: 'kitchen' } },
  { route: 'duties', label: 'Duties', icon: { ios: 'checklist', android: 'checklist' } },
  { route: 'spending', label: 'Spending', icon: { ios: 'chart.line.uptrend.xyaxis', android: 'show_chart' } },
] as const;

/**
 * Pure: every slot's final left and width for a given active index. Exactly one slot is expanded at
 * all times, so `total` is **constant** — the outer capsule never resizes at all, which removes a
 * whole class of jitter for free. If a design ever expands two slots at once, the container has to
 * be driven with scaleX too, never with width.
 */
export function geom(active: number) {
  let acc = PAD;
  const xs: number[] = [];
  const ws: number[] = [];
  for (let i = 0; i < DEST.length; i++) {
    const w = i === active ? EXPANDED : ICON;
    xs.push(acc);
    ws.push(w);
    acc += w + GAP;
  }
  return { xs, ws, total: acc - GAP + PAD };
}

export const NAV_WIDTH = geom(0).total + FAB_GAP + FAB;
/**
 * Where the + circle's centre sits, so the add sheet can grow out of it — "the animation should look
 * like coming from the + icon/button", in the owner's words. Arithmetic, not a measurement: the row
 * is centred, and both its width and the capsule's are constants.
 */
export const addButtonCentre = (screenWidth: number, bottomInset: number) => ({
  x: screenWidth / 2 + NAV_WIDTH / 2 - FAB / 2,
  fromBottom: bottomInset + FLOAT + H / 2,
});
/** What a tab screen must clear with `padBottom` so the capsule never covers content (rule 8). */
export const NAV_HEIGHT = H + FLOAT;

export function CapsuleNav({ state, descriptors, navigation, onAdd }: TabBarProps & { onAdd: () => void }) {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  // The active index is read off the route NAME, not off state.index: the order of files in the
  // directory is Metro's business, and DEST's order is the design's.
  const activeName = state.routes[state.index]?.name;
  const active = Math.max(0, DEST.findIndex((d) => d.route === activeName));
  const to = geom(active);

  return (
    <View
      pointerEvents="box-none"
      style={[styles.dock, { paddingBottom: insets.bottom + FLOAT }]}>
      <View style={styles.row}>
        <View
          accessibilityRole="tablist"
          style={[styles.capsule, { width: to.total, backgroundColor: c.navRest }]}>
          {DEST.map((d, i) => {
            const route = state.routes.find((r) => r.name === d.route);
            if (!route) return null; // a destination whose route file is not there yet
            const options = descriptors[route.key]?.options;
            return (
              <Slot
                key={d.route}
                dest={d}
                x={to.xs[i]}
                w={to.ws[i]}
                selected={i === active}
                palette={c}
                label={options?.tabBarAccessibilityLabel ?? d.label}
                onPress={() => {
                  // the standard custom-bar contract: let a screen's listener cancel the navigation
                  const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                  if (!event.defaultPrevented) navigation.navigate(route.name, route.params);
                }}
              />
            );
          })}
        </View>
        <Add onAdd={onAdd} />
      </View>
    </View>
  );
}

/**
 * One slot. It renders at its FINAL left/width immediately and animates in from where it was.
 *
 * The geometry is held in two per-slot shared values rather than one shared progress with a
 * captured `from`. Reanimated retargets a `withTiming` from the value the spring is *currently* at,
 * so an interrupted switch continues from mid-flight instead of snapping back to the previous
 * index's geometry — which is exactly the failure FLIP is here to prevent, and the one place a
 * hand-rolled FLIP is easy to get wrong (§D4's last caveat).
 *
 * Reduced motion needs no code: withTiming defaults to ReduceMotion.System, and Reanimated reads
 * `prefers-reduced-motion` itself on web (ReducedMotion.js:8), so this falls back to an instant
 * swap. That is a real reason to prefer it over a CSS transition, which would need a media query
 * nothing in the build reminds you to write. §D6.
 */
function Slot({
  dest,
  x,
  w,
  selected,
  palette: c,
  label,
  onPress,
}: {
  dest: (typeof DEST)[number];
  x: number;
  w: number;
  selected: boolean;
  palette: Palette;
  label: string;
  onPress: () => void;
}) {
  const sx = useSharedValue(x); // initialised at the target, so the first render does not fly in
  const sw = useSharedValue(w);
  useEffect(() => {
    sx.value = withTiming(x, TIMING);
    sw.value = withTiming(w, TIMING);
  }, [x, w, sx, sw]);

  /** How expanded this slot is, 0…1. One value drives geometry, opacity and colour on one clock. */
  const p = () => {
    'worklet';
    return interpolate(sw.value, [ICON, EXPANDED], [0, 1], Extrapolation.CLAMP);
  };

  const box = useAnimatedStyle(() => ({
    transform: [{ translateX: sx.value - x }, { scaleX: sw.value / w }],
    // an interpolated colour, not a backgroundColor toggle: CSS cannot transition to `transparent`
    // smoothly and the instant flip was visible in the probe
    backgroundColor: interpolateColor(p(), [0, 1], [c.navRest, c.navActive]),
  }));
  // The slot is scaleX-ed in flight, so anything inside it would have its glyphs stretched. Both
  // children carry the INVERSE scale and their own left-centre origin.
  const badge = useAnimatedStyle(() => ({
    transform: [{ scaleX: w / sw.value }],
    backgroundColor: interpolateColor(p(), [0, 1], [c.navRest, c.solid]),
  }));
  const text = useAnimatedStyle(() => ({
    transform: [{ scaleX: w / sw.value }],
    // fade in over the back half of the flight, so the outgoing and incoming labels never sit at
    // half opacity together, which reads as a smudge
    opacity: interpolate(p(), [0.45, 1], [0, 1], Extrapolation.CLAMP),
  }));

  return (
    <Animated.View style={[styles.slot, { left: x, width: w }, box]}>
      <Pressable
        accessibilityRole="tab"
        accessibilityLabel={label}
        accessibilityState={{ selected }}
        onPress={onPress}
        // the press target is the whole slot, which is never narrower than ICON (48pt)
        style={styles.press}>
        <Animated.View style={[styles.badge, badge]}>
          <Icon name={dest.icon} size={22} color={selected ? c.onSolid : c.muted} />
        </Animated.View>
        <Animated.Text
          numberOfLines={1}
          style={[styles.label, { color: c.ink }, text]}
          // the label is decoration: the accessible name is on the Pressable above
          accessibilityElementsHidden
          importantForAccessibility="no">
          {dest.label}
        </Animated.Text>
      </Pressable>
    </Animated.View>
  );
}

/** The + is an action, not a destination, so it lives outside the capsule and has no selected state. */
function Add({ onAdd }: { onAdd: () => void }) {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add — opens the add sheet"
      onPress={onAdd}
      style={({ pressed }) => [
        styles.fab,
        { backgroundColor: c.solid },
        pressed && { transform: [{ scale: 0.94 }] },
      ]}>
      <Icon name={{ ios: 'plus', android: 'add' }} size={24} color={c.onSolid} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // floats over the content, inset from the edges, content passing behind it
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: FAB_GAP },
  capsule: { height: H, borderRadius: H / 2, position: 'relative' },
  slot: {
    position: 'absolute',
    top: PAD,
    height: ICON,
    borderRadius: ICON / 2,
    overflow: 'hidden',
    transformOrigin: 'left center',
  },
  press: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  badge: {
    position: 'absolute',
    left: (ICON - BADGE) / 2,
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    transformOrigin: 'left center',
  },
  label: {
    position: 'absolute',
    left: (ICON - BADGE) / 2 + BADGE + 8,
    fontFamily: UI['700'],
    fontSize: 12,
    lineHeight: 16,
    transformOrigin: 'left center',
  },
  fab: { width: FAB, height: FAB, borderRadius: FAB / 2, alignItems: 'center', justifyContent: 'center' },
});
