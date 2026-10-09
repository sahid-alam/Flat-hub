// Home — the screen whose absence was the biggest complaint. docs/PATTERNS.md §1: Asana's skeleton
// (date line → greeting → ONE alert → today → recent) with Zopa's three-figure snapshot block.
//
// Every figure here is computed from the same rows the kitty maths reads, so Home can never disagree
// with the ledger. The morning summary is templated by src/domain/summary.ts — facts, not a model.
//
// Nav Option A parks the kitty off the tab bar, and its stated risk is that **Home must carry the
// kitty figure in every state, including every empty one, or the ledger has no door.** The brass
// tile below is therefore unconditional: it renders at ₹0, with no treasurer, on day one.
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { donePoints, rota } from '@/domain/duties';
import { poolCash, position, suggestedTopup, toReimburse, unreimbursed } from '@/domain/kitty';
import { formatINR, upiAmount } from '@/domain/money';
import { periodTotal } from '@/domain/stats';
import { morningSummary, type Alert } from '@/domain/summary';
import { daysLeft, expiringSoon, isEmpty } from '@/domain/stock';
import { dayLabel, monthLabel, monthOf, thisMonth, today } from '@/lib/util';
import { ActivitySlip, feed } from '@/ui/activity';
import { useDuties } from '@/ui/duties';
import {
  AlertCard,
  Section,
  StatTile,
  SummaryCard,
  Tiles,
  TodayCard,
  type TodayDuty,
  type TodayExpiry,
} from '@/ui/home';
import { Block, Icon, Rule, Screen, T, TAB_BAR, usePalette } from '@/ui/kit';
import { MealsCard } from '@/ui/meals';
import { QuickAdd } from '@/ui/quickadd';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const EXPIRING_WITHIN = 2; // today, tomorrow, the day after: what "needs using" honestly covers
const RECENT = 4;
/** Mates are called by their first name everywhere on Home, as the concept draws it. */
const first = (full: string) => full.split(' ')[0];
const shiftDay = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** 'Wed, 7 October' from an IST date string, without pulling in a date library. */
function dateLine(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** Morning / afternoon / evening by the phone's own clock, which is the one the reader is living in. */
function partOfDay(): string {
  const hour = new Date().getHours();
  return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
}

export default function Home() {
  const c = usePalette();
  const h = useDuties();
  const { books, me, members, holder, isTreasurer, entries, spends, lots, moves, products, duties, choreEvents, absences, household, name, anchor, todays, reload } = h;
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const now = today();
  const month = thisMonth();

  // ---------------------------------------------------------------- the three figures
  const pool = poolCash(books);
  const mine = position(books, me.id);
  const points = donePoints(
    choreEvents.filter((e) => e.due_on.slice(0, 7) === month),
    me.id,
  );

  // ---------------------------------------------------------------- the alert, and only one
  // Priority, and it is deliberate: money the flat is holding that is not theirs comes before money
  // you are holding that is not yours. The owner's own words — "if the flat owes Anant, Anant should
  // have it on his home screen" — put being owed above being asked, so the top-up nudge comes last.
  const owedToMe = toReimburse(books, me.id);
  const owedOut = isTreasurer
    ? unreimbursed(spends, entries).filter((s) => s.paid_by !== me.id)
    : [];
  const owedOutTotal = owedOut.reduce((n, s) => n + s.total_paise, 0);
  const owedOutMates = [...new Set(owedOut.map((s) => s.paid_by))];
  const putInThisMonth = entries
    .filter((e) => e.kind === 'contribution' && e.member_id === me.id && monthOf(e.occurred_at) === month)
    .reduce((n, e) => n + e.amount_paise, 0);
  const owedToMeSpends = unreimbursed(spends, entries).filter((s) => s.paid_by === me.id);
  const topup = suggestedTopup(books, me.id);

  const alert: Alert =
    isTreasurer && owedOutTotal > 0 ? 'payback' : owedToMe > 0 ? 'getback' : putInThisMonth === 0 && topup > 0 ? 'topup' : null;

  // ---------------------------------------------------------------- today in the flat
  // One row per SLOT, not per instance: a duty can be held by two or three mates the same day, each
  // ticking their own half. `holderId` is whoever must tick it now — the mate who claimed an offer,
  // or, when nobody claimed, its owner.
  const slots = todays.flatMap((r) => r.slots.map((s) => ({ date: r.date, duty: r.duty, ...s })));
  const myToday = slots.filter((s) => s.holderId === me.id);
  const todayDuties: TodayDuty[] = todays.flatMap((r) =>
    r.slots.length
      ? r.slots.map((s) => ({
          key: `${r.duty.id}|${r.date}|${s.holderId}`,
          name: r.duty.name,
          who: s.holderId === me.id ? 'Your turn' : first(name(s.holderId)),
          mine: s.holderId === me.id,
          done: s.done,
        }))
      : // everyone away, or nobody in the duty's roster: the tile still says the duty is due
        [{ key: `${r.duty.id}|${r.date}`, name: r.duty.name, who: 'Nobody free', mine: false, done: false }],
  );

  const nowIso = new Date().toISOString();
  const productName = (id: string | null) => products.find((p) => p.id === id)?.name ?? 'Something';
  // An emptied lot keeps its expiry date, so the stock has to be checked too or Home shouts about
  // a carton somebody finished yesterday.
  const soon = expiringSoon(lots, nowIso, EXPIRING_WITHIN).filter((l) => !isEmpty(l.id, moves));
  const expiring: TodayExpiry[] = soon.map((l) => {
    const d = daysLeft(l.expiry_date, nowIso) ?? 0;
    return {
      key: l.id,
      name: productName(l.product_id),
      label: d < 0 ? `Expired ${dayLabel(l.expiry_date!)}` : d === 0 ? 'Use today' : `${d} day${d === 1 ? '' : 's'} left`,
      urgent: d <= 0,
    };
  });

  // Yesterday's open instances, as a COUNT — the summary never names whose they were.
  // `now` as the last argument is what keeps a missed slot missed: it earns no provisional credit.
  const missedYesterday = rota(duties, members, absences, choreEvents, shiftDay(now, -1), 1, anchor, now)
    .flatMap((r) => r.slots)
    .filter((s) => !s.done).length;

  // ---------------------------------------------------------------- meals
  // The flag, never the name: a flat that renames "Dishes" keeps its meal planner. rota() hands back
  // the engine's `Duty`, which has no UI flags on it, so the row is looked up by id instead.
  const plansMeals = new Set(duties.filter((d) => d.plans_meals).map((d) => d.id));
  const mealRows = slots.filter((s) => plansMeals.has(s.duty.id));
  const youPlanMeals = mealRows.some((s) => s.holderId === me.id);
  const planners = [...new Set(mealRows.map((s) => first(name(s.holderId))))];

  // ---------------------------------------------------------------- the summary
  const current = members.filter((m) => !m.left_on || m.left_on.slice(0, 7) >= month);
  const toppedUp = new Set(
    entries.filter((e) => e.kind === 'contribution' && monthOf(e.occurred_at) === month).map((e) => e.member_id),
  );
  const lines = morningSummary({
    spentThisMonthPaise: periodTotal(spends, [month]),
    daysElapsed: Number(now.slice(8, 10)),
    poolPaise: pool,
    yourDutiesToday: [...new Set(myToday.map((s) => s.duty.name.toLowerCase()))],
    // B4's co-assignment makes this real: the other holders of a duty you are also on today.
    withYouToday: [
      ...new Set(
        slots
          .filter((s) => s.holderId !== me.id && myToday.some((o) => o.duty.id === s.duty.id && o.date === s.date))
          .map((s) => first(name(s.holderId))),
      ),
    ],
    othersDutiesToday: slots
      .filter((s) => s.holderId !== me.id)
      .map((s) => ({ duty: s.duty.name.toLowerCase(), who: first(name(s.holderId)) })),
    youPlanMeals,
    expiring: soon.map((l) => ({ name: productName(l.product_id), daysLeft: daysLeft(l.expiry_date, nowIso) ?? 0 })),
    othersNotToppedUp: current.filter((m) => m.id !== me.id && !toppedUp.has(m.id)).length,
    missedYesterday,
    isTreasurer,
    alert,
  });

  const holderFirst = holder ? first(holder.display_name) : null;
  const upi =
    holder?.upi_vpa && topup
      ? `upi://pay?pa=${holder.upi_vpa}&pn=${encodeURIComponent(holder.display_name)}&am=${upiAmount(topup)}&cu=INR&tn=${encodeURIComponent(`FlatHub kitty ${monthLabel(month)}`)}`
      : null;

  return (
    // the tab navigator's sceneStyle pads the top inset for every tab, so no SafeAreaView here
    <View style={{ flex: 1, backgroundColor: c.ground }}>
      <Screen padBottom={TAB_BAR}>
        <View style={styles.header}>
          <View style={{ flex: 1, gap: 2 }}>
            <T size={12} weight="700" soft>
              {dateLine(now)}
            </T>
            <T size={26} weight="800" style={{ letterSpacing: -0.6, lineHeight: 32 }}>
              Good {partOfDay()}, {first(me.display_name)}
            </T>
          </View>
          <Pressable
            accessibilityRole="button"
            // B5 builds /profile; until then the avatar opens the flat sheet, which is where the
            // UPI ID, away dates and favourites still live.
            accessibilityLabel="You — your UPI ID, away dates and favourites"
            onPress={() => router.push('/flat')}
            style={({ pressed }) => [
              styles.avatar,
              { borderColor: c.line, backgroundColor: c.raised },
              pressed && { opacity: 0.7 },
            ]}>
            <T size={14} weight="800">
              {me.display_name.slice(0, 2)}
            </T>
          </Pressable>
        </View>

        {/* Exactly one alert card, and only when there is something to say. Never two. */}
        {alert === 'payback' && (
          <AlertCard
            title={`${formatINR(owedOutTotal)} to pay back to ${owedOutMates.length} ${owedOutMates.length === 1 ? 'mate' : 'mates'}`}
            detail={owedOutMates.map((id) => `${first(name(id))} ${formatINR(owedOut.filter((s) => s.paid_by === id).reduce((n, s) => n + s.total_paise, 0))}`).join(' · ')}
            action="Pay back"
            onPress={() => router.push('/reimburse')}
          />
        )}
        {alert === 'getback' && (
          <AlertCard
            title={`${formatINR(owedToMe)} to get back${holderFirst ? ` from ${holderFirst}` : ''}`}
            detail={`${owedToMeSpends.length} ${owedToMeSpends.length === 1 ? 'spend' : 'spends'} from your own pocket · still to come back`}
            action="Statement"
            onPress={() => router.push(`/statement/${month}`)}
          />
        )}
        {alert === 'topup' && (
          <AlertCard
            title={`Your ${formatINR(topup)} top-up isn't in yet`}
            detail={
              upi
                ? `${monthLabel(month)} · pay ${holderFirst} and record it`
                : `${monthLabel(month)} · ${holderFirst ?? 'the treasurer'} hasn't added a UPI ID yet`
            }
            action={upi ? `Pay ${holderFirst}` : 'Open the kitty'}
            onPress={() => {
              if (upi) Linking.openURL(upi).catch(() => router.push('/kitty'));
              else router.push('/kitty');
            }}
          />
        )}

        <SummaryCard lines={lines} />

        <Tiles>
          {/* The one brass thing on Home, and the only door to the ledger. Unconditional. */}
          <StatTile
            cap="In the kitty"
            paise={pool}
            sub={isTreasurer ? 'you hold it' : holderFirst ? `held by ${holderFirst}` : 'no treasurer set'}
            brass
            onPress={() => router.push('/kitty')}
            accessibilityLabel={`In the kitty, ${formatINR(pool)} — open the ledger`}
          />
          <StatTile
            cap="Your position"
            {...(mine === 0 ? { big: 'Settled' } : { paise: mine })}
            positive={mine > 0}
            sub={mine > 0 ? 'to get back' : mine < 0 ? 'due at your next top-up' : 'nothing either way'}
          />
          <StatTile cap="Duty points" big={String(points)} sub="this month" />
        </Tiles>

        <Section label={youPlanMeals ? 'Lunch and dinner' : "Today's meals"} />
        <MealsCard planners={planners} youPlan={youPlanMeals} />

        <Section label="Today in the flat" link="Duties" onPress={() => router.push('/duties')} />
        <TodayCard
          duties={todayDuties}
          expiring={expiring}
          onDuties={() => router.push('/duties')}
          onFridge={() => router.push('/kitchen')}
        />

        <Section label="Quick add" />
        <QuickAdd compact />

        <Section label="Recent" link="See all" onPress={() => router.push('/kitty')} />
        <Block style={{ gap: 0, paddingBottom: 8 }}>
          {spends.length + entries.length === 0 ? (
            <T soft style={{ paddingVertical: 12 }}>
              Nothing yet. Tap a favourite or the + for the first spend.
            </T>
          ) : (
            feed(spends, entries)
              .slice(0, RECENT)
              .map((item, i) => (
                <View key={(item.spend ?? item.entry)!.id}>
                  {i > 0 && <Rule />}
                  {/* read-only here: reversing an entry is a ledger action and lives on /kitty */}
                  <ActivitySlip item={item} readOnly />
                </View>
              ))
          )}
        </Block>

        {household.pool_holder_id === null && (
          <Block tone="raised">
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <Icon name={{ ios: 'person.badge.key', android: 'key' }} size={20} color={c.muted} />
              <T size={15} weight="600" style={{ flex: 1 }}>
                No treasurer set yet, so there is nobody to pay the kitty to.
              </T>
            </View>
          </Block>
        )}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, minHeight: 64 },
  avatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
