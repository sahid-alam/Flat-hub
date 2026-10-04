// V2 "Card Stack": an onyx canvas, flat colour blocks with 24px corners, monumental Bricolage numerals,
// pill buttons. Brass is the one metallic and appears once per screen. Clay (`negative`) is only for
// failed saves and reversals. Blocks (stone, brass, sage) keep their fills in both modes and always carry
// onyx ink. See DESIGN.md for the rules.
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { createContext, createElement, useContext, useState, type ReactNode } from 'react';
import {
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
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatINR } from '@/domain/money';
import { dayLabel } from '@/lib/util';

// ---------------------------------------------------------------- tokens

/** Block fills: identical in light and dark, always with onyx ink. */
const block = { stone: '#E4E0D6', brass: '#C9A45C', sage: '#8FD0A6', onyx: '#121214', onyxMuted: '#2E2C28' };

const darkV2 = {
  ground: '#121214',
  surface: '#1E1E21',
  raised: '#2A2A2E',
  line: '#74747B', // interactive borders, 3:1+
  hair: '#2E2E33', // dividers only
  edge: 'transparent', // block outline (dark uses surface steps, no outline, no shadow)
  ink: '#EDEAE3',
  muted: '#A39E94',
  accent: '#C9A45C', // brass, fill
  accentText: '#C9A45C', // brass as text/icon
  onAccent: '#121214',
  positive: '#8FD0A6',
  negative: '#F0A08C', // failed saves and reversals only
  mark: '#C9A45C', // logo
  focus: '#C9A45C',
  solid: '#EDEAE3', // default pill fill
  onSolid: '#121214',
  warnBg: '#2A2619', // warm neutral, e.g. "Off by ₹14"; never clay
  warnFg: '#E6C890',
  scrim: 'rgba(8,8,10,0.66)',
};
const lightV2: typeof darkV2 = {
  ground: '#F7F5F0',
  surface: '#FFFFFF',
  raised: '#EDE9E0',
  line: '#8A857B',
  hair: '#E4E0D6',
  edge: '#E4E0D6',
  ink: '#121214',
  muted: '#5C574E',
  accent: '#C9A45C', // fill only in light (2.15:1 as text)
  accentText: '#7A5C22',
  onAccent: '#121214',
  positive: '#1F7A4D',
  negative: '#B3402A',
  mark: '#121214',
  focus: '#121214',
  solid: '#121214',
  onSolid: '#F7F5F0',
  warnBg: '#F3EBDD',
  warnFg: '#6B4E12',
  scrim: 'rgba(18,18,20,0.40)',
};

// ponytail: the fridge-door names stay as aliases so untouched screens keep compiling; drop them once no screen reads them.
const withAliases = (t: typeof darkV2) => ({
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
export const tokens = { dark: withAliases(darkV2), light: withAliases(lightV2), block };
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
} as const;
const NUM: TextStyle = { fontVariant: ['lining-nums', 'tabular-nums'] };

/** Text colours inside a block. Stone/brass/sage blocks switch children to onyx ink. */
type Ink = { ink: string; muted: string };
const InkContext = createContext<Ink | null>(null);
export function useInk(): Ink {
  const c = usePalette();
  return useContext(InkContext) ?? { ink: c.ink, muted: c.muted };
}

// ---------------------------------------------------------------- layout

export function Screen({
  children,
  scroll = true,
  padBottom = 0,
}: {
  children: ReactNode;
  scroll?: boolean;
  /** Extra bottom space, e.g. the floating + Add pill's height plus its margin, so it never covers content. */
  padBottom?: number;
}) {
  const c = usePalette();
  const body = <View style={[s.screenInner, { paddingBottom: 16 + padBottom }]}>{children}</View>;
  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: c.ground }}>
      {scroll ? (
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          {body}
        </ScrollView>
      ) : (
        body
      )}
    </SafeAreaView>
  );
}

export type BlockTone = 'surface' | 'raised' | 'stone' | 'brass' | 'sage';
const FILLED: BlockTone[] = ['stone', 'brass', 'sage'];

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
  const ink = filled ? { ink: block.onyx, muted: block.onyxMuted } : { ink: c.ink, muted: c.muted };
  const box = [s.block, { backgroundColor: c[tone], borderColor: tone === 'surface' ? c.edge : 'transparent' }];
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
  size = 17,
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
  weight?: '400' | '500' | '600' | '700';
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
  size = 80,
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
export function MagnetNumerals({ paise, size = 80 }: { paise: number; size?: number }) {
  return <Hero paise={paise} size={size} />;
}

/** Signed position: positive when the kitty owes the mate, ink when they're due to top up. Never red. */
export function Position({ paise, size = 17 }: { paise: number; size?: number }) {
  const c = usePalette();
  return (
    <T num size={size} color={paise > 0 ? c.positive : undefined}>
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
      <T size={13} weight="600">
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
  const fg = kind === 'reimbursed' ? c.positive : kind === 'late' ? ink.muted : ink.ink;
  return (
    <View style={[s.chipTag, look]}>
      <T size={12} weight="700" color={fg} style={{ lineHeight: 16 }}>
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
              <T size={13} weight="700">
                {inits[i]}
              </T>
              <View
                style={[s.badge, { backgroundColor: m.done ? c.positive : c.ground, borderColor: m.done ? c.ground : c.muted }]}>
                {m.done ? <Icon name={CHECK} size={12} color={c.ground} /> : <Ring color={c.muted} />}
              </View>
            </View>
            <T size={12} soft numberOfLines={1}>
              {m.name}
            </T>
          </View>
        ))}
      </View>
      <View style={s.legend} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Icon name={CHECK} size={14} color={ink.muted} />
        <T size={13} soft>
          Topped up
        </T>
        <Ring color={ink.muted} style={{ marginLeft: 12 }} />
        <T size={13} soft>
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
      <T size={15} weight="600" color={c.onSolid} style={{ flex: 1 }} numberOfLines={2}>
        {message}
      </T>
      {onUndo && (
        <Pressable
          accessibilityRole="button"
          accessibilityHint="Adds a reversal entry"
          onPress={onUndo}
          style={({ pressed }) => [s.toastUndo, { borderColor: c.onSolid }, pressed && s.pressed]}>
          <T size={15} weight="700" color={c.onSolid}>
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
  const fs = Math.min(120, Math.floor((width - 24) / (MONTH_EM[name] ?? name.length * 0.62)));
  return (
    <Block
      tone={tone}
      onPress={onPress}
      accessibilityLabel={`${month}, ${pill}, ${status}`}
      style={{ height, padding: 14, overflow: 'hidden', borderRadius: 26 }}>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width + 28)} style={s.monthTop}>
        <Pill label={pill} />
        <T size={13} weight="600" style={{ paddingTop: 7 }}>
          {status}
        </T>
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

type IconName = { ios: string; android: string; web?: string };
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
  let fg = accent || color === 'negative' ? c.onAccent : c.onSolid;
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
export function Choice<V extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
}) {
  const c = usePalette();
  return (
    <View style={s.choiceRow} accessibilityRole="radiogroup">
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
  return (
    <View style={{ gap: 6 }}>
      <T size={15} weight="600" soft>
        {label}
      </T>
      <TextInput
        placeholderTextColor={c.muted}
        selectionColor={c.accent}
        {...props}
        style={[
          s.input,
          { backgroundColor: c.surface, borderColor: c.line, color: c.ink, ...focusRing(c.focus) },
          big && { fontFamily: DISPLAY, fontSize: 34, height: 72, paddingTop: Platform.OS === 'ios' ? 6 : 0 },
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
      <T size={17}>{label}</T>
      {Platform.OS === 'web' ? (
        createElement('input', {
          type: 'date',
          value,
          'aria-label': label,
          onChange: (e: { target: { value: string } }) => e.target.value && onChange(e.target.value),
          style: {
            fontSize: 17,
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
          <T size={17} weight="600" color={c.accentText}>
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
      <T size={17} weight="600" style={{ flex: 1 }}>
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
  const ink = on ? { ink: block.onyx, muted: block.onyxMuted } : { ink: c.ink, muted: c.muted };
  return (
    <InkContext.Provider value={ink}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: !!on }}
        accessibilityLabel={detail ? `${title}, ${detail}` : title}
        onPress={onPress}
        style={({ pressed }) => [s.tile, { backgroundColor: on ? c.accent : c.raised }, pressed && s.pressed]}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
          <T size={16} weight="700" numberOfLines={2} style={{ flex: 1 }}>
            {title}
          </T>
          {on && <Icon name={CHECK} size={18} color={block.onyx} />}
        </View>
        {detail && (
          <T size={17} num>
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
    <T size={15} color={c.negative} weight="600">
      {error}
    </T>
  ) : null;
}

const s = StyleSheet.create({
  scroll: { flexGrow: 1 },
  screenInner: { flex: 1, padding: 16, gap: 16, width: '100%', maxWidth: 560, alignSelf: 'center' },
  pressed: { transform: [{ scale: 0.97 }] },
  block: { borderRadius: 24, borderWidth: 1, paddingHorizontal: 20, paddingVertical: 16, gap: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  heading: { fontFamily: UI['700'], fontSize: 22, lineHeight: 28, marginTop: 8 },
  section: { fontFamily: UI['700'], fontSize: 12, lineHeight: 16, letterSpacing: 1.9, textTransform: 'uppercase' },
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
  buttonLabel: { fontFamily: UI['700'], fontSize: 17 },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 9999,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipLabel: { fontSize: 16 },
  input: { minHeight: 56, borderRadius: 16, borderWidth: 1.5, paddingHorizontal: 16, fontSize: 18, fontFamily: UI['500'] },
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
