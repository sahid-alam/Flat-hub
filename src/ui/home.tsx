// The cards Home is made of. The screen itself (src/app/(tabs)/index.tsx) does the arithmetic and
// hands each card finished facts, so nothing here reads the books.
// docs/PATTERNS.md §1: Asana's skeleton (date line → greeting → ONE alert → today → recent) with
// Zopa's snapshot block as the three tiles.
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Block, Hero, Icon, Rule, T, tokens, useInk, usePalette } from '@/ui/kit';

/** Screen gutter (16 each side) and the two 8pt gaps between three tiles, then the tile's padding. */
const tileInnerWidth = (screen: number) => (Math.min(screen, 560) - 32 - 16) / 3 - 24;

/** One of the three snapshot tiles. The brass one is the kitty, and it is the only brass on Home. */
export function StatTile({
  cap,
  big,
  paise,
  sub,
  positive,
  brass,
  onPress,
  accessibilityLabel,
}: {
  cap: string;
  /** A word ("Settled") or a plain count ("412"). For money pass `paise` instead. */
  big?: string;
  /** An amount. Drawn with Hero, which shrinks the digits to the tile — a five-figure kitty in a
   *  third of a 390pt screen truncates at any fixed size, and a truncated rupee figure is a lie. */
  paise?: number;
  sub: string;
  /** "Get back" green. The sub line always carries the word too, so colour never means alone. */
  positive?: boolean;
  brass?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const c = usePalette();
  const { width } = useWindowDimensions();
  // A brass tile carries onyx ink in both modes, exactly as a brass Block does.
  const ink = brass ? { ink: c.onAccent, muted: tokens.block.onyxMuted } : { ink: c.ink, muted: c.muted };
  const body = (
    <>
      <T size={11} weight="800" color={ink.muted} numberOfLines={2} style={st.cap}>
        {cap.toUpperCase()}
      </T>
      {paise === undefined ? (
        <T num size={21} color={ink.ink} numberOfLines={1}>
          {big}
        </T>
      ) : (
        // Hero draws a minus for a negative and nothing for a positive; the sub line says which,
        // so the figure needs no plus sign to be unambiguous.
        <Hero paise={paise} size={21} color={positive ? c.positive : ink.ink} maxWidth={tileInnerWidth(width)} />
      )}
      <T size={12} weight="600" color={ink.muted} numberOfLines={2}>
        {sub}
      </T>
    </>
  );
  if (!onPress)
    return (
      <View style={[st.tile, { backgroundColor: brass ? c.accent : c.raised }]} accessibilityLabel={accessibilityLabel}>
        {body}
      </View>
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `${cap}, ${big}, ${sub}`}
      onPress={onPress}
      style={({ pressed }) => [
        st.tile,
        { backgroundColor: brass ? c.accent : c.raised },
        pressed && { transform: [{ scale: 0.97 }] },
      ]}>
      {body}
      <Icon name={{ ios: 'arrow.up.right', android: 'north_east' }} size={15} color={ink.muted} />
    </Pressable>
  );
}

export function Tiles({ children }: { children: React.ReactNode }) {
  return <View style={st.tiles}>{children}</View>;
}

/**
 * Exactly one alert card, and only when there is something to say — Asana's discipline, copied on
 * purpose. The caller decides which one; see the priority comment on Home.
 */
export function AlertCard({
  title,
  detail,
  action,
  onPress,
}: {
  title: string;
  detail: string;
  action: string;
  onPress: () => void;
}) {
  const c = usePalette();
  return (
    <View role="status" style={[st.alert, { backgroundColor: c.surface, borderColor: c.edge }]}>
      <Icon name={{ ios: 'exclamationmark.circle', android: 'error' }} size={20} color={c.muted} />
      <View style={{ flex: 1, gap: 2 }}>
        <T size={15.5} weight="700">
          {title}
        </T>
        <T size={12} soft>
          {detail}
        </T>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${action} — ${title}`}
        onPress={onPress}
        style={({ pressed }) => [
          st.alertPill,
          { borderColor: c.line },
          pressed && { opacity: 0.6, transform: [{ scale: 0.97 }] },
        ]}>
        <T size={14} weight="700">
          {action}
        </T>
      </Pressable>
    </View>
  );
}

/** The morning summary. Lines come from src/domain/summary.ts — facts, never a model. */
export function SummaryCard({ lines }: { lines: string[] }) {
  const c = usePalette();
  if (lines.length === 0) return null; // rule 4: say nothing rather than pad
  return (
    <Block>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name={{ ios: 'sun.max', android: 'light_mode' }} size={16} color={c.muted} />
        <T size={11.5} weight="800" color={c.muted} style={st.cap}>
          YOUR MORNING
        </T>
      </View>
      {lines.map((l) => (
        <T key={l} size={15.5} weight="600">
          {l}
        </T>
      ))}
    </Block>
  );
}

export type TodayDuty = { key: string; name: string; who: string; mine: boolean; done: boolean };
export type TodayExpiry = { key: string; name: string; label: string; urgent: boolean };

/**
 * Today in the flat: whose turn it is, and what the fridge wants using. Read-only — ticking a duty
 * lives on the Duties tab, which owns the chore_event write and the undo that goes with it.
 */
export function TodayCard({
  duties,
  expiring,
  onDuties,
  onFridge,
}: {
  duties: TodayDuty[];
  expiring: TodayExpiry[];
  onDuties: () => void;
  onFridge: () => void;
}) {
  const c = usePalette();
  if (duties.length === 0 && expiring.length === 0)
    return (
      <Block>
        <T soft>Nothing due today, and nothing in the fridge needs using.</T>
      </Block>
    );
  return (
    <Block style={{ gap: 0, paddingVertical: 4 }}>
      {duties.map((d, i) => (
        <View key={d.key}>
          {i > 0 && <Rule />}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${d.name}, ${d.who}${d.done ? ', done' : ''} — open Duties`}
            onPress={onDuties}
            style={({ pressed }) => [st.row, pressed && { opacity: 0.6 }]}>
            <View
              style={[
                st.tick,
                { borderColor: d.done ? 'transparent' : c.line, backgroundColor: d.done ? c.positiveBg : 'transparent' },
              ]}>
              {d.done && <Icon name={{ ios: 'checkmark', android: 'check' }} size={13} color={c.positive} />}
            </View>
            <T size={15.5} weight={d.mine ? '700' : '600'} style={{ flex: 1 }}>
              {d.name}
            </T>
            <T size={12} weight="600" color={d.mine ? c.accentText : c.muted}>
              {d.who}
            </T>
          </Pressable>
        </View>
      ))}
      {expiring.map((e, i) => (
        <View key={e.key}>
          {(i > 0 || duties.length > 0) && <Rule />}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${e.name}, ${e.label} — open the fridge`}
            onPress={onFridge}
            style={({ pressed }) => [st.row, pressed && { opacity: 0.6 }]}>
            <Icon name={{ ios: 'refrigerator', android: 'kitchen' }} size={18} color={c.muted} />
            <T size={15.5} weight="600" style={{ flex: 1 }}>
              {e.name}
            </T>
            <View style={[st.badge, { backgroundColor: e.urgent ? c.warnBg : c.sunk }]}>
              <T size={11.5} weight="700" color={e.urgent ? c.warnFg : c.muted}>
                {e.label}
              </T>
            </View>
          </Pressable>
        </View>
      ))}
    </Block>
  );
}

/** A section heading with an optional link on the right. */
export function Section({ label, link, onPress }: { label: string; link?: string; onPress?: () => void }) {
  const { muted } = useInk();
  return (
    <View style={st.section}>
      <T size={11.5} weight="800" color={muted} style={st.cap}>
        {label.toUpperCase()}
      </T>
      {link && onPress && (
        <Pressable
          accessibilityRole="link"
          onPress={onPress}
          style={({ pressed }) => [{ minHeight: 48, justifyContent: 'center' }, pressed && { opacity: 0.6 }]}>
          <T size={14} weight="700" style={{ textDecorationLine: 'underline' }}>
            {link}
          </T>
        </Pressable>
      )}
    </View>
  );
}

/** Quick add, shrunk to one horizontally scrolling row — it keeps its place without taking the best space. */
export function Strip({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={st.strip}
      // the gutter is Screen's 16px, so the strip bleeds to the screen edge and back
      style={{ marginHorizontal: -16 }}>
      {children}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  cap: { letterSpacing: 0.8 },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, minWidth: 0, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 12, gap: 3, minHeight: 104 },
  alert: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 24, borderWidth: 1, padding: 14 },
  alertPill: { minHeight: 48, paddingHorizontal: 16, borderRadius: 9999, borderWidth: 1.5, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8 },
  tick: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  badge: { borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 3 },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  strip: { paddingHorizontal: 16, gap: 10 },
});
