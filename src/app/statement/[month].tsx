import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { addedLate, istDate, monthBreakdown, presenceWeights, shares, SOURCE_LABEL, type Source } from '@/domain/kitty';
import { formatINR } from '@/domain/money';
import { useHousehold } from '@/lib/books';
import { supabase } from '@/lib/supabase';
import { confirm, dayLabel, sayError, thisMonth } from '@/lib/util';
import { ActivitySlip, feed } from '@/ui/activity';
import {
  Block,
  Chip,
  ErrorText,
  Hero,
  Icon,
  MagnetButton,
  MonthCard,
  Rule,
  Screen,
  SectionLabel,
  T,
  usePalette,
} from '@/ui/kit';
import { daysIn, monthName, monthRows, statusFor, toneFor } from '@/ui/statement';

/** One month, read-only and the same for every mate. */
export default function MonthStatement() {
  const { month = '' } = useLocalSearchParams<{ month: string }>();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return (
      <Screen>
        <T soft>There is no statement for that month.</T>
      </Screen>
    );
  }
  return <Detail month={month} />;
}

const DAYS_W = 76;
const SHARE_W = 100;

/** All three tiles share one fill: in light, `stone` and `raised` are the same beige, so a fill
 * difference implied an emphasis you couldn't see. The bar below carries it, in both modes. */
/** Seven sources, three tokens: the bar cycles them in SOURCES order, the same way SplitBar does
 *  (src/ui/stats.tsx:108). Only the sources with money in them are drawn. */
const BARS = ['accent', 'line', 'muted'] as const;

function Detail({ month }: { month: string }) {
  const c = usePalette();
  const { spends, entries, absences, members, books, me, closes, household, isTreasurer, name: nameOf, holder, reload } = useHousehold();
  const { monthSpends, monthEntries, spent } = monthRows(spends, entries, month);
  const monthShares = shares({ ...books, spends: monthSpends });
  const w = presenceWeights(month, books.members, books.absences);
  const monthAbsences = absences.filter((a) => a.from_date.slice(0, 7) <= month && a.to_date.slice(0, 7) >= month);
  const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const put = total(monthEntries.filter((e) => e.kind === 'contribution').map((e) => e.amount_paise));
  const back = total(monthEntries.filter((e) => e.kind === 'reimbursement').map((e) => e.amount_paise));
  const { bySource, byCategory, fromPool, ownPocket } = monthBreakdown(books, month);
  const mates = members.filter((m) => m.id in w); // members that month; later joiners don't get a 0-day row

  const name = monthName(month);
  const short = name.slice(0, 3);
  const days = daysIn(month);
  const closed = (closes ?? []).find((x) => x.month === month);
  const status = statusFor(month, closes ?? []);
  const split = bySource.map((g, i) => ({ ...g, label: SOURCE_LABEL[g.source as Source], bar: BARS[i % BARS.length] }));

  return (
    <Screen>
      <Stack.Screen options={{ title: `${name} ${month.slice(0, 4)}` }} />
      <MonthCard month={name} pill={`1–${days} ${short} · ${days} days`} status={status} tone={toneFor(month)} />

      <Block>
        <SectionLabel>Spent</SectionLabel>
        <Hero paise={spent} size={56} />
        <T size={13} soft>
          Pool and own-pocket spends, shared by days present.
        </T>
        {spent > 0 && (
          <>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {split.map((s) => (
                <Block
                  key={s.source}
                  tone="raised"
                  accessibilityLabel={`${s.label} ${formatINR(s.paise)}, ${s.pct} percent`}
                  style={{ flex: 1, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 20, gap: 2 }}>
                  <T size={13} weight="700">
                    {s.label}
                  </T>
                  <T num size={22} numberOfLines={1}>
                    {formatINR(s.paise)}
                  </T>
                  <T size={13} weight="700" soft>
                    {s.pct}%
                  </T>
                </Block>
              ))}
            </View>
            <View aria-hidden style={{ flexDirection: 'row', gap: 3, height: 12 }}>
              {split.map((s) => (
                <View key={s.source} style={{ flex: Math.max(0, s.paise), borderRadius: 6, backgroundColor: c[s.bar] }} />
              ))}
            </View>
          </>
        )}
      </Block>

      {byCategory.length > 0 && (
        <Block style={{ gap: 10 }}>
          <SectionLabel>What it went on</SectionLabel>
          {byCategory.map((g) => (
            <View key={g.category} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <T size={15} weight="600" style={{ flex: 1 }} numberOfLines={1}>
                  {g.category}
                </T>
                <T num size={15}>
                  {formatINR(g.paise)}
                </T>
                <T size={13} weight="700" soft style={{ width: 40, textAlign: 'right' }}>
                  {g.pct}%
                </T>
              </View>
              <View aria-hidden style={{ height: 6, borderRadius: 3, backgroundColor: c.hair }}>
                <View style={{ width: `${g.pct}%`, height: 6, borderRadius: 3, backgroundColor: c.line }} />
              </View>
            </View>
          ))}
          <T size={13} soft>
            By each product's current category; anything unitemised or uncategorised is Other.
          </T>
        </Block>
      )}

      <Block style={{ gap: 0 }}>
        <SectionLabel>Shares · by days present</SectionLabel>
        <View role="table" aria-label={`${name} shares`} style={{ marginTop: 8 }}>
          <View role="row" style={{ flexDirection: 'row', paddingBottom: 8 }}>
            {['Mate', 'Days', 'Share'].map((h, i) => (
              <View
                key={h}
                role="columnheader"
                style={i === 0 ? { flex: 1 } : i === 1 ? { width: DAYS_W } : { width: SHARE_W, alignItems: 'flex-end' }}>
                <SectionLabel>{h}</SectionLabel>
              </View>
            ))}
          </View>
          {mates.map((m) => {
            const away = monthAbsences.filter((a) => a.member_id === m.id);
            const present = w[m.id];
            return (
              <View
                key={m.id}
                role="row"
                style={{ flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingVertical: 8, borderTopWidth: 1, borderColor: c.hair }}>
                <View role="rowheader" style={{ flex: 1, gap: 4, paddingRight: 8 }}>
                  <T size={16} weight="600">
                    {m.display_name}
                    {m.id === me.id ? ' · you' : ''}
                  </T>
                  {away.map((a) => (
                    <View key={a.id} style={{ gap: 4 }}>
                      <T size={13} soft>
                        Away {dayLabel(a.from_date)} – {dayLabel(a.to_date)}
                      </T>
                      {addedLate(a) && <Chip kind="late" label={`added late, on ${dayLabel(istDate(a.created_at))}`} />}
                    </View>
                  ))}
                </View>
                <View role="cell" style={{ width: DAYS_W }}>
                  <T size={15} soft={present === days}>
                    {present} of {days}
                  </T>
                </View>
                <View role="cell" style={{ width: SHARE_W }}>
                  <T num size={16} style={{ textAlign: 'right' }}>
                    {formatINR(monthShares[m.id] ?? 0)}
                  </T>
                </View>
              </View>
            );
          })}
          <View
            role="row"
            style={{ flexDirection: 'row', alignItems: 'center', minHeight: 52, borderTopWidth: 1.5, borderColor: c.line }}>
            <View role="rowheader" style={{ flex: 1 }}>
              <T size={16} weight="700">
                Total
              </T>
            </View>
            <View role="cell" style={{ width: SHARE_W }}>
              <T num size={16} style={{ textAlign: 'right' }}>
                {formatINR(total(Object.values(monthShares)))}
              </T>
            </View>
          </View>
        </View>
        <T size={13} soft>
          Split by days present; only absences of 3 or more days count.
        </T>
      </Block>

      <Block style={{ gap: 0 }}>
        {(
          [
            ['Put in', put],
            ['Spent from the kitty', fromPool],
            ['Spent from own pockets', ownPocket],
            ['Paid back', back],
          ] as const
        ).map(([label, paise], i) => (
          <View key={label}>
            {i > 0 && <Rule />}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 52 }}>
              <T>{label}</T>
              <T num>{formatINR(paise)}</T>
            </View>
          </View>
        ))}
      </Block>

      <Block style={{ gap: 0 }}>
        <SectionLabel>Entries · {monthSpends.length + monthEntries.length}</SectionLabel>
        {monthSpends.length + monthEntries.length === 0 ? (
          <T soft style={{ marginTop: 12 }}>
            Nothing recorded this month.
          </T>
        ) : (
          feed(monthSpends, monthEntries).map((item) => (
            <ActivitySlip key={(item.spend ?? item.entry)!.id} item={item} readOnly />
          ))
        )}
      </Block>

      <View style={{ alignItems: 'center', gap: 8, paddingBottom: 8 }}>
        <View style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name={{ ios: closed ? 'lock' : 'lock.open', android: closed ? 'lock' : 'lock_open' }} size={14} color={c.muted} />
          <T size={13} soft style={{ textAlign: 'center' }}>
            {closed
              ? `Closed · frozen on ${dayLabel(istDate(closed.closed_at))} by ${nameOf(closed.closed_by)}`
              : month === thisMonth()
                ? `Read-only · ends ${days} ${short}`
                : `Read-only · still provisional until ${holder?.display_name.split(' ')[0] ?? 'the treasurer'} closes ${name}`}
          </T>
        </View>
        {closed && isTreasurer && <Reopen month={month} householdId={household.id} onReopened={reload} />}
      </View>
    </Screen>
  );
}

/** The treasurer's way back in: quiet, because a reopened month can change everyone's settled share. */
function Reopen({ month, householdId, onReopened }: { month: string; householdId: string; onReopened: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const full = `${monthName(month)} ${month.slice(0, 4)}`;

  return (
    <View style={{ alignSelf: 'stretch', gap: 6 }}>
      <ErrorText error={error} />
      <MagnetButton
        label={busy ? 'Reopening…' : `Reopen ${monthName(month)}`}
        icon={{ ios: 'lock.open', android: 'lock_open' }}
        outline
        disabled={busy}
        onPress={async () => {
          if (!(await confirm(`Reopen ${full}?`, `Absences, spends and top-ups dated in ${monthName(month)} can be added and removed again, so shares everyone has already settled up on can change.`, `Reopen ${monthName(month)}`))) return;
          setBusy(true);
          setError(null);
          const { error } = await supabase.rpc('reopen_month', { p_household_id: householdId, p_month: month });
          if (error) setError(sayError(error));
          else await onReopened();
          setBusy(false);
        }}
      />
    </View>
  );
}
