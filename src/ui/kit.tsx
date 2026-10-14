// V3: a warm near-black canvas (warm ivory in light), soft cards with 24px corners, Bricolage numerals,
// pill buttons. Brass is the one metallic and appears once per screen. Clay (`negative`) is only for
// failed saves and reversals. Blocks (stone, brass, sage) keep their fills in both modes and always carry
// onyx ink. Every hex here is lifted from docs/design/concept-gen.js, the palette he accepted; every pair
// in DESIGN.md's table is measured by docs/design/tokens-contrast.js. See DESIGN.md for the rules.
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { createContext, createElement, useContext, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatINR } from '@/domain/money';
import { dayLabel } from '@/lib/util';

// ---------------------------------------------------------------- tokens

/** Block fills: identical in light and dark, always with onyx ink. */
const block = { stone: '#E3DCCF', brass: '#C9A45C', sage: '#7FCB9F', onyx: '#1A1714', onyxMuted: '#3A342B' };

const darkV3 = {
  ground: '#15130F',
  surface: '#221F19',
  raised: '#2C2821', // one step up: chips, tiles, the nav's resting capsule
  sunk: '#38332B', // one step above raised: a field inside a raised block, a bar's track
  line: '#857C6C', // interactive borders, 3:1+ on ground/surface/raised - not on sunk
  hair: '#302C25', // dividers only
  edge: 'transparent', // block outline (dark uses surface steps, no outline, no shadow)
  ink: '#F2EDE3',
  muted: '#ACA394',
  accent: '#C9A45C', // brass, fill
  accentText: '#DCBE80', // brass as text/icon: the fill is too dim to read as text on dark
  onAccent: '#15130F',
  positive: '#7FCB9F',
  positiveBg: '#17291E', // fill behind a positive badge; `positive` is the text on it
  negative: '#F0998A', // failed saves and reversals only
  negativeBg: '#2F1B16',
  onNegative: '#15130F', // ink on the destructive pill
  mark: '#C9A45C', // logo
  focus: '#C9A45C',
  solid: '#F2EDE3', // default pill fill
  onSolid: '#15130F',
  warnBg: '#2D2616', // warm neutral, e.g. the "Off by" bar; never clay
  warnFg: '#E6C184',
  navActive: '#302C25', // the floating nav's active capsule
  navRest: '#1E1B16', // the capsule holding the other destinations
  scrim: 'rgba(5,4,3,0.64)',
};
const lightV3: typeof darkV3 = {
  ground: '#F6F3EE',
  surface: '#FFFFFF',
  raised: '#EDE8DF',
  sunk: '#E3DCCF',
  line: '#8A8275',
  hair: '#E4DED2',
  edge: '#E4DED2',
  ink: '#1A1714',
  muted: '#5E574C',
  accent: '#C9A45C', // fill only in light (2.12:1 as text)
  accentText: '#7A5C22',
  onAccent: '#1A1714',
  // The concept's #1F7A4D reads 4.36:1 on `raised` and 3.90:1 on `sunk`. Two steps darker clears AA on
  // every surface in the palette, so "Get back" green needs no caveat about where it is allowed to sit.
  positive: '#196740',
  positiveBg: '#E4F1E8',
  negative: '#A83421',
  negativeBg: '#F8E3DE',
  onNegative: '#F6F3EE', // onyx on clay is 2.70:1, so the destructive pill carries ivory ink in light
  mark: '#1A1714',
  focus: '#1A1714',
  solid: '#1A1714',
  onSolid: '#F6F3EE',
  warnBg: '#F6EBD6',
  warnFg: '#6B4E12',
  navActive: '#FFFFFF',
  navRest: '#EAE4D9',
  scrim: 'rgba(26,23,20,0.5)',
};

// ponytail: the fridge-door names stay as aliases so untouched screens keep compiling; drop them once no screen reads them.
const withAliases = (t: typeof darkV3) => ({
  ...t,
  ...block,
  enamel: t.ground,
  paper: t.surface,
  inkSoft: t.muted,
  rule: t.hair,
  green: t.positive,
  tomato: t.negative,
  blue: t.accentText,
  orange: t.accentText,
  plum: t.accentText,
  onMagnet: t.onAccent,
});
export const tokens = { dark: withAliases(darkV3), light: withAliases(lightV3), block };
export type Palette = typeof tokens.dark;
export const usePalette = (): Palette => (useColorScheme() === 'light' ? tokens.light : tokens.dark);

/** Bricolage Grotesque 800: every amount. */
/** On web a focused TextInput draws Chrome's blue ring over our own border. Keep the ring (keyboard users
 *  need it) but in the theme's focus colour, offset clear of the field. Web only: on native these are real
 *  View style props and would draw the ring unconditionally, focused or not. */
export const focusRing = (color: string) =>
  Platform.OS === 'web' ? ({ outlineColor: color, outlineWidth: 2, outlineOffset: 2 } as const) : {};

export const DISPLAY = 'BricolageGrotesque_800ExtraBold';
export const DISPLAY_SEMI = 'BricolageGrotesque_700Bold';
/** Righteous: the FLAT/HUB mark and giant month names only (no ₹, no tabular digits). */
export const MARK = 'Righteous_400Regular';
/** Manrope by weight. Weight lives in the family name; never set fontWeight with these (web would fake-bold it). */
export const UI = {
  '400': 'Manrope_500Medium',
  '500': 'Manrope_500Medium',
  '600': 'Manrope_600SemiBold',
  '700': 'Manrope_700Bold',
  '800': 'Manrope_800ExtraBold',
} as const;
const NUM: TextStyle = { fontVariant: ['lining-nums', 'tabular-nums'] };

/** Text colours inside a block. Stone/brass/sage blocks switch children to onyx ink. */
type Ink = { ink: string; muted: string; positive: string };
const InkContext = createContext<Ink | null>(null);
export function useInk(): Ink {
  const c = usePalette();
  return useContext(InkContext) ?? { ink: c.ink, muted: c.muted, positive: c.positive };
}

// ---------------------------------------------------------------- layout

/** What a tab screen must leave clear at the bottom: the floating capsule's 60pt plus the 12pt it
 *  floats above the safe area (rule 8 — the nav must never cover content). `Screen` adds the bottom
 *  safe-area inset itself. Kept as TAB_BAR because every tab screen already passes it as `padBottom`;
 *  the one source of truth is NAV_HEIGHT in src/ui/navbar.tsx, which this must equal. */
export const TAB_BAR = 72;

export function Screen({
  children,
  scroll = true,
  padBottom = 0,
  footer,
}: {
  children: ReactNode;
  scroll?: boolean;
  /** Extra bottom space, e.g. the floating + Add pill's height plus its margin, so it never covers content. */
  padBottom?: number;
  /** Pinned under the scroll, above the keyboard: the button that commits the screen never scrolls away. */
  footer?: ReactNode;
}) {
  const c = usePalette();
  const body = <View style={[s.screenInner, { paddingBottom: 16 + padBottom }]}>{children}</View>;
  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: c.ground }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
            {body}
          </ScrollView>
        ) : (
          body
        )}
        {footer && (
          <View style={[s.footer, { borderTopColor: c.hair }]}>
            <View style={s.footerInner}>{footer}</View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * A bottom sheet for ONE question: it covers the screen rather than pushing anything on it, so the
 * rows underneath never move. Tapping the scrim, the back gesture or Done all close it; the answer
 * is already applied as it is picked, so closing never loses anything. Same build as Put away.
 */
export function Sheet({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Replaces the default Done button. */
  footer?: ReactNode;
}) {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]}
        />
        <View role="dialog" accessibilityLabel={title} style={[s.sheet, { backgroundColor: c.ground }]}>
          <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: c.line }} />
          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
            <T size={22} weight="700">
              {title}
            </T>
            {children}
          </ScrollView>
          <View style={{ padding: 16, paddingBottom: insets.bottom + 16, borderTopWidth: 1, borderTopColor: c.hair }}>
            {footer ?? <MagnetButton label="Done" onPress={onClose} />}
          </View>
        </View>
      </View>
    </Modal>
  );
}

export type BlockTone = 'surface' | 'raised' | 'stone' | 'brass' | 'sage';
const FILLED: BlockTone[] = ['stone', 'brass', 'sage'];
/** A filled block keeps one fill in both modes, so the palette's green cannot follow the mode onto it:
 *  dark `positive` measures 1.41:1 on stone and 1.00:1 on sage. Stone carries the light green (5.04:1);
 *  brass and sage carry onyx, because no green clears AA on them (2.93:1 and 3.58:1). Every coloured
 *  value also carries a word, so dropping the colour there costs no meaning. */
const filledInk = (tone: BlockTone): Ink => ({
  ink: block.onyx,
  muted: block.onyxMuted,
  positive: tone === 'stone' ? lightV3.positive : block.onyx,
});

/** A flat colour block, 24px corners. With `onPress` it's a doorway (press scale 0.97). */
export function Block({
  tone = 'surface',
  children,
  style,
  onPress,
  accessibilityLabel,
}: {
  tone?: BlockTone;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const c = usePalette();
  const filled = FILLED.includes(tone);
  const ink = filled ? filledInk(tone) : { ink: c.ink, muted: c.muted, positive: c.positive };
  const box = [s.block, { backgroundColor: c[tone], borderColor: filled ? 'transparent' : c.edge }];
  return (
    <InkContext.Provider value={ink}>
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          onPress={onPress}
          style={({ pressed }) => [box, style, pressed && s.pressed]}>
          {children}
        </Pressable>
      ) : (
        <View accessibilityLabel={accessibilityLabel} style={[box, style]}>
          {children}
        </View>
      )}
    </InkContext.Provider>
  );
}

/** Kept for existing screens: a surface block. `magnet` is accepted and ignored (no magnets in V2). */
export function Slip(props: { children: ReactNode; magnet?: keyof Palette; style?: StyleProp<ViewStyle> }) {
  return <Block style={props.style}>{props.children}</Block>;
}

/** A small status dot. Pair it with a text label; colour never carries meaning alone. */
export function Magnet({ color, style }: { color: string; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.dot, { backgroundColor: color }, style]} />;
}

export function T({
  children,
  size = 15,
  weight = '500',
  soft,
  color,
  center,
  num,
  style,
  numberOfLines,
}: {
  children: ReactNode;
  size?: number;
  weight?: '400' | '500' | '600' | '700' | '800';
  soft?: boolean;
  color?: string;
  center?: boolean;
  /** Set in Bricolage 800 (amounts). */
  num?: boolean;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const ink = useInk();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        NUM,
        {
          fontFamily: num ? DISPLAY : UI[weight],
          fontSize: size,
          lineHeight: Math.round(size * 1.3),
          color: color ?? (soft ? ink.muted : ink.ink),
        },
        center && { textAlign: 'center' },
        style,
      ]}>
      {children}
    </Text>
  );
}

export function Heading({ children }: { children: ReactNode }) {
  const { ink } = useInk();
  return <Text style={[s.heading, { color: ink }]}>{children}</Text>;
}

/** Small spaced caps: IN THE KITTY, RECENT. */
export function SectionLabel({ children, color }: { children: ReactNode; color?: string }) {
  const { muted } = useInk();
  return <Text style={[s.section, { color: color ?? muted }]}>{children}</Text>;
}

/** Stacked FLAT/HUB in Righteous. Brass on dark, ink on light. `size` is the font size. */
export function Logo({ size = 36, color }: { size?: number; color?: string }) {
  const c = usePalette();
  return (
    <Text
      accessibilityRole="header"
      accessibilityLabel="FlatHub"
      style={{
        fontFamily: MARK,
        fontSize: size,
        lineHeight: Math.round(size * 0.86),
        letterSpacing: size * 0.01,
        color: color ?? c.mark,
      }}>
      {'FLAT\nHUB'}
    </Text>
  );
}

// ---------------------------------------------------------------- money

// Bricolage 800 advances in em (tabular digit .629, comma .212, point .252), measured from the TTF.
// ponytail: width estimate instead of measuring layout; adjustsFontSizeToFit doesn't exist on web.
const heroEm = (digits: string) =>
  [...digits].reduce((w, ch) => w + (ch === ',' ? 0.212 : ch === '.' ? 0.252 : 0.629) - 0.03, 0);

/** The giant amount: Bricolage 800, small top-aligned ₹ at 0.6x. Shrinks to fit `maxWidth`. */
export function Hero({
  paise,
  size = 68,
  color,
  maxWidth = 300,
}: {
  paise: number;
  size?: number;
  color?: string;
  maxWidth?: number;
}) {
  const ink = useInk();
  const text = formatINR(paise);
  const neg = paise < 0;
  const digits = text.slice(text.indexOf('₹') + 1);
  const fs = Math.min(size, Math.floor(maxWidth / (heroEm(digits) + 0.38 + (neg ? 0.53 : 0))));
  const base: TextStyle = { ...NUM, fontFamily: DISPLAY, color: color ?? ink.ink };
  return (
    <View accessible accessibilityRole="text" accessibilityLabel={text} style={s.heroRow}>
      {neg && <Text style={[base, { fontSize: fs, lineHeight: fs }]}>−</Text>}
      <Text style={[base, { fontSize: fs * 0.6, lineHeight: fs * 0.6, marginTop: fs * 0.07, marginRight: fs * 0.03 }]}>
        ₹
      </Text>
      <Text style={[base, { fontSize: fs, lineHeight: fs, letterSpacing: -0.03 * fs }]}>{digits}</Text>
    </View>
  );
}

/** Old name for the home balance; now the V2 hero. */
export function MagnetNumerals({ paise, size = 68 }: { paise: number; size?: number }) {
  return <Hero paise={paise} size={size} />;
}

/** Signed position: positive when the kitty owes the mate, ink when they're due to top up. Never red. */
export function Position({ paise, size = 15 }: { paise: number; size?: number }) {
  const ink = useInk();
  return (
    <T num size={size} color={paise > 0 ? ink.positive : undefined}>
      {formatINR(paise, { sign: true })}
    </T>
  );
}

// ---------------------------------------------------------------- labels

/** A non-interactive outlined capsule: "₹11,400 · 41 entries". */
export function Pill({ label, style }: { label: string; style?: StyleProp<ViewStyle> }) {
  const ink = useInk();
  return (
    <View style={[s.pill, { borderColor: ink.muted }, style]}>
      <T size={12} weight="600">
        {label}
      </T>
    </View>
  );
}

export type ChipKind = 'pool' | 'pending' | 'reimbursed' | 'late';
const CHIP_LABEL: Record<ChipKind, string> = {
  pool: 'Pool',
  pending: 'Own pocket · pending',
  reimbursed: 'Reimbursed',
  late: 'added late',
};

/** A labelled status chip. The words carry the meaning; fill and border only echo it. */
export function Chip({ kind, label }: { kind: ChipKind; label?: string }) {
  const c = usePalette();
  const ink = useInk();
  const look: ViewStyle =
    kind === 'pool'
      ? { backgroundColor: c.raised, borderColor: c.raised }
      : { borderColor: c.line, borderStyle: kind === 'reimbursed' ? 'solid' : 'dashed' };
  const fg = kind === 'reimbursed' ? ink.positive : kind === 'late' ? ink.muted : ink.ink;
  return (
    <View style={[s.chipTag, look]}>
      <T size={11.5} weight="700" color={fg} style={{ lineHeight: 15 }}>
        {label ?? CHIP_LABEL[kind]}
      </T>
    </View>
  );
}

/** Two-letter initials, unique within the group: Anant AN, then Ansh AS (not a second AN). */
function initialsFor(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((name) => {
    const w = name.trim().split(/\s+/);
    const tail = w.length > 1 ? w[1] + w[0].slice(1) : w[0].slice(1);
    const tries = [...tail].map((ch) => (w[0][0] + ch).toUpperCase());
    const pick = tries.find((t) => !used.has(t)) ?? tries[0] ?? (w[0][0] ?? '?').toUpperCase();
    used.add(pick);
    return pick;
  });
}
const CHECK: IconName = { ios: 'checkmark', android: 'check' };

/** Who has topped up: initials with ✓ or ○, always in alphabetical order. No amounts, no ranking. */
export function Avatars({ mates }: { mates: { id: string; name: string; done: boolean }[] }) {
  const c = usePalette();
  const ink = useInk();
  const sorted = [...mates].sort((a, b) => a.name.localeCompare(b.name));
  const inits = initialsFor(sorted.map((m) => m.name));
  return (
    <View style={{ gap: 10 }}>
      <View role="list" style={s.avatarRow}>
        {sorted.map((m, i) => (
          <View
            key={m.id}
            role="listitem"
            accessible
            accessibilityLabel={`${m.name}, ${m.done ? 'topped up' : 'not yet'}`}
            style={s.avatarCell}>
            <View
              style={[
                s.avatar,
                m.done
                  ? { backgroundColor: c.ground, borderColor: c.line }
                  : { borderColor: ink.muted, borderStyle: 'dashed' },
              ]}>
              <T size={12} weight="700">
                {inits[i]}
              </T>
              <View
                style={[s.badge, { backgroundColor: m.done ? c.positive : c.ground, borderColor: m.done ? c.ground : c.muted }]}>
                {m.done ? <Icon name={CHECK} size={12} color={c.ground} /> : <Ring color={c.muted} />}
              </View>
            </View>
            <T size={11} soft numberOfLines={1}>
              {m.name}
            </T>
          </View>
        ))}
      </View>
      <View style={s.legend} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Icon name={CHECK} size={14} color={ink.muted} />
        <T size={12} soft>
          Topped up
        </T>
        <Ring color={ink.muted} style={{ marginLeft: 12 }} />
        <T size={12} soft>
          Not yet
        </T>
      </View>
    </View>
  );
}
const Ring = ({ color, style }: { color: string; style?: StyleProp<ViewStyle> }) => (
  <View style={[s.ring, { borderColor: color }, style]} />
);

/** "Dahi ₹30 logged · Undo". Undo must write a reversal entry, never a delete. Position it yourself via `style`. */
export function Toast({
  message,
  onUndo,
  undoLabel = 'Undo',
  style,
}: {
  message: string;
  onUndo?: () => void;
  undoLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const c = usePalette();
  return (
    <View role="status" accessibilityLiveRegion="polite" style={[s.toast, { backgroundColor: c.solid }, style]}>
      <T size={14} weight="600" color={c.onSolid} style={{ flex: 1 }} numberOfLines={2}>
        {message}
      </T>
      {onUndo && (
        <Pressable
          accessibilityRole="button"
          accessibilityHint="Adds a reversal entry"
          onPress={onUndo}
          style={({ pressed }) => [s.toastUndo, { borderColor: c.onSolid }, pressed && s.pressed]}>
          <T size={14} weight="700" color={c.onSolid}>
            {undoLabel}
          </T>
        </Pressable>
      )}
    </View>
  );
}

// Righteous uppercase advance per month in em, measured from the TTF; the name is sized to fit the card's width.
const MONTH_EM: Record<string, number> = {
  JANUARY: 4.4, FEBRUARY: 5.08, MARCH: 3.48, APRIL: 2.8, MAY: 2.11, JUNE: 2.36,
  JULY: 2.27, AUGUST: 3.88, SEPTEMBER: 5.7, OCTOBER: 4.67, NOVEMBER: 5.36, DECEMBER: 5.17,
};

/** One month in the statements stack: pill, status, and the month name in giant Righteous bleeding off the bottom. */
export function MonthCard({
  month,
  pill,
  status,
  tone = 'stone',
  onPress,
  height = 200,
}: {
  month: string;
  pill: string;
  status: string;
  tone?: BlockTone;
  onPress?: () => void;
  height?: number;
}) {
  const [width, setWidth] = useState(358);
  const name = month.toUpperCase();
  // 56 = 2 x the 26px corner radius: the longest name must not run into the arcs
  const fs = Math.min(120, Math.floor((width - 56) / (MONTH_EM[name] ?? name.length * 0.62)));
  return (
    <Block
      tone={tone}
      onPress={onPress}
      accessibilityLabel={`${month}, ${pill}, ${status}`}
      style={{ height, padding: 14, overflow: 'hidden', borderRadius: 26 }}>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width + 28)} style={s.monthTop}>
        <Pill label={pill} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 5 }}>
          {status === 'closed' && <Icon name={{ ios: 'lock', android: 'lock' }} size={14} />}
          <T size={13.5} weight="700">
            {status}
          </T>
        </View>
      </View>
      <MonthName name={name} size={fs} />
    </Block>
  );
}
function MonthName({ name, size }: { name: string; size: number }) {
  const { ink } = useInk();
  return (
    <Text
      aria-hidden
      numberOfLines={1}
      style={[
        s.monthName,
        { fontSize: size, lineHeight: size, bottom: -Math.round(size * 0.19), color: ink, opacity: 0.34 },
      ]}>
      {name}
    </Text>
  );
}

// ---------------------------------------------------------------- controls

export type IconName = { ios: string; android: string; web?: string };
export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color?: string }) {
  const ink = useInk();
  return (
    <SymbolView
      name={{ ...name, web: name.web ?? name.android } as SymbolViewProps['name']}
      size={size}
      tintColor={color ?? ink.ink}
    />
  );
}

/**
 * A pill button, ≥56pt. `color`: 'brass' (or 'accent') for the one accent pill on a screen, 'negative' for a
 * destructive action, anything else (incl. the old magnet names) is the solid ink pill.
 */
export function MagnetButton({
  label,
  onPress,
  color = 'ink',
  icon,
  disabled,
  outline,
}: {
  label: string;
  onPress: () => void;
  color?: keyof Palette;
  icon?: IconName;
  disabled?: boolean;
  outline?: boolean;
}) {
  const c = usePalette();
  const accent = color === 'brass' || color === 'accent';
  let bg = accent ? c.accent : color === 'negative' ? c.negative : c.solid;
  let fg = color === 'negative' ? c.onNegative : accent ? c.onAccent : c.onSolid;
  let border = bg;
  if (outline) [bg, fg, border] = ['transparent', c.ink, c.line];
  if (disabled) [bg, fg, border] = [c.raised, c.muted, c.raised];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [s.button, { backgroundColor: bg, borderColor: border }, pressed && s.pressed]}>
      {icon && <Icon name={icon} size={20} color={fg} />}
      <Text style={[s.buttonLabel, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

/** One-of-n choice as 48pt pill chips; the chosen one gets a check and an ink outline. */
/** `fill` makes the options share the row as equal parts — a segmented switch rather than a chip
 *  group. Chips wrap by default, which is right for a long list of answers but wrong for a switch
 *  between two or three views: a wrapped switch reads as two controls. Use it for three options at
 *  most, or the parts get too narrow for their labels. `label` names the group for screen readers. */
export function Choice<V extends string>({
  options,
  value,
  onChange,
  fill,
  label,
}: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
  fill?: boolean;
  label?: string;
}) {
  const c = usePalette();
  return (
    <View style={s.choiceRow} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={({ pressed }) => [
              s.chip,
              fill && s.chipFill,
              { backgroundColor: on ? c.raised : 'transparent', borderColor: on ? c.ink : c.line },
              pressed && s.pressed,
            ]}>
            {on && <Icon name={CHECK} size={16} color={c.ink} />}
            <Text style={[s.chipLabel, { color: c.ink, fontFamily: on ? UI['700'] : UI['600'] }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Field({ label, big, ...props }: TextInputProps & { label: string; big?: boolean }) {
  const c = usePalette();
  // Follow the block we are in. On a stone block the palette's muted is 2.41:1 against the fill;
  // the block's own muted is 9.03:1. Outside a filled block the two are the same value.
  const ink = useInk();
  return (
    <View style={{ gap: 6 }}>
      <T size={13.5} weight="600" soft>
        {label}
      </T>
      <TextInput
        placeholderTextColor={ink.muted}
        selectionColor={c.accent}
        {...props}
        style={[
          s.input,
          { backgroundColor: c.surface, borderColor: c.line, color: c.ink, ...focusRing(c.focus) },
          big && { fontFamily: DISPLAY, fontSize: 30, height: 66, paddingTop: Platform.OS === 'ios' ? 6 : 0 },
          props.style,
        ]}
      />
    </View>
  );
}

/** YYYY-MM-DD date field. Inline picker on iOS, the system dialog on tap on Android, the browser's input on web. */
export function DateField({ label, value, onChange }: { label: string; value: string; onChange: (d: string) => void }) {
  const c = usePalette();
  const scheme = useColorScheme() === 'light' ? 'light' : 'dark';
  const asDate = new Date(value + 'T00:00:00');
  return (
    <View style={[s.dateRow, { backgroundColor: c.surface, borderColor: c.line }]}>
      <T size={15.5}>{label}</T>
      {Platform.OS === 'web' ? (
        createElement('input', {
          type: 'date',
          value,
          'aria-label': label,
          onChange: (e: { target: { value: string } }) => e.target.value && onChange(e.target.value),
          style: {
            fontSize: 15.5,
            fontFamily: UI['600'],
            border: 'none',
            background: 'transparent',
            color: c.ink,
            colorScheme: scheme,
            minHeight: 48,
          },
        })
      ) : Platform.OS === 'android' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={() =>
            DateTimePickerAndroid.open({ value: asDate, mode: 'date', onChange: (_e, d) => d && onChange(localDate(d)) })
          }
          style={{ minHeight: 48, justifyContent: 'center' }}>
          <T size={15.5} weight="600" color={c.accentText}>
            {dayLabel(value)} {value.slice(0, 4)}
          </T>
        </Pressable>
      ) : (
        <DateTimePicker
          value={asDate}
          mode="date"
          onChange={(_e, d) => d && onChange(localDate(d))}
          accentColor={c.accentText}
          themeVariant={scheme}
        />
      )}
    </View>
  );
}
const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** A tappable row inside a block: label left, detail right, chevron. 56pt tall. */
export function Row({
  label,
  detail,
  onPress,
  icon,
}: {
  label: string;
  detail?: ReactNode;
  onPress?: () => void;
  icon?: IconName;
}) {
  const { muted } = useInk();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      style={({ pressed }) => [s.row, pressed && onPress && { opacity: 0.6 }]}>
      {icon && <Icon name={icon} size={22} color={muted} />}
      <T size={15.5} weight="600" style={{ flex: 1 }}>
        {label}
      </T>
      {typeof detail === 'string' ? <T soft>{detail}</T> : detail}
      {onPress && <Icon name={{ ios: 'chevron.right', android: 'chevron_right' }} size={14} color={muted} />}
    </Pressable>
  );
}

/**
 * A favourite tile: one raised fill for all of them; the picked one turns brass with a check.
 * `color` is accepted for old callers and ignored.
 */
export function Tile({
  title,
  detail,
  onPress,
  on,
}: {
  title: string;
  detail?: string;
  onPress: () => void;
  on?: boolean;
  color?: keyof Palette;
}) {
  const c = usePalette();
  const ink = on ? filledInk('brass') : { ink: c.ink, muted: c.muted, positive: c.positive };
  return (
    <InkContext.Provider value={ink}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: !!on }}
        accessibilityLabel={detail ? `${title}, ${detail}` : title}
        onPress={onPress}
        style={({ pressed }) => [s.tile, { backgroundColor: on ? c.accent : c.raised }, pressed && s.pressed]}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
          <T size={14.5} weight="700" numberOfLines={2} style={{ flex: 1 }}>
            {title}
          </T>
          {on && <Icon name={CHECK} size={18} color={block.onyx} />}
        </View>
        {detail && (
          <T size={15.5} num>
            {detail}
          </T>
        )}
      </Pressable>
    </InkContext.Provider>
  );
}

/** Star toggle, 48pt. Brass when on. */
export function StarToggle({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: on }}
      onPress={onPress}
      style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
      <Icon
        name={on ? { ios: 'star.fill', android: 'star' } : { ios: 'star', android: 'star_border' }}
        size={22}
        color={on ? c.accentText : c.muted}
      />
    </Pressable>
  );
}

export function Rule() {
  const c = usePalette();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.hair }} />;
}

export function ErrorText({ error }: { error: string | null }) {
  const c = usePalette();
  return error ? (
    <T size={14} color={c.negative} weight="600">
      {error}
    </T>
  ) : null;
}

const s = StyleSheet.create({
  scroll: { flexGrow: 1 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 },
  footerInner: { width: '100%', maxWidth: 528, alignSelf: 'center', gap: 8 },
  sheet: {
    maxHeight: '90%',
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 8,
  },
  screenInner: { flex: 1, padding: 16, gap: 16, width: '100%', maxWidth: 560, alignSelf: 'center' },
  pressed: { transform: [{ scale: 0.97 }] },
  block: { borderRadius: 24, borderWidth: 1, paddingHorizontal: 20, paddingVertical: 16, gap: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  heading: { fontFamily: UI['800'], fontSize: 20, lineHeight: 26, marginTop: 8, letterSpacing: -0.4 },
  section: { fontFamily: UI['800'], fontSize: 11.5, lineHeight: 15, letterSpacing: 1.4, textTransform: 'uppercase' },
  heroRow: { flexDirection: 'row', alignItems: 'flex-start' },
  pill: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 9999, paddingHorizontal: 12, paddingVertical: 5 },
  chipTag: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 2 },
  avatarRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
  avatarCell: { flex: 1, alignItems: 'center', gap: 6, minWidth: 0 },
  avatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: { width: 11, height: 11, borderRadius: 6, borderWidth: 2 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  toast: {
    minHeight: 56,
    borderRadius: 28,
    paddingLeft: 20,
    paddingRight: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  toastUndo: {
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 9999,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  monthName: { position: 'absolute', left: 0, right: 0, textAlign: 'center', fontFamily: MARK },
  button: {
    minHeight: 56,
    borderRadius: 9999,
    borderWidth: 1.5,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonLabel: { fontFamily: UI['700'], fontSize: 15.5 },
  // gap 6, not 8: Spending's four period chips measure 374.4pt at gap 8, which is 0.4pt past what a
  // 390pt phone has room for — one hair from wrapping into the ragged two rows this replaced.
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 9999,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipFill: { flex: 1, paddingHorizontal: 8, justifyContent: 'center' },
  chipLabel: { fontSize: 14.5 },
  input: { minHeight: 56, borderRadius: 16, borderWidth: 1.5, paddingHorizontal: 16, fontSize: 16.5, fontFamily: UI['500'] },
  dateRow: {
    minHeight: 56,
    borderRadius: 16,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12 },
  tile: { flexGrow: 1, flexBasis: '45%', minWidth: 140, minHeight: 64, borderRadius: 20, padding: 14, gap: 2 },
});
