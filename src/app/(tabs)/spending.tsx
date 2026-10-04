// Spending: where the flat's money went, read-only. Every figure comes from src/domain/stats.ts,
// which reads the same rows as the month statement through kitty.ts's monthBreakdown — so the
// numbers here and on /statement/[month] cannot drift. Nothing on this screen writes.
import { Stack, router } from 'expo-router';
import { Fragment, useState } from 'react';
import { View } from 'react-native';

import { closableMonths, istDate } from '@/domain/kitty';
import { formatINR } from '@/domain/money';
import {
  biggestSpends,
  livePeriodSpends,
  monthSeries,
  perMate,
  periodBreakdown,
  periodTotal,
  spendingWindow,
  type Period,
} from '@/domain/stats';
import { useHousehold } from '@/lib/books';
import { dayLabel, monthLabel, monthOf, shiftMonth, thisMonth } from '@/lib/util';
import { SOURCE } from '@/ui/activity';
import { Block, Chip, Hero, MonthCard, Rule, Screen, SectionLabel, T, Choice } from '@/ui/kit';
import { CloseMonth } from '@/app/statement';
import { monthName, monthRows, statusFor } from '@/ui/statement';
import { CategoryBars, MonthBars, SplitBar, WhoPaid } from '@/ui/stats';

const PERIODS: { value: Period; label: string }[] = [
  { value: 'this', label: 'This month' },
  { value: 'last', label: 'Last month' },
  { value: '3m', label: '3 months' },
  { value: 'all', label: 'All' },
];
/** The tab bar: 56pt of chrome over a 34pt safe area. */
const TAB_BAR = 56 + 34;

export default function Spending() {
  const { spends, entries, members, books, closes, name, household, isTreasurer, reload } = useHousehold();
  const [period, setPeriod] = useState<Period>('this');
  const nowIso = new Date().toISOString();

  const { months, chartMonths } = spendingWindow(period, nowIso, spends);
  const total = periodTotal(spends, months);
  const series = monthSeries(spends, chartMonths);
  const breakdown = periodBreakdown(books, months);
  const mates = members.filter((m) => !m.left_on);
  const paid = perMate(spends, members.map((m) => m.id), months);
  const biggest = biggestSpends(spends, months, 5);
  const n = livePeriodSpends(spends, months).length;
  const avg = Math.round(series.reduce((a, m) => a + m.paise, 0) / Math.max(1, series.length));
  const label = periodLabel(months);
  // closes === null: the month_close table isn't there yet, so nothing can be closed
  const closable = isTreasurer && closes ? closableMonths(books, closes, nowIso)[0] : undefined;

  return (
    <Screen padBottom={TAB_BAR}>
      <Stack.Screen options={{ title: 'Spending' }} />

      <Choice options={PERIODS} value={period} onChange={setPeriod} />

      <Block tone="stone">
        <SectionLabel>Spent {label}</SectionLabel>
        <Hero paise={total} />
        <T size={15} soft>
          {formatINR(avg)} a month on average
          {chartMonths.length > 1 && ` · ${monthLabel(chartMonths[0])} to ${monthLabel(chartMonths[chartMonths.length - 1])}`}
        </T>
        <T size={15}>
          {total === 0
            ? 'Nothing logged yet'
            : `${n} ${n === 1 ? 'spend' : 'spends'} · ${formatINR(Math.round(total / Math.max(1, mates.length)))} a head`}
        </T>
      </Block>

      <Block>
        <MonthBars series={series} selected={new Set(months)} />
      </Block>

      {total === 0 ? (
        <Block>
          <SectionLabel>Nothing spent {label}</SectionLabel>
          <T size={15} soft>
            The next grocery run will show up here, split by category and by who paid. The bars above keep the
            surrounding months for company.
          </T>
        </Block>
      ) : (
        <>
          <Block>
            <SectionLabel>Where it went</SectionLabel>
            <T size={13} soft>
              by product category
            </T>
            <CategoryBars rows={breakdown.byCategory.map((r) => ({ label: r.category, paise: r.paise, pct: r.pct }))} />
          </Block>

          <Block>
            <SectionLabel>Zepto vs local</SectionLabel>
            <SplitBar
              rows={breakdown.bySource.map((r) => ({
                label: SOURCE[r.source as keyof typeof SOURCE],
                note: r.source === 'other' ? 'other shops, delivery and fees' : undefined,
                paise: r.paise,
                pct: r.pct,
              }))}
            />
          </Block>

          <Block>
            <SectionLabel>Who paid</SectionLabel>
            <WhoPaid
              rows={paid
                .map((p) => ({ ...p, name: name(p.member_id).split(' ')[0] }))
                .filter((p) => p.ownPocketPaise || p.poolPaise || mates.some((m) => m.id === p.member_id))}
            />
          </Block>

          <Block>
            <SectionLabel>Biggest single spends</SectionLabel>
            {biggest.map((s, i) => (
              <Fragment key={s.id}>
                {i > 0 && <Rule />}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 }}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <T size={16} weight="600" numberOfLines={1}>
                      {[SOURCE[s.source], s.store_name].filter(Boolean).join(' · ')}
                    </T>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      {s.paid_from === 'pool' ? <Chip kind="pool" /> : <Chip kind="pending" label="Own pocket" />}
                      <T size={13} soft numberOfLines={1}>
                        {dayLabel(istDate(s.occurred_at))} · {name(s.paid_by).split(' ')[0]}
                      </T>
                    </View>
                  </View>
                  <T size={17} num>
                    {formatINR(s.total_paise)}
                  </T>
                </View>
              </Fragment>
            ))}
          </Block>
        </>
      )}

      {closable && <CloseMonth month={closable} householdId={household.id} onClosed={reload} />}

      <SectionLabel>Statements</SectionLabel>
      <T size={13} soft>
        Every month, newest first. A card opens that month in full.
      </T>
      {archiveMonths(spends.map((s) => s.occurred_at).concat(entries.map((e) => e.occurred_at))).map((month, i) => {
        const { monthSpends, monthEntries, spent } = monthRows(spends, entries, month);
        const n = monthSpends.length + monthEntries.length;
        return (
          <MonthCard
            key={month}
            month={monthName(month)}
            pill={`${formatINR(spent)} · ${n} ${n === 1 ? 'entry' : 'entries'}`}
            status={statusFor(month, closes ?? [])}
            // brass is already spent on the selected bar in the chart, so the cards alternate stone and raised
            tone={i % 2 === 0 ? 'stone' : 'raised'}
            onPress={() => router.push({ pathname: '/statement/[month]', params: { month } })}
          />
        );
      })}
    </Screen>
  );
}

/** 'in October' / 'in September' / 'Aug 2026 to Oct 2026'. */
function periodLabel(months: string[]): string {
  if (months.length === 1) return `in ${monthName(months[0])}`;
  return `${monthLabel(months[0])} to ${monthLabel(months[months.length - 1])}`;
}

/** Every month with something in it, newest first — the same stack as /statement. */
function archiveMonths(timestamps: string[]): string[] {
  const now = thisMonth();
  const first = timestamps.map(monthOf).reduce((a, b) => (b < a ? b : a), now);
  const out: string[] = [];
  for (let m = now; m >= first; m = shiftMonth(m, -1)) out.push(m);
  return out;
}
