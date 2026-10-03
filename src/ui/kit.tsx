// Fridge door: white enamel ground, paper slips held by coloured magnets, the balance in
// magnetic-letter numerals. Magnet colour always means the same thing:
// green = money into the kitty, tomato = a spend, blue = paid back / owed back.
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { createElement, type ReactNode } from 'react';
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
  type ViewStyle,
} from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatINR } from '@/domain/money';
import { dayLabel } from '@/lib/util';

const light = {
  enamel: '#ECEEEA',
  paper: '#FFFFFF',
  ink: '#1A1C1E',
  inkSoft: '#575C61',
  rule: '#D5D8D3',
  green: '#1C7F46',
  tomato: '#C93A25',
  blue: '#2A55C4',
  orange: '#B5590A',
  plum: '#7438AD',
  onMagnet: '#FFFFFF',
};
const dark: typeof light = {
  enamel: '#15171A',
  paper: '#222529',
  ink: '#F1F2EF',
  inkSoft: '#A8ADB2',
  rule: '#33373C',
  green: '#45C07A',
  tomato: '#FF6B52',
  blue: '#7C9DFF',
  orange: '#FFA04D',
  plum: '#C291F2',
  onMagnet: '#101214',
};
export type Palette = typeof light;
export const usePalette = (): Palette => (useColorScheme() === 'dark' ? dark : light);

export const DISPLAY = 'Baloo2_800ExtraBold';
export const DISPLAY_SEMI = 'Baloo2_600SemiBold';

// ---------------------------------------------------------------- layout

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const c = usePalette();
  const body = <View style={s.screenInner}>{children}</View>;
  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: c.enamel }}>
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

/** A paper slip. `magnet` pins it with a coloured magnet at the top edge. */
export function Slip({
  children,
  magnet,
  style,
}: {
  children: ReactNode;
  magnet?: keyof Palette;
  style?: StyleProp<ViewStyle>;
}) {
  const c = usePalette();
  return (
    <View style={[s.slip, { backgroundColor: c.paper }, style]}>
      {magnet && <Magnet color={c[magnet]} style={s.slipMagnet} />}
      {children}
    </View>
  );
}

export function Magnet({ color, style }: { color: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.magnet, { backgroundColor: color }, style]}>
      <View style={s.magnetShine} />
    </View>
  );
}

export function T({
  children,
  size = 17,
  weight = '400',
  soft,
  color,
  center,
  style,
  numberOfLines,
}: {
  children: ReactNode;
  size?: number;
  weight?: '400' | '500' | '600' | '700';
  soft?: boolean;
  color?: string;
  center?: boolean;
  style?: object;
  numberOfLines?: number;
}) {
  const c = usePalette();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        { fontSize: size, lineHeight: Math.round(size * 1.3), fontWeight: weight, color: color ?? (soft ? c.inkSoft : c.ink) },
        center && { textAlign: 'center' },
        { fontVariant: ['tabular-nums'] },
        style,
      ]}>
      {children}
    </Text>
  );
}

export function Heading({ children }: { children: ReactNode }) {
  const c = usePalette();
  return <Text style={[s.heading, { color: c.ink }]}>{children}</Text>;
}

// ---------------------------------------------------------------- money

const NUMERAL_COLORS: (keyof Palette)[] = ['blue', 'tomato', 'green', 'orange', 'plum'];

/** The balance, set in magnetic letters: each digit its own colour, like the alphabet on the fridge. */
export function MagnetNumerals({ paise, size = 92 }: { paise: number; size?: number }) {
  const c = usePalette();
  const text = formatINR(paise - (paise % 100)); // whole rupees at display scale
  const rest = Math.abs(paise % 100);
  let digit = 0;
  return (
    <Text
      accessibilityLabel={formatINR(paise)}
      adjustsFontSizeToFit
      numberOfLines={1}
      style={{ fontFamily: DISPLAY, fontSize: size, lineHeight: size * 1.15, marginBottom: -size * 0.24, color: c.ink }}>
      {[...text].map((ch, i) => {
        const isDigit = /\d/.test(ch);
        const color = isDigit ? c[NUMERAL_COLORS[digit++ % NUMERAL_COLORS.length]] : c.ink;
        return (
          <Text
            key={i}
            style={[
              { color },
              isDigit && s.numeralEdge,
              !isDigit && ch !== '₹' && { fontSize: size * 0.6 },
              ch === '₹' && { fontSize: size * 0.7 },
            ]}>
            {ch}
          </Text>
        );
      })}
      {rest > 0 && <Text style={{ fontSize: size * 0.36, color: c.inkSoft }}>.{String(rest).padStart(2, '0')}</Text>}
    </Text>
  );
}

/** Signed position: green when the kitty owes the mate, ink when they're due to top up. */
export function Position({ paise, size = 17 }: { paise: number; size?: number }) {
  const c = usePalette();
  return (
    <T size={size} weight="600" color={paise > 0 ? c.green : c.ink}>
      {formatINR(paise, { sign: true })}
    </T>
  );
}

// ---------------------------------------------------------------- controls

type IconName = { ios: string; android: string; web?: string };
export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color?: string }) {
  const c = usePalette();
  return (
    <SymbolView
      name={{ ...name, web: name.web ?? name.android } as SymbolViewProps['name']}
      size={size}
      tintColor={color ?? c.ink}
    />
  );
}

/** A big pill button in a magnet colour. ≥56pt tall. */
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
  const bg = outline ? c.paper : c[color];
  const fg = outline ? c[color] : color === 'ink' ? c.enamel : c.onMagnet;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        { backgroundColor: bg, borderColor: outline ? c[color] : bg, opacity: disabled ? 0.4 : 1 },
        pressed && { transform: [{ scale: 0.97 }] },
      ]}>
      {icon && <Icon name={icon} size={20} color={fg} />}
      <Text style={[s.buttonLabel, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

/** One-of-n choice as a row of 48pt chips. */
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
            style={[s.chip, { backgroundColor: on ? c.ink : c.paper, borderColor: on ? c.ink : c.rule }]}>
            <Text style={[s.chipLabel, { color: on ? c.enamel : c.ink }]}>{o.label}</Text>
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
        placeholderTextColor={c.inkSoft}
        selectionColor={c.blue}
        {...props}
        style={[
          s.input,
          { backgroundColor: c.paper, borderColor: c.rule, color: c.ink },
          big && { fontFamily: DISPLAY_SEMI, fontSize: 34, height: 72, paddingTop: Platform.OS === 'ios' ? 6 : 0 },
          props.style,
        ]}
      />
    </View>
  );
}

/** YYYY-MM-DD date field. Inline picker on iOS, the system dialog on tap on Android, the browser's input on web. */
export function DateField({ label, value, onChange }: { label: string; value: string; onChange: (d: string) => void }) {
  const c = usePalette();
  const asDate = new Date(value + 'T00:00:00');
  return (
    <View style={[s.dateRow, { backgroundColor: c.paper, borderColor: c.rule }]}>
      <T size={17} weight="500">
        {label}
      </T>
      {Platform.OS === 'web' ? (
        createElement('input', {
          type: 'date',
          value,
          'aria-label': label,
          onChange: (e: { target: { value: string } }) => e.target.value && onChange(e.target.value),
          style: { fontSize: 17, border: 'none', background: 'transparent', color: c.ink, minHeight: 44 },
        })
      ) : Platform.OS === 'android' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={() =>
            DateTimePickerAndroid.open({ value: asDate, mode: 'date', onChange: (_e, d) => d && onChange(localDate(d)) })
          }
          style={{ minHeight: 48, justifyContent: 'center' }}>
          <T size={17} weight="600" color={c.blue}>
            {dayLabel(value)} {value.slice(0, 4)}
          </T>
        </Pressable>
      ) : (
        <DateTimePicker
          value={asDate}
          mode="date"
          onChange={(_e, d) => d && onChange(localDate(d))}
          accentColor={c.blue}
        />
      )}
    </View>
  );
}
const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** A tappable row inside a slip: label left, detail right, chevron. 56pt tall. */
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
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      style={({ pressed }) => [s.row, pressed && onPress && { opacity: 0.6 }]}>
      {icon && <Icon name={icon} size={22} color={c.inkSoft} />}
      <T size={17} weight="500" style={{ flex: 1 }}>
        {label}
      </T>
      {typeof detail === 'string' ? <T soft>{detail}</T> : detail}
      {onPress && <Icon name={{ ios: 'chevron.right', android: 'chevron_right' }} size={14} color={c.inkSoft} />}
    </Pressable>
  );
}

/** A small square-ish card in a wrapping grid: title over a soft detail. `on` outlines it in a magnet colour. */
export function Tile({
  title,
  detail,
  onPress,
  on,
  color = 'tomato',
}: {
  title: string;
  detail?: string;
  onPress: () => void;
  on?: boolean;
  color?: keyof Palette;
}) {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!on }}
      accessibilityLabel={detail ? `${title}, ${detail}` : title}
      onPress={onPress}
      style={({ pressed }) => [
        s.tile,
        { backgroundColor: c.paper, borderColor: on ? c[color] : c.rule },
        pressed && { transform: [{ scale: 0.97 }] },
      ]}>
      <T size={16} weight="600" numberOfLines={2}>
        {title}
      </T>
      {detail && (
        <T size={14} soft>
          {detail}
        </T>
      )}
    </Pressable>
  );
}

/** Star toggle, 48pt. Filled in orange when on. */
export function StarToggle({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: on }}
      onPress={onPress}
      style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={on ? { ios: 'star.fill', android: 'star' } : { ios: 'star', android: 'star_border' }} size={22} color={on ? c.orange : c.inkSoft} />
    </Pressable>
  );
}

export function Rule() {
  const c = usePalette();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.rule }} />;
}

export function ErrorText({ error }: { error: string | null }) {
  const c = usePalette();
  return error ? (
    <T size={15} color={c.tomato} weight="500">
      {error}
    </T>
  ) : null;
}

const s = StyleSheet.create({
  scroll: { flexGrow: 1 },
  screenInner: { flex: 1, padding: 20, gap: 20, width: '100%', maxWidth: 560, alignSelf: 'center' },
  slip: {
    borderRadius: 6,
    padding: 18,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  slipMagnet: { position: 'absolute', top: -9, left: 18 },
  magnet: {
    width: 22,
    height: 22,
    borderRadius: 11,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  magnetShine: {
    position: 'absolute',
    top: 4,
    left: 5,
    width: 7,
    height: 5,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  numeralEdge: { textShadowColor: 'rgba(0,0,0,0.22)', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 2 },
  heading: { fontFamily: DISPLAY, fontSize: 26, lineHeight: 32, marginTop: 8 },
  button: {
    minHeight: 56,
    borderRadius: 28,
    borderWidth: 2,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonLabel: { fontSize: 17, fontWeight: '700' },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 48, paddingHorizontal: 18, borderRadius: 24, borderWidth: 1.5, justifyContent: 'center' },
  chipLabel: { fontSize: 16, fontWeight: '600' },
  input: { minHeight: 56, borderRadius: 10, borderWidth: 1.5, paddingHorizontal: 16, fontSize: 18 },
  dateRow: {
    minHeight: 56,
    borderRadius: 10,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12 },
  tile: { flexGrow: 1, flexBasis: '30%', minWidth: 100, minHeight: 72, borderRadius: 10, borderWidth: 2, padding: 12, gap: 2 },
});
