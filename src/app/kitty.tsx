// The kitty ledger: the balance, your top-up (brass, the one accent), quick add, who has topped up,
// recent entries. It left the tab bar in V3 — Home's brass kitty tile is its door, which is the whole
// risk nav Option A carries. The occasional things (away, to reimburse, mates, favourites, record a
// top-up) sit behind the people button, on /flat.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { poolCash, position, suggestedTopup } from '@/domain/kitty';
import { formatINR, parseRupees, upiAmount } from '@/domain/money';
import { useHousehold } from '@/lib/books';
import { newId } from '@/lib/id';
import { insertOnce } from '@/lib/supabase';
import { monthLabel, monthOf, sayError, thisMonth } from '@/lib/util';
import { ActivitySlip, feed } from '@/ui/activity';
import { QuickAdd } from '@/ui/quickadd';
import { monthName } from '@/ui/statement';
import {
  Avatars,
  Block,
  Field,
  Hero,
  Icon,
  Position,
  Rule,
  Screen,
  SectionLabel,
  T,
  tokens,
  usePalette,
} from '@/ui/kit';
import { askForUpi } from '@/ui/pay';

export default function Kitty() {
  const c = usePalette();
  const { width } = useWindowDimensions();
  const h = useHousehold();
  const { books, me, members, holder, isTreasurer, entries, spends, household, reload } = h;
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const month = thisMonth();
  const inMonth = (iso: string) => monthOf(iso) === month;
  // Net top-ups this month per mate (a reversed top-up cancels out).
  const putIn = new Map<string, number>();
  for (const e of entries)
    if (e.kind === 'contribution' && inMonth(e.occurred_at))
      putIn.set(e.member_id, (putIn.get(e.member_id) ?? 0) + e.amount_paise);
  const paidThisMonth = (putIn.get(me.id) ?? 0) > 0;
  const current = members.filter((m) => !m.left_on || m.left_on.slice(0, 7) >= month);
  const toppedUp = current.filter((m) => (putIn.get(m.id) ?? 0) > 0);
  const totalIn = [...putIn.values()].reduce((a, p) => a + p, 0);

  const mine = position(books, me.id);
  const heroWidth = Math.min(width, 560) - 32 - 42;

  return (
    <View style={{ flex: 1, backgroundColor: c.ground }}>
      <Screen>
        {/* the stack header carries the title and the back chevron; this row is just the month and /flat */}
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <SectionLabel>{monthLabel(month)}</SectionLabel>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="The flat — away, to reimburse, mates and favourites"
              onPress={() => router.push('/flat')}
              style={({ pressed }) => [
                styles.mates,
                { borderColor: c.line, backgroundColor: c.surface },
                pressed && { opacity: 0.7 },
              ]}>
              <Icon name={{ ios: 'person.2', android: 'group' }} size={22} />
            </Pressable>
          </View>
        </View>

        <Block tone="stone" style={{ gap: 6 }}>
          <View style={styles.spread}>
            <SectionLabel>In the kitty</SectionLabel>
            {holder && (
              <T size={13} weight="600" soft>
                held by {holder.display_name.split(' ')[0]}
              </T>
            )}
          </View>
          <Hero paise={poolCash(books)} maxWidth={heroWidth} />
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'baseline', flexWrap: 'wrap', marginTop: 4 }}>
            <T size={15} weight="600" soft>
              You
            </T>
            <Position paise={mine} />
            <T size={15} weight="600" soft>
              {/* DESIGN.md rule 5: "Get back", never "owe". This line predates V3 and said "the kitty owes you". */}
              {mine > 0 ? '· to get back' : mine < 0 ? '· due at your next top-up' : '· all square'}
            </T>
          </View>
        </Block>

        {!paidThisMonth && (
          <TopUpCard
            key={suggestedTopup(books, me.id)}
            suggested={suggestedTopup(books, me.id)}
            position={mine}
            monthly={household.monthly_topup_paise}
            holderName={holder?.display_name ?? null}
            vpa={holder?.upi_vpa ?? null}
            self={isTreasurer}
            month={month}
            onRecord={async (paise) => {
              await insertOnce('pool_entry', {
                id: newId(),
                household_id: household.id,
                kind: 'contribution',
                member_id: me.id,
                amount_paise: paise,
                note: `${monthLabel(month)} top-up`,
              });
              await reload();
            }}
          />
        )}

        <QuickAdd />

        <Block tone="raised">
          <View style={styles.spread}>
            <T size={16} weight="700" style={{ flex: 1 }}>
              {toppedUp.length} of {current.length} topped up · {formatINR(totalIn)} in
            </T>
            <T size={13} soft>
              {monthName(month)}
            </T>
          </View>
          <Avatars mates={current.map((m) => ({ id: m.id, name: m.display_name.split(' ')[0], done: (putIn.get(m.id) ?? 0) > 0 }))} />
        </Block>

        <Block style={{ gap: 0, paddingBottom: 8 }}>
          <SectionLabel>Recent</SectionLabel>
          {spends.length + entries.length === 0 ? (
            <T soft style={{ paddingVertical: 12 }}>
              Nothing yet. Tap a favourite or Add for the first spend.
            </T>
          ) : (
            <>
              {feed(spends, entries)
                .slice(0, 8)
                .map((item, i) => (
                  <View key={(item.spend ?? item.entry)!.id}>
                    {i > 0 && <Rule />}
                    <ActivitySlip item={item} onChanged={reload} />
                  </View>
                ))}
              <T size={13} soft style={{ paddingTop: 4 }}>
                Long-press an entry to reverse it.
              </T>
            </>
          )}
        </Block>
      </Screen>
    </View>
  );
}

function TopUpCard({
  suggested,
  position: pos,
  monthly,
  holderName: holderDisplayName,
  vpa,
  self,
  month,
  onRecord,
}: {
  suggested: number;
  position: number;
  monthly: number;
  holderName: string | null;
  vpa: string | null;
  self: boolean;
  month: string;
  onRecord: (paise: number) => Promise<void>;
}) {
  const [text, setText] = useState(upiAmount(suggested).replace(/\.00$/, ''));
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paise = parseRupees(text);
  const holderName = holderDisplayName ?? 'the treasurer'; // a flat with no treasurer set yet
  const first = holderName.split(' ')[0];
  const name = monthName(month);

  if (suggested === 0)
    return (
      <Block tone="sage">
        <T weight="700">You're covered for {name}.</T>
        <T soft>Your credit in the kitty is more than this month's top-up.</T>
      </Block>
    );

  const upi =
    vpa && paise
      ? `upi://pay?pa=${vpa}&pn=${encodeURIComponent(holderName)}&am=${upiAmount(paise)}&cu=INR&tn=${encodeURIComponent(`FlatHub kitty ${monthLabel(month)}`)}`
      : null;

  return (
    <Block tone="brass" accessibilityLabel={`${name}, your top-up`} style={{ gap: 10 }}>
      <View style={styles.spread}>
        <T size={14} weight="700">
          {name} · Your top-up
        </T>
        {!self && (
          <T size={14} weight="600" soft>
            to {holderName}
          </T>
        )}
      </View>
      {/* a figure inside a card, so DESIGN.md's card-figure 34 — it was V2's 44, which the V3
          scale no longer has a slot for. The hero on this screen is the kitty balance, not this. */}
      <Hero paise={paise ?? suggested} size={34} />
      <T size={13} weight="600" soft>
        Position {formatINR(pos, { sign: true })} · {formatINR(monthly)} a month + catch-up
      </T>
      {editing ? (
        <Field
          label={`${monthLabel(month)} top-up (₹)`}
          value={text}
          onChangeText={setText}
          keyboardType="decimal-pad"
          autoFocus
        />
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => setEditing(true)}
          style={{ minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' }}>
          <T size={15} weight="700" style={{ textDecorationLine: 'underline' }}>
            Paying a different amount?
          </T>
        </Pressable>
      )}
      {!self &&
        (upi ? (
          <OnyxPill
            label="Pay with UPI"
            icon={{ ios: 'arrow.up.right', android: 'north_east' }}
            onPress={() => Linking.openURL(upi).catch(() => setError('No UPI app found on this phone.'))}
          />
        ) : (
          <OnyxPill label={`Ask ${first} to add a UPI ID`} outline onPress={() => void askForUpi(first)} />
        ))}
      <OnyxPill
        label={busy ? 'Saving…' : self ? 'Record my top-up' : "I've paid, record it"}
        outline={!self}
        disabled={!paise || busy}
        onPress={async () => {
          setBusy(true);
          setError(null);
          try {
            await onRecord(paise!);
          } catch (e) {
            setError(sayError(e, holderDisplayName));
          }
          setBusy(false);
        }}
      />
      {error && (
        // Clay is unreadable on brass; the error stays in onyx ink with an alert icon.
        <View role="alert" style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Icon name={{ ios: 'exclamationmark.circle', android: 'error' }} size={18} />
          <T size={15} weight="700" style={{ flex: 1 }}>
            {error}
          </T>
        </View>
      )}
    </Block>
  );
}

/** A pill on the brass block: onyx fill with ivory text, or an onyx outline. Kit pills use screen ink, which vanishes on brass. */
function OnyxPill({
  label,
  onPress,
  icon,
  outline,
  disabled,
}: {
  label: string;
  onPress: () => void;
  icon?: { ios: string; android: string };
  outline?: boolean;
  disabled?: boolean;
}) {
  const { onyx } = tokens.block;
  const fg = outline ? onyx : tokens.dark.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: outline ? 'transparent' : onyx, borderColor: onyx },
        disabled && { opacity: 0.45 },
        pressed && { transform: [{ scale: 0.97 }] },
      ]}>
      <T size={17} weight="700" color={fg}>
        {label}
      </T>
      {icon && <Icon name={icon} size={18} color={fg} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', minHeight: 48 },
  mates: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  spread: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  pill: {
    minHeight: 56,
    borderRadius: 9999,
    borderWidth: 1.5,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
});
