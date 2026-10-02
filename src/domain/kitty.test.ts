/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  allocate,
  presenceWeights,
  poolCash,
  credit,
  share,
  shares,
  position,
  toReimburse,
  suggestedTopup,
  linesBalance,
  unreimbursed,
  addedLate,
  type Books,
  type Member,
  type Spend,
  type PoolEntry,
} from './kitty.ts';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
const sept = (id: string): Member => ({ id, joined_on: '2026-01-01', left_on: null });
const contrib = (m: string, amount_paise = 200_000): PoolEntry => ({ kind: 'contribution', member_id: m, amount_paise, reverses_id: null });
const spend = (id: string, total_paise: number, paid_by: string, paid_from: Spend['paid_from'], day = '10'): Spend => ({
  id,
  paid_by,
  paid_from,
  total_paise,
  occurred_at: `2026-09-${day}T06:00:00Z`,
  reverses_id: null,
});

test('allocate: shares sum to the total, ties by lowest id', () => {
  assert.deepEqual(allocate(100, { b: 1, a: 1, c: 1 }), { a: 34, b: 33, c: 33 });
  assert.deepEqual(allocate(-100, { b: 1, a: 1, c: 1 }), { a: -34, b: -33, c: -33 });
  for (const t of [0, 1, 7, 999_999, 1_140_000]) {
    assert.equal(sum(Object.values(allocate(t, { x: 3, y: 7, z: 11 }))), t);
  }
});

test('research worked example is reproduced exactly', () => {
  const b: Books = {
    members: ids.map(sept),
    absences: [
      { member_id: 'a', from_date: '2026-09-05', to_date: '2026-09-14' }, // 10 days
      { member_id: 'b', from_date: '2026-09-20', to_date: '2026-09-21' }, // 2 days: under threshold
    ],
    spends: [spend('s1', 1_140_000, 'a', 'pool')],
    entries: ids.map((m) => contrib(m)),
    monthlyTopupPaise: 200_000,
  };
  assert.deepEqual(presenceWeights('2026-09', b.members, b.absences), { a: 20, b: 30, c: 30, d: 30, e: 30, f: 30 });
  assert.deepEqual(shares(b), { a: 134_118, b: 201_177, c: 201_177, d: 201_176, e: 201_176, f: 201_176 });
  assert.deepEqual(
    ids.map((m) => suggestedTopup(b, m)),
    [134_118, 201_177, 201_177, 201_176, 201_176, 201_176],
  );
  assert.equal(position(b, 'a'), 65_882);
  assert.equal(sum(ids.map((m) => position(b, m))), poolCash(b));
});

test('back-to-back 2-day absences merge into one qualifying 4-day run', () => {
  const absences = [
    { member_id: 'a', from_date: '2026-09-03', to_date: '2026-09-04' },
    { member_id: 'a', from_date: '2026-09-05', to_date: '2026-09-06' },
  ];
  assert.deepEqual(presenceWeights('2026-09', [sept('a'), sept('b')], absences), { a: 26, b: 30 });
});

test('a run spanning two months qualifies in both', () => {
  const absences = [{ member_id: 'a', from_date: '2026-08-31', to_date: '2026-09-02' }]; // 1 day + 2 days
  assert.equal(presenceWeights('2026-09', [sept('a'), sept('b')], absences).a, 28);
  assert.equal(presenceWeights('2026-08', [sept('a'), sept('b')], absences).a, 30);
});

test('a mate who joins mid-month is not absent before joining', () => {
  const late: Member = { id: 'g', joined_on: '2026-09-16', left_on: null };
  assert.deepEqual(presenceWeights('2026-09', [sept('a'), late], []), { a: 30, g: 15 });
  // an absence that started before they joined only counts from the join date
  const away = [{ member_id: 'g', from_date: '2026-09-10', to_date: '2026-09-20' }];
  assert.equal(presenceWeights('2026-09', [sept('a'), late], away).g, 10);
  // left mates and future joiners get no weight that month
  const left: Member = { id: 'h', joined_on: '2026-01-01', left_on: '2026-08-31' };
  assert.deepEqual(presenceWeights('2026-09', [sept('a'), left], []), { a: 30 });
});

test('everyone away all month falls back to membership days', () => {
  const absences = ['a', 'b'].map((m) => ({ member_id: m, from_date: '2026-09-01', to_date: '2026-09-30' }));
  assert.deepEqual(presenceWeights('2026-09', [sept('a'), sept('b')], absences), { a: 30, b: 30 });
});

test('spend lines sum to the spend total (fees add, discounts subtract)', () => {
  const zepto = [
    { line_total_paise: 45_000, kind: 'item' as const },
    { line_total_paise: 12_000, kind: 'item' as const },
    { line_total_paise: 2_500, kind: 'fee' as const },
    { line_total_paise: -5_000, kind: 'discount' as const },
  ];
  assert.ok(linesBalance(54_500, zepto));
  assert.ok(!linesBalance(57_000, zepto));
  assert.ok(linesBalance(3_000, [])); // lines are optional
});

test('a reversal nets to zero and leaves the target untouched', () => {
  const base: Books = {
    members: ids.map(sept),
    absences: [{ member_id: 'c', from_date: '2026-09-01', to_date: '2026-09-09' }],
    spends: [spend('s1', 50_000, 'a', 'pool')],
    entries: ids.map((m) => contrib(m)),
    monthlyTopupPaise: 200_000,
  };
  const target = { ...base.spends[0] };
  // reversal entered next month, still allocated in the target's month
  const rev: Spend = { ...target, id: 's1r', total_paise: -50_000, occurred_at: '2026-10-03T06:00:00Z', reverses_id: 's1' };
  const after: Books = { ...base, spends: [...base.spends, rev] };
  assert.deepEqual(base.spends[0], target);
  for (const m of ids) assert.equal(share(after, m), 0);
  assert.equal(poolCash(after), 1_200_000);

  const entryRev: Books = { ...base, entries: [...base.entries, { ...contrib('b'), amount_paise: -200_000, reverses_id: 'x' }] };
  assert.equal(credit(entryRev, 'b'), 0);
});

test('kitty identity Σ position = poolCash on a realistic month', () => {
  const b: Books = {
    members: ids.map(sept),
    // f went home for 6 days; b logged a 2-day trip that doesn't count
    absences: [
      { member_id: 'f', from_date: '2026-09-12', to_date: '2026-09-17' },
      { member_id: 'b', from_date: '2026-09-25', to_date: '2026-09-26' },
    ],
    spends: [
      spend('z1', 186_450, 'a', 'pool', '02'), // Zepto, Ansh paid from pool
      spend('z2', 74_399, 'c', 'personal', '08'), // Zepto, c paid from own pocket
      spend('z3', 92_310, 'a', 'pool', '19'),
      spend('l1', 6_000, 'd', 'personal', '03'), // dahi + milk, local
      spend('l2', 5_500, 'e', 'pool', '11'),
      spend('l3', 3_300, 'b', 'personal', '22'),
      spend('l4', 4_200, 'b', 'personal', '23'),
      { ...spend('l4r', -4_200, 'b', 'personal', '24'), reverses_id: 'l4' }, // entered twice by mistake
    ],
    entries: [
      ...ids.map((m) => contrib(m)),
      { kind: 'reimbursement', member_id: 'c', amount_paise: 74_399, reverses_id: null },
    ],
    monthlyTopupPaise: 200_000,
  };
  const totalSpend = sum(b.spends.map((s) => s.total_paise));
  assert.equal(sum(Object.values(shares(b))), totalSpend);
  assert.equal(sum(ids.map((m) => position(b, m))), poolCash(b));
  assert.equal(poolCash(b), 1_200_000 - 186_450 - 92_310 - 5_500 - 74_399);
  assert.equal(toReimburse(b, 'c'), 0);
  assert.equal(toReimburse(b, 'd'), 6_000);
  assert.equal(toReimburse(b, 'b'), 3_300);
  assert.ok(share(b, 'f') < share(b, 'b')); // the absent mate carries less
});

test('added late = logged after the absence started (IST date)', () => {
  const a = { member_id: 'a', from_date: '2026-09-10', to_date: '2026-09-14' };
  assert.ok(!addedLate({ ...a, created_at: '2026-09-09T20:00:00Z' })); // 10 Sep 01:30 IST: same day, on time
  assert.ok(addedLate({ ...a, created_at: '2026-09-10T20:00:00Z' })); // 11 Sep IST
});

test('unreimbursed lists own-pocket spends until paid back', () => {
  const spends = [spend('p1', 3_000, 'b', 'personal'), spend('p2', 4_500, 'b', 'personal'), spend('q', 9_000, 'a', 'pool')];
  const paidP1: PoolEntry = { kind: 'reimbursement', member_id: 'b', amount_paise: 3_000, reverses_id: null, spend_id: 'p1' };
  const b: Books = { members: ids.map(sept), absences: [], spends, entries: [paidP1], monthlyTopupPaise: 200_000 };
  assert.deepEqual(unreimbursed(spends, b.entries).map((s) => s.id), ['p2']);
  assert.equal(toReimburse(b, 'b'), sum(unreimbursed(spends, b.entries).map((s) => s.total_paise)));
  // reversing the reimbursement puts p1 back on the list
  const undo: PoolEntry = { ...paidP1, amount_paise: -3_000, reverses_id: 'x' };
  assert.deepEqual(unreimbursed(spends, [paidP1, undo]).map((s) => s.id), ['p1', 'p2']);
  // reversing the spend itself takes it off
  const gone = [...spends, { ...spends[1], id: 'p2r', total_paise: -4_500, reverses_id: 'p2' }];
  assert.deepEqual(unreimbursed(gone, [paidP1]).map((s) => s.id), []);
});
