/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { monthBreakdown, type Books, type Member, type Spend } from './kitty.ts';
import {
  biggestSpends,
  monthSeries,
  perMate,
  periodBreakdown,
  periodMonths,
  periodTotal,
  shiftMonth,
} from './stats.ts';

const mate = (id: string): Member => ({ id, joined_on: '2025-01-01', left_on: null });
const spend = (
  id: string,
  total_paise: number,
  occurred_at: string,
  paid_by = 'a',
  paid_from: Spend['paid_from'] = 'pool',
  reverses_id: string | null = null,
): Spend => ({ id, paid_by, paid_from, total_paise, occurred_at, reverses_id });

const books = (spends: Spend[], extra: Partial<Books> = {}): Books => ({
  members: ['a', 'b', 'c'].map(mate),
  absences: [],
  spends,
  entries: [],
  monthlyTopupPaise: 200_000,
  ...extra,
});

const NOW = '2026-10-04T06:00:00Z'; // 2026-10 in IST

test('period windows are IST months, ascending and contiguous', () => {
  assert.deepEqual(periodMonths('this', NOW, []), ['2026-10']);
  assert.deepEqual(periodMonths('last', NOW, []), ['2026-09']);
  assert.deepEqual(periodMonths('3m', NOW, []), ['2026-08', '2026-09', '2026-10']);
  // IST: 19:00 UTC on the last of the month is already the first of the next
  assert.deepEqual(periodMonths('this', '2026-09-30T19:00:00Z', []), ['2026-10']);
  // a year boundary, and the gap month with no spends is still in the window
  assert.deepEqual(periodMonths('3m', '2026-01-10T06:00:00Z', []), ['2025-11', '2025-12', '2026-01']);
  assert.deepEqual(shiftMonth('2026-01', -1), '2025-12');
  assert.deepEqual(shiftMonth('2025-12', 1), '2026-01');
  // 'all' runs from the earliest spend to the current month
  assert.deepEqual(periodMonths('all', '2026-01-10T06:00:00Z', [spend('s1', 100, '2025-11-05T06:00:00Z')]), [
    '2025-11',
    '2025-12',
    '2026-01',
  ]);
  assert.deepEqual(periodMonths('all', NOW, []), ['2026-10']); // no spends at all
});

test('month series: one bar per window month, zero where nothing happened', () => {
  const spends = [spend('s1', 50_000, '2026-08-10T06:00:00Z'), spend('s2', 30_000, '2026-10-01T06:00:00Z'), spend('s3', 1_000, '2026-10-02T06:00:00Z')];
  assert.deepEqual(monthSeries(spends, periodMonths('3m', NOW, spends)), [
    { month: '2026-08', paise: 50_000 },
    { month: '2026-09', paise: 0 },
    { month: '2026-10', paise: 31_000 },
  ]);
  assert.equal(periodTotal(spends, ['2026-09']), 0); // empty period
  // totals cross a year boundary, not just the labels
  const across = [spend('d1', 70_000, '2025-12-28T06:00:00Z'), spend('d2', 25_000, '2026-01-02T06:00:00Z')];
  assert.deepEqual(monthSeries(across, periodMonths('3m', '2026-01-10T06:00:00Z', across)), [
    { month: '2025-11', paise: 0 },
    { month: '2025-12', paise: 70_000 },
    { month: '2026-01', paise: 25_000 },
  ]);
  assert.deepEqual(monthSeries([], ['2026-10']), [{ month: '2026-10', paise: 0 }]);
});

test('a reversal nets out of the series, in its target’s month, and agrees with the statement', () => {
  const target = spend('s1', 50_000, '2026-09-10T06:00:00Z');
  // the reversal lands a month later and carries the negated amount
  const rev = spend('r1', -50_000, '2026-10-02T06:00:00Z', 'a', 'pool', 's1');
  const other = spend('s2', 20_000, '2026-09-12T06:00:00Z');
  const spends = [target, rev, other];
  const months = ['2026-09', '2026-10'];
  assert.deepEqual(monthSeries(spends, months), [
    { month: '2026-09', paise: 20_000 },
    { month: '2026-10', paise: 0 },
  ]);
  // the hero number and the month statement must say the same thing
  const b = books(spends);
  for (const m of months) {
    assert.equal(periodTotal(spends, [m]), monthBreakdown(b, m).total);
  }
  assert.equal(periodTotal(spends, months), 20_000);
  // fully reversed month: both read zero
  const only = [spend('s3', 9_000, '2026-09-03T06:00:00Z'), spend('r3', -9_000, '2026-09-04T06:00:00Z', 'a', 'pool', 's3')];
  assert.equal(periodTotal(only, ['2026-09']), 0);
  assert.equal(monthBreakdown(books(only), '2026-09').total, 0);
});

test('who paid: every mate in the order given, reversed spends ignored', () => {
  const spends = [
    spend('s1', 40_000, '2026-10-01T06:00:00Z', 'a', 'personal'),
    spend('s2', 15_000, '2026-10-02T06:00:00Z', 'a', 'pool'),
    spend('s3', 70_000, '2026-10-03T06:00:00Z', 'b', 'personal'),
    spend('r3', -70_000, '2026-10-04T06:00:00Z', 'b', 'personal', 's3'),
    spend('s4', 5_000, '2026-09-30T06:00:00Z', 'c', 'pool'), // outside the window
  ];
  assert.deepEqual(perMate(spends, ['a', 'b', 'c'], ['2026-10']), [
    { member_id: 'a', ownPocketPaise: 40_000, poolPaise: 15_000 },
    { member_id: 'b', ownPocketPaise: 0, poolPaise: 0 },
    { member_id: 'c', ownPocketPaise: 0, poolPaise: 0 },
  ]);
  assert.deepEqual(perMate([], ['a'], ['2026-10']), [{ member_id: 'a', ownPocketPaise: 0, poolPaise: 0 }]);
});

test('biggest spends: top N in the window, reversed pairs dropped', () => {
  const spends = [
    spend('s1', 10_000, '2026-10-01T06:00:00Z'),
    spend('s2', 90_000, '2026-10-02T06:00:00Z'),
    spend('r2', -90_000, '2026-10-02T06:00:00Z', 'a', 'pool', 's2'),
    spend('s3', 30_000, '2026-10-03T06:00:00Z'),
    spend('s4', 20_000, '2026-09-03T06:00:00Z'),
  ];
  assert.deepEqual(biggestSpends(spends, ['2026-10'], 5).map((s) => s.id), ['s3', 's1']);
  assert.deepEqual(biggestSpends(spends, ['2026-09', '2026-10'], 2).map((s) => s.id), ['s3', 's4']);
  assert.deepEqual(biggestSpends(spends, ['2026-07'], 5), []);
  // generic: the row's own fields survive
  const rows = [{ ...spend('s9', 1, '2026-10-01T06:00:00Z'), store_name: 'Zepto' }];
  assert.equal(biggestSpends(rows, ['2026-10'], 1)[0].store_name, 'Zepto');
});

test('period breakdown: categories merge across months and the percentages still total 100', () => {
  const spends = [
    { ...spend('s1', 60_000, '2026-09-10T06:00:00Z'), source: 'zepto' as const },
    { ...spend('s2', 40_000, '2026-10-10T06:00:00Z'), source: 'local' as const },
  ];
  const b = books(spends, {
    products: [
      { id: 'p1', category: 'Veg' },
      { id: 'p2', category: 'Dairy' },
    ],
    lines: [
      { spend_id: 's1', product_id: 'p1', line_total_paise: 50_000 },
      { spend_id: 's1', product_id: 'p2', line_total_paise: 10_000 },
      { spend_id: 's2', product_id: 'p1', line_total_paise: 40_000 },
    ],
  });
  const got = periodBreakdown(b, ['2026-09', '2026-10']);
  assert.equal(got.total, 100_000);
  assert.deepEqual(
    got.byCategory.map((c) => [c.category, c.paise, c.pct]),
    [
      ['Veg', 90_000, 90],
      ['Dairy', 10_000, 10],
    ],
  );
  assert.deepEqual(
    got.bySource.map((s) => [s.source, s.pct]),
    [
      ['zepto', 60],
      ['local', 40],
    ],
  );
  assert.equal(got.fromPool, 100_000);
  assert.equal(got.ownPocket, 0);
  // a single month must read exactly as the month statement does
  assert.deepEqual(periodBreakdown(b, ['2026-09']), monthBreakdown(b, '2026-09'));
  // ...including when local is the bigger source: the percentages come out of a largest-remainder
  // rule that breaks ties by position, so re-sorting the sources by size changed the integers and
  // Spending and the statement printed two different Zepto shares for the same month.
  const lopsided = books([
    { ...spend('z', 300_000, '2026-09-04T06:00:00Z'), source: 'zepto' as const },
    { ...spend('l', 500_000, '2026-09-05T06:00:00Z'), source: 'local' as const },
  ]);
  assert.deepEqual(periodBreakdown(lopsided, ['2026-09']).bySource, monthBreakdown(lopsided, '2026-09').bySource);
  // empty period
  assert.deepEqual(periodBreakdown(books([]), ['2026-07']), {
    byCategory: [],
    bySource: [],
    fromPool: 0,
    ownPocket: 0,
    total: 0,
  });
});
