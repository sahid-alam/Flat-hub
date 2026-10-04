// Kitty home, V2 "Card Stack": logo, the kitty, your top-up (brass, the one accent), quick add, who has topped up,
// recent entries, doorways, and this month's card. A floating "+ Add" pill opens the full spend form.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { poolCash, position, suggestedTopup, unreimbursed } from '@/domain/kitty';
import { expiringSoon, isEmpty, shoppingList } from '@/domain/stock';
import { formatINR, parseRupees, upiAmount } from '@/domain/money';
import { newId } from '@/lib/id';
import { insertOnce } from '@/lib/supabase';
import { monthLabel, monthOf, sayError, thisMonth } from '@/lib/util';
import { ActivitySlip, feed } from '@/ui/activity';
import { isOpen, useDuties } from '@/ui/duties';
import { QuickAdd } from '@/ui/quickadd';
import { monthName, monthRows, statusFor, toneFor } from '@/ui/statement';
import { SOON } from '@/ui/stock';
import {
  Avatars,
  Block,
  Field,
  Hero,
  Icon,
  Logo,
  MagnetButton,
  MonthCard,
  Position,
  Row,
  Rule,
  Screen,
  SectionLabel,
  T,
  tokens,
  usePalette,
} from '@/ui/kit';

const FADE = 92; // the scrim under the floating + Add pill, as the artboard specifies

export default function KittyHome() {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const h = useDuties();
  const [picking, setPicking] = useState(false); // the + Add pill steps aside while a quick-add confirm is open
  const { books, me, members, holder, isTreasurer, entries, spends, household, closes, reload } = h;
  // ponytail: both scans are O(lots × moves); memoised per load, which is enough at a flat's volume.
  // Sum the ledger into a Map<lot_id, qty> once if a few years of history ever makes this visible.
  const { short, expiring } = useMemo(
    () => ({
      short: shoppingList(h.products, h.lots, h.moves, h.shopping),
      expiring: expiringSoon(
        h.lots.filter((l) => l.location !== 'pantry' && !isEmpty(l.id, h.moves)),
        new Date().toISOString(),
        SOON,
      ),
    }),
    [h.products, h.lots, h.moves, h.shopping],
  );
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  // Today's duty: the viewer's own open turn if they have one, otherwise the first one due.
  const openToday = h.todays.filter((r) => isOpen(r.outcome));
  const myTurn = openToday.find((r) => r.memberId === me.id);
  const nextTurn = myTurn ?? openToday[0];
  const dutyDetail = nextTurn
    ? `${nextTurn.duty.name} · ${myTurn ? 'yours' : nextTurn.memberId ? h.name(nextTurn.memberId).split(' ')[0] : 'nobody free'}` +
      (openToday.length > 1 ? ` · ${openToday.length} due` : '')
    : h.todays.length
      ? 'all done'
      : 'none';

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
  const owed = unreimbursed(spends, entries);
  const rows = monthRows(spends, entries, month);
  const monthCount = rows.monthSpends.length + rows.monthEntries.length;
  const heroWidth = Math.min(width, 560) - 32 - 42;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.ground }}>
      <Screen padBottom={FADE}>
        <View style={styles.header}>
          <Logo />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <SectionLabel>{monthLabel(month)}</SectionLabel>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Mates"
              onPress={() => router.push('/mates')}
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
              {mine > 0 ? '· the kitty owes you' : mine < 0 ? '· due at your next top-up' : '· all square'}
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

        <QuickAdd onPicking={setPicking} />

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

        <Block style={{ gap: 0, paddingVertical: 4 }}>
          <Row
            label="Import Zepto order"
            icon={{ ios: 'doc.viewfinder', android: 'receipt_long' }}
            onPress={() => router.push('/import')}
          />
          <Rule />
          <Row
            label="Record a top-up"
            icon={{ ios: 'indianrupeesign', android: 'currency_rupee' }}
            onPress={() => router.push('/topup')}
          />
          <Rule />
          <Row
            label="Fridge"
            icon={{ ios: 'refrigerator', android: 'kitchen' }}
            detail={expiring.length ? `${expiring.length} to use` : 'none'}
            onPress={() => router.push('/fridge')}
          />
          <Rule />
          <Row
            label="Shopping"
            icon={{ ios: 'cart', android: 'shopping_cart' }}
            detail={short.length ? String(short.length) : 'none'}
            onPress={() => router.push('/shopping')}
          />
          <Rule />
          <Row
            label="Today's duty"
            icon={{ ios: 'checkmark.circle', android: 'task_alt' }}
            detail={dutyDetail}
            onPress={() => router.push('/duties')}
          />
          <Rule />
          <Row label="Away" icon={{ ios: 'airplane', android: 'flight' }} onPress={() => router.push('/away')} />
          <Rule />
          <Row
            label="To reimburse"
            icon={{ ios: 'arrow.uturn.left', android: 'undo' }}
            detail={owed.length ? `${owed.length} · ${formatINR(owed.reduce((a, s) => a + s.total_paise, 0))}` : 'none'}
            onPress={() => router.push('/reimburse')}
          />
        </Block>

        <View style={{ gap: 10 }}>
          <SectionLabel>Statements</SectionLabel>
          <MonthCard
            month={monthName(month)}
            pill={`${formatINR(rows.spent)} · ${monthCount} ${monthCount === 1 ? 'entry' : 'entries'}`}
            status={statusFor(month, closes ?? [])}
            tone={toneFor(month)}
            height={180}
            onPress={() => router.push({ pathname: '/statement/[month]', params: { month } })}
          />
          <Block style={{ gap: 0, paddingVertical: 4 }}>
            <Row
              label="Every month"
              icon={{ ios: 'calendar', android: 'calendar_month' }}
              onPress={() => router.push('/statement')}
            />
          </Block>
        </View>
      </Screen>

      {!picking && (
        <View pointerEvents="none" style={[styles.fade, { height: FADE + insets.bottom }]}>
          {[0, 0.35, 0.7, 1].map((o, i) => (
            <View key={o} style={{ flex: 1, opacity: o, backgroundColor: c.ground, marginTop: i ? -1 : 0 }} />
          ))}
        </View>
      )}
      {!picking && (
        <View pointerEvents="box-none" style={[styles.addDock, { bottom: insets.bottom + 16 }]}>
          <View style={{ width: 148 }}>
            <MagnetButton label="Add" icon={{ ios: 'plus', android: 'add' }} onPress={() => router.push('/spend')} />
          </View>
        </View>
      )}
    </SafeAreaView>
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
      <Hero paise={paise ?? suggested} size={44} />
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
          <T size={15} weight="600">
            {first} hasn't added a UPI ID yet (Mates → your UPI ID).
          </T>
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 60 },
  mates: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  spread: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  addDock: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0 },
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
