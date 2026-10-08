/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isDueOn,
  dueDates,
  donePoints,
  fairSharePoints,
  assignee,
  rota,
  standing,
  dueToday,
  type Duty,
  type DatedDuty,
  type ChoreEvent,
} from './duties.ts';
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
  points: 1, // the db snapshots the duty's price onto the row; tests that care pass their own
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
  assert.equal(donePoints(skipped, 'a'), 0);
  assert.equal(assignee(d, '2026-10-01', abc, [], skipped, ANCHOR, [d]), 'a'); // the skip was a's instance
  assert.equal(assignee(d, '2026-10-02', abc, [], skipped, ANCHOR, [d]), 'a');

  const done = [ev({ duty_id: 'd1', member_id: 'a', outcome: 'done', due_on: '2026-10-01' })];
  assert.equal(donePoints(done, 'a'), 1);
  assert.equal(assignee(d, '2026-10-01', abc, [], done, ANCHOR, [d]), 'a'); // a settled it; not reassigned
  assert.equal(assignee(d, '2026-10-02', abc, [], done, ANCHOR, [d]), 'b'); // credit moves you down the list
});

test('a swap credits whoever did it; the original assignee keeps their place', () => {
  const d = daily('d1');
  const events = [
    ev({ duty_id: 'd1', member_id: 'a', outcome: 'swapped', to_member_id: 'b', due_on: '2026-10-01' }),
    ev({ duty_id: 'd1', member_id: 'b', outcome: 'done', due_on: '2026-10-01' }),
  ];
  assert.equal(assignee(d, '2026-10-01', abc, [], events, ANCHOR, [d]), 'b');
  assert.equal(donePoints(events, 'a'), 0);
  assert.equal(donePoints(events, 'b'), 1);
  assert.equal(assignee(d, '2026-10-02', abc, [], events, ANCHOR, [d]), 'a'); // a never left the rotation
});

test('an absent mate is not assigned, and nobody available reads null', () => {
  const d = daily('d1');
  const absences: Absence[] = [{ member_id: 'a', from_date: '2026-10-01', to_date: '2026-10-01' }];
  assert.equal(assignee(d, '2026-10-01', abc, absences, [], ANCHOR, [d]), 'b');
  // Back the next day, but NOT handed the day they missed: a owes nothing for 10-01, so b and c,
  // who each carried half of it, are further behind.
  assert.equal(assignee(d, '2026-10-02', abc, absences, [], ANCHOR, [d]), 'b');
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
    ev({ duty_id: 'd-heavy', member_id: 'a', outcome: 'done', due_on: '2026-10-01', points: 3 }),
    ev({ duty_id: 'd-light', member_id: 'b', outcome: 'done', due_on: '2026-10-01' }),
  ];
  assert.equal(donePoints(events, 'a'), 3);
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
  assert.equal(donePoints(undone, 'a'), 0);
  assert.equal(assignee(d, '2026-10-02', abc, [], undone, ANCHOR, [d]), 'a'); // as if it never happened

  const swap = ev({ duty_id: 'd1', member_id: 'a', outcome: 'swapped', to_member_id: 'b', due_on: '2026-10-01' });
  const unswapped = [swap, ev({ ...swap, id: 'e901', reverses_id: swap.id })]; // the mirror keeps to_member_id
  assert.equal(assignee(d, '2026-10-01', abc, [], unswapped, ANCHOR, [d]), 'a');
});

test('fair share splits the window evenly, and standing is sorted by id with no ranking', () => {
  const duties = [daily('d1'), { ...daily('d2', 2), active: false }];
  // d1 is 1 point a day: 2 points over the window ÷ 3 mates; the retired d2 does not count
  assert.deepEqual(fairSharePoints(duties, abc, [], '2026-10-01', '2026-10-02', ANCHOR), { a: 2 / 3, b: 2 / 3, c: 2 / 3 });
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
    '2026-10-03 d1 c null', // two duties due the same day go to two different mates
    '2026-10-03 d2 b null',
  ]);
});

test('credit is priced on the event, so re-pricing a duty never re-prices past work', () => {
  const d = daily('d1', 1);
  const done = [ev({ duty_id: 'd1', member_id: 'a', outcome: 'done', due_on: '2026-10-01', points: 1 })];
  assert.equal(donePoints(done, 'a'), 1);
  // a edits the duty from 1 point to 10. The event keeps the price it was done at.
  assert.equal(donePoints(done, 'a'), 1);
  assert.equal(assignee({ ...d, effort_points: 10 }, '2026-10-02', abc, [], done, ANCHOR, [{ ...d, effort_points: 10 }]), 'b');
});

test('two done rows for one instance pay once', () => {
  const twice = [
    ev({ duty_id: 'd1', member_id: 'a', outcome: 'done', due_on: '2026-10-01' }),
    ev({ duty_id: 'd1', member_id: 'a', outcome: 'done', due_on: '2026-10-01' }), // second tab, fresh id
  ];
  assert.equal(donePoints(twice, 'a'), 1);
});

test('a mate who joined mid-window is not billed for the days before they arrived', () => {
  const old = ['a', 'b'].map(mate);
  const joiner: Member = { id: 'c', joined_on: '2026-10-03', left_on: null };
  const fair = fairSharePoints([daily('d1')], [...old, joiner], [], '2026-10-01', '2026-10-04', ANCHOR);
  assert.equal(fair.c, 2 / 3); // only 10-03 and 10-04, a third of a point each
  assert.equal(+fair.a.toFixed(6), +(1 + 2 / 3).toFixed(6));
  // and so the joiner is not handed every duty on arrival
  assert.equal(assignee(daily('d1'), '2026-10-04', [...old, joiner], [], [], ANCHOR), 'a');
});

test('a mate away all window still appears in the standing, owing nothing', () => {
  const absences: Absence[] = [{ member_id: 'c', from_date: '2026-10-01', to_date: '2026-10-02' }];
  const rows = standing([daily('d1')], abc, absences, [], '2026-10-01', '2026-10-02', ANCHOR);
  assert.deepEqual(rows.map((r) => r.memberId), ['a', 'b', 'c']);
  assert.equal(rows[2].fair, 0);
});

test('three duties due the same day go to three different mates', () => {
  const duties = [daily('d1'), daily('d2'), daily('d3')];
  const out = rota(duties, abc, [], [], '2026-10-01', 1, ANCHOR);
  assert.deepEqual(out.map((r) => r.memberId), ['a', 'b', 'c']);
});

test('a swap to a mate who is away does not stick', () => {
  const d = daily('d1');
  const absences: Absence[] = [{ member_id: 'b', from_date: '2026-10-05', to_date: '2026-10-20' }];
  const swap = [ev({ duty_id: 'd1', member_id: 'a', outcome: 'swapped', to_member_id: 'b', due_on: '2026-10-06' })];
  // Not b: the instance falls back to the rolling pick among the mates who are actually here.
  assert.equal(assignee(d, '2026-10-06', abc, absences, swap, ANCHOR, [d]), 'a');
  const cDid = [...swap, ev({ duty_id: 'd1', member_id: 'a', outcome: 'done', due_on: '2026-10-05' })];
  assert.equal(assignee(d, '2026-10-06', abc, absences, cDid, ANCHOR, [d]), 'c');
});

// ---------------------------------------------------------------- dueToday (notifications #1)

const dated = (id: string, created_at = '2026-10-01T00:00:00Z'): DatedDuty => ({ ...daily(id), created_at });

test('dueToday names one mate per push, with every duty they owe today', () => {
  const duties = [dated('d1'), dated('d2')];
  // Two duties, three mates: a and b each get one, and each is its own recipient.
  assert.deepEqual(dueToday(duties, abc, [], [], '2026-10-01'), [
    { memberId: 'a', dutyNames: ['d1'] },
    { memberId: 'b', dutyNames: ['d2'] },
  ]);
  // One mate, two duties: ONE entry naming both, never two pushes that collapse each other by tag.
  assert.deepEqual(dueToday(duties, [mate('a')], [], [], '2026-10-01'), [{ memberId: 'a', dutyNames: ['d1', 'd2'] }]);
});

test('dueToday drops an instance the moment it is settled — a reminder is never sent for done work', () => {
  const duties = [dated('d1')];
  assert.deepEqual(dueToday(duties, abc, [], [], '2026-10-01'), [{ memberId: 'a', dutyNames: ['d1'] }]);
  for (const outcome of ['done', 'skipped'] as const) {
    const settled = [ev({ duty_id: 'd1', member_id: 'a', outcome, due_on: '2026-10-01' })];
    assert.deepEqual(dueToday(duties, abc, [], settled, '2026-10-01'), [], `${outcome} still earned a reminder`);
  }
  // A swap moves the reminder to whoever took it, and off the mate who handed it over.
  const swapped = [ev({ duty_id: 'd1', member_id: 'a', outcome: 'swapped', to_member_id: 'b', due_on: '2026-10-01' })];
  assert.deepEqual(dueToday(duties, abc, [], swapped, '2026-10-01'), [{ memberId: 'b', dutyNames: ['d1'] }]);
  // Reverse the swap and it is a's turn again: the ledger's reversal rule reaches the notification too.
  const undone = [...swapped, ev({ ...swapped[0], reverses_id: swapped[0].id })];
  assert.deepEqual(dueToday(duties, abc, [], undone, '2026-10-01'), [{ memberId: 'a', dutyNames: ['d1'] }]);
});

test('dueToday agrees with the Duties tab: the anchor comes off created_at, in IST', () => {
  // The tab anchors on the earliest duty's IST creation date (src/ui/duties.tsx). A duty created
  // today is due today; an every-3-days duty is not due on the day after its anchor.
  const every3 = { ...dated('d3'), every_days: 3 };
  assert.deepEqual(dueToday([every3], [mate('a')], [], [], '2026-10-01'), [{ memberId: 'a', dutyNames: ['d3'] }]);
  assert.deepEqual(dueToday([every3], [mate('a')], [], [], '2026-10-02'), []);
  assert.deepEqual(dueToday([every3], [mate('a')], [], [], '2026-10-04'), [{ memberId: 'a', dutyNames: ['d3'] }]);
  // created_at is a timestamptz read at the IST boundary, not UTC: 2026-10-04T19:00:00Z is already
  // the 5th in Kolkata, so a duty created then anchors on the 5th and its every-3 cadence counts
  // 10-05, 10-08 — not the 10-04, 10-07 a UTC reading would give.
  const istBorn = { ...dated('d3', '2026-10-04T19:00:00Z'), every_days: 3 };
  assert.deepEqual(dueToday([istBorn], [mate('a')], [], [], '2026-10-05'), [{ memberId: 'a', dutyNames: ['d3'] }]);
  assert.deepEqual(dueToday([istBorn], [mate('a')], [], [], '2026-10-07'), []);
  // The anchor is the EARLIEST duty's date, shared by all of them — so an older duty in the list
  // shifts a newer one's cadence. That is what the tab does, and the push must not disagree with it.
  assert.deepEqual(dueToday([istBorn, dated('d1')], [mate('a')], [], [], '2026-10-07'), [
    { memberId: 'a', dutyNames: ['d1', 'd3'] },
  ]);
});

test('dueToday skips an away mate and an inactive duty, so neither is nudged', () => {
  const duties = [dated('d1')];
  const absences: Absence[] = [{ member_id: 'a', from_date: '2026-10-01', to_date: '2026-10-03' }];
  assert.deepEqual(dueToday(duties, abc, absences, [], '2026-10-01'), [{ memberId: 'b', dutyNames: ['d1'] }]);
  // Nobody here at all: no recipient, and the cron must send nothing rather than crash.
  assert.deepEqual(dueToday(duties, [mate('a')], absences, [], '2026-10-01'), []);
  assert.deepEqual(dueToday([{ ...dated('d1'), active: false }], abc, [], [], '2026-10-01'), []);
  assert.deepEqual(dueToday([], abc, [], [], '2026-10-01'), []);
});
