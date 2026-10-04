// Spending statistics. Pure TypeScript: no React, no Supabase. Read-only views over the same
// rows the kitty maths reads, so every number here must agree with the month statement.
// Months are IST 'YYYY-MM' strings throughout.

import { anchors, istDate, monthBreakdown, pcts, type Books, type Spend } from './kitty.ts';

export type Period = 'this' | 'last' | '3m' | 'all';

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
const monthOf = (iso: string): string => istDate(iso).slice(0, 7);

/** 'YYYY-MM' shifted by d months. */
export const shiftMonth = (month: string, d: number): string => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + d, 1)).toISOString().slice(0, 7);
};

/** The chooser's window, ascending and contiguous (gaps included, so the chart gets a zero bar). */
export function periodMonths(period: Period, nowIso: string, spends: Spend[]): string[] {
  const now = monthOf(nowIso);
  if (period === 'this') return [now];
  if (period === 'last') return [shiftMonth(now, -1)];
  if (period === '3m') return [-2, -1, 0].map((d) => shiftMonth(now, d));
  const anchor = anchors(spends);
  const earliest = spends.map((s) => monthOf(anchor(s).occurred_at)).sort()[0];
  const out: string[] = [];
  for (let m = earliest && earliest < now ? earliest : now; m <= now; m = shiftMonth(m, 1)) out.push(m);
  return out;
}

/**
 * The spends that actually stand in these months. A reversal carries the negated amount, so a
 * reversed spend and its reversal cancel: dropping both pairs nets the same and keeps per-spend
 * views (who paid, biggest spends) honest, which negative rows would not.
 * A reversal is anchored to its target's month, as on the statement.
 */
export function livePeriodSpends<S extends Spend>(spends: S[], months: string[]): S[] {
  const reversed = new Set(spends.map((s) => s.reverses_id));
  const window = new Set(months);
  return spends.filter((s) => !s.reverses_id && !reversed.has(s.id) && window.has(monthOf(s.occurred_at)));
}

/** One total per month of the window, in the window's order: the chart's bars. */
export function monthSeries(spends: Spend[], months: string[]): { month: string; paise: number }[] {
  const live = livePeriodSpends(spends, months);
  return months.map((month) => ({
    month,
    paise: sum(live.filter((s) => monthOf(s.occurred_at) === month).map((s) => s.total_paise)),
  }));
}

/** The hero number. */
export const periodTotal = (spends: Spend[], months: string[]): number =>
  sum(livePeriodSpends(spends, months).map((s) => s.total_paise));

/**
 * Per mate: what they laid out from their own pocket, and how much of the pool they spent.
 * Every id passed comes back, zeros included, in the order given — no ranking here.
 */
export function perMate(
  spends: Spend[],
  memberIds: string[],
  months: string[],
): { member_id: string; ownPocketPaise: number; poolPaise: number }[] {
  const live = livePeriodSpends(spends, months);
  const of = (id: string, from: Spend['paid_from']) =>
    sum(live.filter((s) => s.paid_by === id && s.paid_from === from).map((s) => s.total_paise));
  return memberIds.map((member_id) => ({
    member_id,
    ownPocketPaise: of(member_id, 'personal'),
    poolPaise: of(member_id, 'pool'),
  }));
}

/** The n largest single spends in the window, biggest first. Generic, so the row's extras survive. */
export function biggestSpends<S extends Spend>(spends: S[], months: string[], n: number): S[] {
  return livePeriodSpends(spends, months)
    .sort((a, b) => b.total_paise - a.total_paise || a.id.localeCompare(b.id))
    .slice(0, n);
}

/**
 * monthBreakdown summed over the window, with the percentages recomputed once over the merged
 * groups by kitty.ts's largest-remainder rule (so they still total 100 across months).
 */
export function periodBreakdown(b: Books, months: string[]) {
  const parts = months.map((month) => monthBreakdown(b, month));
  const merge = <K extends string>(rows: ({ paise: number } & Record<K, string>)[], key: K) => {
    const by = new Map<string, number>();
    for (const r of rows) by.set(r[key], (by.get(r[key]) ?? 0) + r.paise);
    return pcts(
      [...by]
        .map(([k, paise]) => ({ [key]: k, paise }) as { paise: number } & Record<K, string>)
        .filter((g) => g.paise !== 0)
        .sort((x, y) => y.paise - x.paise),
    );
  };
  return {
    byCategory: merge(parts.flatMap((p) => p.byCategory), 'category'),
    bySource: merge(parts.flatMap((p) => p.bySource), 'source'),
    fromPool: sum(parts.map((p) => p.fromPool)),
    ownPocket: sum(parts.map((p) => p.ownPocket)),
    total: sum(parts.map((p) => p.total)),
  };
}
