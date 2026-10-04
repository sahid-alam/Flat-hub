/// <reference types="node" />
// The Spending screen's two windows: the figures' months and the chart's months.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Spend } from './kitty.ts';
import { spendingWindow } from './stats.ts';

const spend = (id: string, occurred_at: string): Spend => ({
  id,
  paid_by: 'a',
  paid_from: 'pool',
  total_paise: 10_000,
  occurred_at,
  reverses_id: null,
});

const NOW = '2026-10-04T06:00:00Z'; // 2026-10 in IST
const YEAR = ['2026-02', '2026-05', '2026-10'].map((m, i) => spend(String(i), `${m}-10T06:00:00Z`));

test('one selected month still gets five months of company', () => {
  const { months, chartMonths } = spendingWindow('this', NOW, YEAR);
  assert.deepEqual(months, ['2026-10']);
  assert.deepEqual(chartMonths, ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
  // every counted month is drawn, so the brass bars are always in the strip
  assert.ok(months.every((m) => chartMonths.includes(m)));
});

test('the chart reaches back to a period the spends do not cover', () => {
  const { months, chartMonths } = spendingWindow('3m', NOW, [spend('x', '2026-10-01T06:00:00Z')]);
  assert.deepEqual(months, ['2026-08', '2026-09', '2026-10']);
  assert.deepEqual(chartMonths, months);
});

test('all draws every month since the first spend', () => {
  const { months, chartMonths } = spendingWindow('all', NOW, YEAR);
  assert.equal(months[0], '2026-02');
  assert.equal(months.at(-1), '2026-10');
  assert.deepEqual(chartMonths, months);
});
