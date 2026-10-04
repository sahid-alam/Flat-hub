/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDueOn, dueDates, donePoints, fairSharePoints, assignee, rota, standing, type Duty, type ChoreEvent } from './duties.ts';
import type { Member, Absence } from './kitty.ts';

const ANCHOR = '2026-10-01';
const mate = (id: string): Member => ({ id, joined_on: '2026-01-01', left_on: null });
const abc = ['a', 'b', 'c'].map(mate);

const daily = (id: string, effort_points = 1): Duty => ({
  id,
  name: id,
  effort_points,
  every_days: 1,
  weekdays: null,
  schedule: 'rolling',
  fixed_member_id: null,
  active: true,
});

let seq = 0;
const ev = (e: Partial<ChoreEvent> & Pick<ChoreEvent, 'duty_id' | 'member_id' | 'outcome' | 'due_on'>): ChoreEvent => ({
  id: `e${String(++seq).padStart(3, '0')}`, // UUIDv7 stands in as an ascending id
  to_member_id: null,
  reverses_id: null,
  ...e,
});

test('cadences produce the right dates, and nothing is due before the anchor', () => {
  assert.deepEqual(dueDates({ ...daily('d'), every_days: 3 }, '2026-10-01', '2026-10-10', ANCHOR), [
    '2026-10-01',
    '2026-10-04',
    '2026-10-07',
    '2026-10-10',
  ]);
  // 0 = Sunday … 4 = Thursday
  assert.deepEqual(dueDates({ ...daily('d'), every_days: null, weekdays: [0, 4] }, '2026-10-01', '2026-10-08', ANCHOR), [
    '2026-10-01',
    '2026-10-04',
    '2026-10-08',
  ]);
  assert.equal(isDueOn(daily('d'), '2026-09-30', ANCHOR), false);
  assert.equal(isDueOn({ ...daily('d'), every_days: null, weekdays: [3] }, '2026-09-30', ANCHOR), false); // a Wednesday
});

test('a skip earns no credit, so the skipper gets the next turn', () => {
  const d = daily('d1');
  assert.equal(assignee(d, '2026-10-01', abc, [], [], ANCHOR, [d]), 'a');

  const skipped = [ev({ duty_id: 'd1', member_id: 'a', outcome: 'skipped', due_on: '2026-10-01' })];
  assert.equal(donePoints(skipped, 'a', [d]), 0);
  assert.equal(assignee(d, '2026-10-02', abc, [], skipped, ANCHOR, [d]), 'a');

  const done = [ev({ duty_id: 'd1', member_id: 'a', outcome: 'done', due_on: '2026-10-01' })];
  assert.equal(donePoints(done, 'a', [d]), 1);
  assert.equal(assignee(d, '2026-10-02', abc, [], done, ANCHOR, [d]), 'b'); // credit moves you down the list
});

test('a swap credits whoever did it; the original assignee keeps their place', () => {
  const d = daily('d1');
  const events = [
    ev({ duty_id: 'd1', member_id: 'a', outcome: 'swapped', to_member_id: 'b', due_on: '2026-10-01' }),
    ev({ duty_id: 'd1', member_id: 'b', outcome: 'done', due_on: '2026-10-01' }),
  ];
  assert.equal(assignee(d, '2026-10-01', abc, [], events, ANCHOR, [d]), 'b');
  assert.equal(donePoints(events, 'a', [d]), 0);
  assert.equal(donePoints(events, 'b', [d]), 1);
  assert.equal(assignee(d, '2026-10-02', abc, [], events, ANCHOR, [d]), 'a'); // a never left the rotation
});

test('an absent mate is not assigned, and nobody available reads null', () => {
  const d = daily('d1');
  const absences: Absence[] = [{ member_id: 'a', from_date: '2026-10-01', to_date: '2026-10-01' }];
  assert.equal(assignee(d, '2026-10-01', abc, absences, [], ANCHOR, [d]), 'b');
  assert.equal(assignee(d, '2026-10-02', abc, absences, [], ANCHOR, [d]), 'a'); // back the next day
  const allAway: Absence[] = abc.map((m) => ({ member_id: m.id, from_date: '2026-10-01', to_date: '2026-10-03' }));
  assert.equal(assignee(d, '2026-10-02', abc, allAway, [], ANCHOR, [d]), null);
  assert.equal(assignee(d, '2026-10-02', [{ id: 'z', joined_on: '2026-11-01', left_on: null }], [], [], ANCHOR, [d]), null);
});

test('ties break by least-recently-done, then by id', () => {
  const d1 = daily('d1');
  const d2 = daily('d2');
  const ab = [mate('a'), mate('b')];
  const events = [
    ev({ duty_id: 'd1', member_id: 'a', outcome: 'done', due_on: '2026-10-01' }),
    ev({ duty_id: 'd2', member_id: 'b', outcome: 'done', due_on: '2026-10-01' }),
  ];
  // equal deficit (one point each), but a did d1 most recently
  assert.equal(assignee(d1, '2026-10-02', ab, [], events, ANCHOR, [d1, d2]), 'b');
  assert.equal(assignee(d2, '2026-10-02', ab, [], events, ANCHOR, [d1, d2]), 'a');
  // nobody has ever done d3: the id decides
  assert.equal(assignee(daily('d3'), '2026-10-02', ab, [], events, ANCHOR, [d1, d2]), 'a');
});

test('effort points decide the deficit across duties', () => {
  const heavy = daily('d-heavy', 3);
  const light = daily('d-light', 1);
  const ab = [mate('a'), mate('b')];
  const events = [
    ev({ duty_id: 'd-heavy', member_id: 'a', outcome: 'done', due_on: '2026-10-01' }),
    ev({ duty_id: 'd-light', member_id: 'b', outcome: 'done', due_on: '2026-10-01' }),
  ];
  assert.equal(donePoints(events, 'a', [heavy, light]), 3);
  assert.equal(assignee(light, '2026-10-02', ab, [], events, ANCHOR, [heavy, light]), 'b'); // a carried 3 points
});

test('a fixed duty stays with its mate unless the instance is swapped', () => {
  const fixed: Duty = { ...daily('d1'), schedule: 'fixed', fixed_member_id: 'c' };
  assert.equal(assignee(fixed, '2026-10-01', abc, [], [], ANCHOR), 'c');
  const swap = [ev({ duty_id: 'd1', member_id: 'c', outcome: 'swapped', to_member_id: 'a', due_on: '2026-10-01' })];
  assert.equal(assignee(fixed, '2026-10-01', abc, [], swap, ANCHOR), 'a');
});

test('a reversed done stops counting; a reversed swap hands the instance back', () => {
  const d = daily('d1');
  const done = ev({ duty_id: 'd1', member_id: 'a', outcome: 'done', due_on: '2026-10-01' });
  const undone = [done, ev({ ...done, id: 'e900', reverses_id: done.id })];
  assert.equal(donePoints(undone, 'a', [d]), 0);
  assert.equal(assignee(d, '2026-10-02', abc, [], undone, ANCHOR, [d]), 'a'); // as if it never happened

  const swap = ev({ duty_id: 'd1', member_id: 'a', outcome: 'swapped', to_member_id: 'b', due_on: '2026-10-01' });
  const unswapped = [swap, ev({ ...swap, id: 'e901', reverses_id: swap.id })]; // the mirror keeps to_member_id
  assert.equal(assignee(d, '2026-10-01', abc, [], unswapped, ANCHOR, [d]), 'a');
});

test('fair share splits the window evenly, and standing is sorted by id with no ranking', () => {
  const duties = [daily('d1'), { ...daily('d2', 2), active: false }];
  // d1 is 1 point a day: 2 points over the window ÷ 3 mates; the retired d2 does not count
  assert.deepEqual(fairSharePoints(duties, abc, '2026-10-01', '2026-10-02', ANCHOR), { a: 2 / 3, b: 2 / 3, c: 2 / 3 });
  const events = [
    ev({ duty_id: 'd1', member_id: 'c', outcome: 'done', due_on: '2026-10-01' }),
    ev({ duty_id: 'd1', member_id: 'b', outcome: 'skipped', due_on: '2026-10-02' }),
  ];
  const rows = standing(duties, abc, [], events, '2026-10-01', '2026-10-02', ANCHOR);
  assert.deepEqual(
    rows.map((r) => r.memberId),
    ['a', 'b', 'c'],
  ); // c did the most and is still last: not a leaderboard
  assert.deepEqual(
    rows.map((r) => r.done),
    [0, 0, 1],
  );
});

test('the rota is deterministic: shuffling the inputs changes nothing', () => {
  const duties = [daily('d1'), { ...daily('d2', 2), every_days: 2 }];
  const absences: Absence[] = [{ member_id: 'b', from_date: '2026-10-02', to_date: '2026-10-02' }];
  const events = [
    ev({ duty_id: 'd1', member_id: 'a', outcome: 'done', due_on: '2026-10-01' }),
    ev({ duty_id: 'd2', member_id: 'b', outcome: 'skipped', due_on: '2026-10-01' }),
    ev({ duty_id: 'd1', member_id: 'b', outcome: 'swapped', to_member_id: 'c', due_on: '2026-10-02' }),
  ];
  const run = (d: Duty[], m: Member[], e: ChoreEvent[]) =>
    rota(d, m, absences, e, '2026-10-01', 3, ANCHOR).map((r) => `${r.date} ${r.duty.id} ${r.memberId} ${r.outcome}`);
  const expected = run(duties, abc, events);
  assert.deepEqual(run([...duties].reverse(), [...abc].reverse(), [...events].reverse()), expected);
  assert.deepEqual(run(duties, abc, events), expected);
  assert.deepEqual(expected, [
    '2026-10-01 d1 a done',
    '2026-10-01 d2 b skipped',
    '2026-10-02 d1 c swapped', // b swapped it to c
    '2026-10-03 d1 b null',
    '2026-10-03 d2 b null',
  ]);
});
