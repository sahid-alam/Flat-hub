/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isDueOn,
  dueDates,
  donePoints,
  fairSharePoints,
  assignees,
  missed,
  offered,
  vouchers,
  rota,
  standing,
  type Duty,
  type ChoreEvent,
  type DutyMark,
} from './duties.ts';
import type { Member, Absence } from './kitty.ts';

const ANCHOR = '2026-10-01';
const mate = (id: string): Member => ({ id, joined_on: '2026-01-01', left_on: null });
const abc = ['a', 'b', 'c'].map(mate);
const six = ['a', 'b', 'c', 'd', 'e', 'f'].map(mate);

const daily = (id: string, effort_points = 1): Duty => ({
  id,
  name: id,
  effort_points,
  every_days: 1,
  weekdays: null,
  schedule: 'rolling',
  fixed_member_id: null,
  active: true,
  group_size: 1,
  plans_meals: false,
  roster: null,
});

let seq = 0;
const ev = (e: Partial<ChoreEvent> & Pick<ChoreEvent, 'duty_id' | 'member_id' | 'outcome' | 'due_on'>): ChoreEvent => ({
  id: `e${String(++seq).padStart(3, '0')}`, // UUIDv7 stands in as an ascending id
  to_member_id: null,
  reverses_id: null,
  points: 1, // the db snapshots the duty's price onto the row; tests that care pass their own
  ...e,
});

/** Who must tick each slot of one instance, in slot order. */
const who = (...args: Parameters<typeof assignees>) => assignees(...args).map((s) => s.holderId);
/** The single holder, for the one-person duties most of these tests use. null = nobody available. */
const one = (...args: Parameters<typeof assignees>) => who(...args)[0] ?? null;

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

// THE RULE CLAUDE.md NAMES: this test must fail if a missed chore earns credit.
test('a missed chore earns no credit, so whoever missed it gets the next turn', () => {
  const d = daily('d1');
  const slots = assignees(d, '2026-10-01', abc, [], [], ANCHOR, [d]);
  assert.deepEqual(slots, [{ ownerId: 'a', holderId: 'a', done: false }]);

  // Nothing is written for a duty nobody did. Past its due date, the slot reads missed — and that
  // is a computation over an EMPTY ledger, not a row.
  assert.equal(missed(slots[0], '2026-10-01', '2026-10-02'), true);
  assert.equal(missed(slots[0], '2026-10-01', '2026-10-01'), false); // still today, still open
  assert.equal(donePoints([], 'a'), 0);
  assert.equal(one(d, '2026-10-02', abc, [], [], ANCHOR, [d]), 'a'); // a is still furthest behind

  // A pre-V3 'skipped' row is still in the ledger and still buys nothing.
  const skipped = [ev({ duty_id: 'd1', member_id: 'a', outcome: 'skipped', due_on: '2026-10-01' })];
  assert.equal(donePoints(skipped, 'a'), 0);
  assert.equal(missed(assignees(d, '2026-10-01', abc, [], skipped, ANCHOR, [d])[0], '2026-10-01', '2026-10-02'), true);
  assert.equal(one(d, '2026-10-02', abc, [], skipped, ANCHOR, [d]), 'a');

  const done = [ev({ duty_id: 'd1', member_id: 'a', outcome: 'done', due_on: '2026-10-01' })];
  assert.equal(donePoints(done, 'a'), 1);
  assert.equal(missed(assignees(d, '2026-10-01', abc, [], done, ANCHOR, [d])[0], '2026-10-01', '2026-10-02'), false);
  assert.equal(one(d, '2026-10-02', abc, [], done, ANCHOR, [d]), 'b'); // credit moves you down the list
});

test('an offer opens the slot and protects nobody: unclaimed, it is missed like any other', () => {
  const d = daily('d1');
  const marks: DutyMark[] = [{ duty_id: 'd1', due_on: '2026-10-01', member_id: 'a', kind: 'offer', by_member_id: 'a' }];
  assert.equal(offered(marks, 'd1', '2026-10-01', 'a'), true);
  assert.equal(offered(marks, 'd1', '2026-10-01', 'b'), false); // you offer YOUR half, not both
  assert.equal(offered([], 'd1', '2026-10-01', 'a'), false);

  // An offer is not a chore_event: the slot is still a's, still open, and nobody has been handed it.
  const slots = assignees(d, '2026-10-01', abc, [], [], ANCHOR, [d]);
  assert.deepEqual(slots, [{ ownerId: 'a', holderId: 'a', done: false }]);
  assert.equal(missed(slots[0], '2026-10-01', '2026-10-02'), true);
  assert.equal(donePoints([], 'a'), 0);
});

test('a claim transfers the slot: the claimer ticks it and earns it, the offerer keeps their place', () => {
  const d = daily('d1');
  const claim = [ev({ duty_id: 'd1', member_id: 'a', outcome: 'swapped', to_member_id: 'b', due_on: '2026-10-01' })];
  assert.deepEqual(assignees(d, '2026-10-01', abc, [], claim, ANCHOR, [d]), [
    { ownerId: 'a', holderId: 'b', done: false },
  ]);
  // Nobody ticked: the slot is missed against b, who took it on — not against a.
  assert.equal(missed(assignees(d, '2026-10-01', abc, [], claim, ANCHOR, [d])[0], '2026-10-01', '2026-10-02'), true);
  assert.equal(donePoints(claim, 'a'), 0);
  assert.equal(donePoints(claim, 'b'), 0);

  const ticked = [...claim, ev({ duty_id: 'd1', member_id: 'b', outcome: 'done', due_on: '2026-10-01' })];
  assert.deepEqual(assignees(d, '2026-10-01', abc, [], ticked, ANCHOR, [d]), [
    { ownerId: 'a', holderId: 'b', done: true },
  ]);
  assert.equal(donePoints(ticked, 'a'), 0);
  assert.equal(donePoints(ticked, 'b'), 1);
  assert.equal(one(d, '2026-10-02', abc, [], ticked, ANCHOR, [d]), 'a'); // a never left the rotation
});

test('anyone can vouch, and a vouch is never points', () => {
  const marks: DutyMark[] = [
    { duty_id: 'd1', due_on: '2026-10-01', member_id: 'a', kind: 'vouch', by_member_id: 'b' },
    { duty_id: 'd1', due_on: '2026-10-01', member_id: 'a', kind: 'vouch', by_member_id: 'c' },
  ];
  assert.deepEqual(vouchers(marks, 'd1', '2026-10-01', 'a'), ['b', 'c']);
  assert.deepEqual(vouchers(marks, 'd1', '2026-10-01', 'b'), []);
  assert.equal(donePoints([], 'a'), 0); // marks are not in the ledger at all
});

// ─── Co-assignment: two people, one duty, the same day ──────────────────────

test('six mates at group_size 2 each get exactly a third of the instances', () => {
  const pair = { ...daily('d1'), group_size: 2 };
  // Six days, each one due, two slots a day: twelve slots, two each — a third of the twelve-day… no:
  // six instances over six days, each mate in exactly two of them = a third of the instances.
  const days = rota([pair], six, [], [], ANCHOR, 6, ANCHOR);
  assert.equal(days.length, 6);
  const count: Record<string, number> = {};
  for (const r of days) {
    assert.equal(r.slots.length, 2); // two mates, together, the same day — never one, never alternating
    assert.notEqual(r.slots[0].holderId, r.slots[1].holderId);
    for (const s of r.slots) count[s.holderId] = (count[s.holderId] ?? 0) + 1;
  }
  assert.deepEqual(count, { a: 2, b: 2, c: 2, d: 2, e: 2, f: 2 }); // 2 of 6 instances each
  // And the first cycle is the roster order the brief names: (a,b) (c,d) (e,f).
  assert.deepEqual(
    days.slice(0, 3).map((r) => r.slots.map((s) => s.holderId).sort().join('+')),
    ['a+b', 'c+d', 'e+f'],
  );
});

test('one partner ticks and the other does not: one earns, one is missed', () => {
  const pair = { ...daily('d1', 2), group_size: 2 };
  const events = [ev({ duty_id: 'd1', member_id: 'a', outcome: 'done', due_on: '2026-10-01', points: 2 })];
  const slots = assignees(pair, '2026-10-01', six, [], events, ANCHOR, [pair]);
  assert.deepEqual(slots, [
    { ownerId: 'a', holderId: 'a', done: true },
    { ownerId: 'b', holderId: 'b', done: false },
  ]);
  assert.equal(donePoints(events, 'a'), 2); // the points are earned individually, not as a pair
  assert.equal(donePoints(events, 'b'), 0);
  assert.equal(missed(slots[0], '2026-10-01', '2026-10-02'), false);
  assert.equal(missed(slots[1], '2026-10-01', '2026-10-02'), true); // missed is per person
});

test('fair share counts every slot a pair duty hands out, or the pair looks permanently behind', () => {
  const pair = { ...daily('d1', 1), group_size: 2 };
  // One day, 1 point, two slots = 2 points handed out, split six ways.
  assert.deepEqual(fairSharePoints([pair], six, [], ANCHOR, ANCHOR, ANCHOR), {
    a: 1 / 3,
    b: 1 / 3,
    c: 1 / 3,
    d: 1 / 3,
    e: 1 / 3,
    f: 1 / 3,
  });
  // A roster of three: only they are billed, and nobody outside it is.
  const rostered = { ...pair, roster: ['a', 'b', 'c'] };
  assert.deepEqual(fairSharePoints([rostered], six, [], ANCHOR, ANCHOR, ANCHOR), {
    a: 2 / 3,
    b: 2 / 3,
    c: 2 / 3,
    d: 0,
    e: 0,
    f: 0,
  });
  // Two of the three away: the duty hands out two lots of points, not three.
  const away2: Absence[] = [{ member_id: 'b', from_date: ANCHOR, to_date: ANCHOR }];
  assert.deepEqual(fairSharePoints([rostered], six, away2, ANCHOR, ANCHOR, ANCHOR).a, 1);
});

test('a roster is who is in, and reordering it changes who is next', () => {
  const pair = { ...daily('d1'), group_size: 2, roster: ['a', 'b', 'c', 'd', 'e', 'f'] };
  // One full cycle: (a,b) (c,d) (e,f). Everyone now holds one point, so the next tie is the roster's.
  const cycle = [
    ev({ duty_id: 'd1', member_id: 'a', outcome: 'done', due_on: '2026-10-01' }),
    ev({ duty_id: 'd1', member_id: 'b', outcome: 'done', due_on: '2026-10-01' }),
    ev({ duty_id: 'd1', member_id: 'c', outcome: 'done', due_on: '2026-10-02' }),
    ev({ duty_id: 'd1', member_id: 'd', outcome: 'done', due_on: '2026-10-02' }),
    ev({ duty_id: 'd1', member_id: 'e', outcome: 'done', due_on: '2026-10-03' }),
    ev({ duty_id: 'd1', member_id: 'f', outcome: 'done', due_on: '2026-10-03' }),
  ];
  assert.deepEqual(who(pair, '2026-10-04', six, [], cycle, ANCHOR, [pair]).sort(), ['a', 'b']);
  // "I can't have that day because of college." Drag c and d to the top. This is the assertion that
  // proves reorder is not a no-op: with least-recently-done still in the sort, a and b would win,
  // because they did it three days ago and c and d two.
  const dragged = { ...pair, roster: ['c', 'd', 'a', 'b', 'e', 'f'] };
  assert.deepEqual(who(dragged, '2026-10-04', six, [], cycle, ANCHOR, [dragged]).sort(), ['c', 'd']);
  // Who's in still wins over order: a mate off the roster is never picked, however far behind.
  const three = { ...pair, roster: ['d', 'e', 'f'] };
  assert.deepEqual(who(three, '2026-10-04', six, [], cycle, ANCHOR, [three]).sort(), ['d', 'e']);
});

test('a pair duty with only one mate available hands out one slot, not two', () => {
  const pair = { ...daily('d1'), group_size: 2, roster: ['a', 'b'] };
  const absences: Absence[] = [{ member_id: 'b', from_date: ANCHOR, to_date: ANCHOR }];
  assert.deepEqual(who(pair, ANCHOR, six, absences, [], ANCHOR, [pair]), ['a']);
  const allAway: Absence[] = ['a', 'b'].map((id) => ({ member_id: id, from_date: ANCHOR, to_date: ANCHOR }));
  assert.deepEqual(who(pair, ANCHOR, six, allAway, [], ANCHOR, [pair]), []);
});

// ─── Carried over from M4: the rules that must not have moved ───────────────

test('an absent mate is not assigned, and nobody available reads an empty slot list', () => {
  const d = daily('d1');
  const absences: Absence[] = [{ member_id: 'a', from_date: '2026-10-01', to_date: '2026-10-01' }];
  assert.equal(one(d, '2026-10-01', abc, absences, [], ANCHOR, [d]), 'b');
  // Back the next day, but NOT handed the day they missed: a owes nothing for 10-01, so b and c,
  // who each carried half of it, are further behind.
  assert.equal(one(d, '2026-10-02', abc, absences, [], ANCHOR, [d]), 'b');
  const allAway: Absence[] = abc.map((m) => ({ member_id: m.id, from_date: '2026-10-01', to_date: '2026-10-03' }));
  assert.equal(one(d, '2026-10-02', abc, allAway, [], ANCHOR, [d]), null);
  assert.equal(one(d, '2026-10-02', [{ id: 'z', joined_on: '2026-11-01', left_on: null }], [], [], ANCHOR, [d]), null);
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
  assert.equal(one(d1, '2026-10-02', ab, [], events, ANCHOR, [d1, d2]), 'b');
  assert.equal(one(d2, '2026-10-02', ab, [], events, ANCHOR, [d1, d2]), 'a');
  // nobody has ever done d3: the id decides
  assert.equal(one(daily('d3'), '2026-10-02', ab, [], events, ANCHOR, [d1, d2]), 'a');
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
  assert.equal(one(light, '2026-10-02', ab, [], events, ANCHOR, [heavy, light]), 'b'); // a carried 3 points
});

test('a fixed duty stays with its mate unless the instance is claimed', () => {
  const fixed: Duty = { ...daily('d1'), schedule: 'fixed', fixed_member_id: 'c' };
  assert.equal(one(fixed, '2026-10-01', abc, [], [], ANCHOR), 'c');
  const claim = [ev({ duty_id: 'd1', member_id: 'c', outcome: 'swapped', to_member_id: 'a', due_on: '2026-10-01' })];
  assert.deepEqual(assignees(fixed, '2026-10-01', abc, [], claim, ANCHOR), [
    { ownerId: 'c', holderId: 'a', done: false },
  ]);
});

test('a reversed done stops counting; a reversed claim hands the slot back', () => {
  const d = daily('d1');
  const done = ev({ duty_id: 'd1', member_id: 'a', outcome: 'done', due_on: '2026-10-01' });
  const undone = [done, ev({ ...done, id: 'e900', reverses_id: done.id })];
  assert.equal(donePoints(undone, 'a'), 0);
  assert.equal(one(d, '2026-10-02', abc, [], undone, ANCHOR, [d]), 'a'); // as if it never happened

  const claim = ev({ duty_id: 'd1', member_id: 'a', outcome: 'swapped', to_member_id: 'b', due_on: '2026-10-01' });
  const unclaimed = [claim, ev({ ...claim, id: 'e901', reverses_id: claim.id })]; // the mirror keeps to_member_id
  assert.equal(one(d, '2026-10-01', abc, [], unclaimed, ANCHOR, [d]), 'a');
});

test('fair share splits the window evenly, and standing is sorted by id with no ranking', () => {
  const duties = [daily('d1'), { ...daily('d2', 2), active: false }];
  // d1 is 1 point a day: 2 points over the window ÷ 3 mates; the retired d2 does not count
  assert.deepEqual(fairSharePoints(duties, abc, [], '2026-10-01', '2026-10-02', ANCHOR), { a: 2 / 3, b: 2 / 3, c: 2 / 3 });
  const events = [ev({ duty_id: 'd1', member_id: 'c', outcome: 'done', due_on: '2026-10-01' })];
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
    ev({ duty_id: 'd1', member_id: 'b', outcome: 'swapped', to_member_id: 'c', due_on: '2026-10-02' }),
  ];
  const run = (d: Duty[], m: Member[], e: ChoreEvent[]) =>
    rota(d, m, absences, e, '2026-10-01', 3, ANCHOR).map(
      (r) => `${r.date} ${r.duty.id} ${r.slots.map((s) => `${s.ownerId}→${s.holderId}${s.done ? ' done' : ''}`).join(',') || '-'}`,
    );
  const expected = run(duties, abc, events);
  assert.deepEqual(run([...duties].reverse(), [...abc].reverse(), [...events].reverse()), expected);
  assert.deepEqual(run(duties, abc, events), expected);
  assert.deepEqual(expected, [
    '2026-10-01 d1 a→a done',
    '2026-10-01 d2 b→b',
    '2026-10-02 d1 b→c', // b offered it, c took it
    // a did d1 on the 1st and c on the 2nd, so on an equal deficit a is the longer ago of the two;
    // the second duty of the day then goes to c, who is the only one still a point behind.
    '2026-10-03 d1 a→a',
    '2026-10-03 d2 c→c', // two duties due the same day go to two different mates
  ]);
});

test('credit is priced on the event, so re-pricing a duty never re-prices past work', () => {
  const d = daily('d1', 1);
  const done = [ev({ duty_id: 'd1', member_id: 'a', outcome: 'done', due_on: '2026-10-01', points: 1 })];
  assert.equal(donePoints(done, 'a'), 1);
  // a edits the duty from 1 point to 10. The event keeps the price it was done at.
  const dear = { ...d, effort_points: 10 };
  assert.equal(donePoints(done, 'a'), 1);
  assert.equal(one(dear, '2026-10-02', abc, [], done, ANCHOR, [dear]), 'b');
});

test('two done rows for one slot pay once', () => {
  const twice = [
    ev({ duty_id: 'd1', member_id: 'a', outcome: 'done', due_on: '2026-10-01' }),
    ev({ duty_id: 'd1', member_id: 'a', outcome: 'done', due_on: '2026-10-01' }), // second tab, fresh id
  ];
  assert.equal(donePoints(twice, 'a'), 1);
  // …but both halves of a pair duty pay, because they are two slots and two mates.
  const both = [
    ev({ duty_id: 'd1', member_id: 'a', outcome: 'done', due_on: '2026-10-01' }),
    ev({ duty_id: 'd1', member_id: 'b', outcome: 'done', due_on: '2026-10-01' }),
  ];
  assert.equal(donePoints(both, 'a'), 1);
  assert.equal(donePoints(both, 'b'), 1);
});

test('a mate who joined mid-window is not billed for the days before they arrived', () => {
  const old = ['a', 'b'].map(mate);
  const joiner: Member = { id: 'c', joined_on: '2026-10-03', left_on: null };
  const fair = fairSharePoints([daily('d1')], [...old, joiner], [], '2026-10-01', '2026-10-04', ANCHOR);
  assert.equal(fair.c, 2 / 3); // only 10-03 and 10-04, a third of a point each
  assert.equal(+fair.a.toFixed(6), +(1 + 2 / 3).toFixed(6));
  // and so the joiner is not handed every duty on arrival
  assert.equal(one(daily('d1'), '2026-10-04', [...old, joiner], [], [], ANCHOR), 'a');
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
  assert.deepEqual(out.map((r) => r.slots[0].holderId), ['a', 'b', 'c']);
});

test('a claim by a mate who is away does not stick', () => {
  const d = daily('d1');
  const absences: Absence[] = [{ member_id: 'b', from_date: '2026-10-05', to_date: '2026-10-20' }];
  const claim = [ev({ duty_id: 'd1', member_id: 'a', outcome: 'swapped', to_member_id: 'b', due_on: '2026-10-06' })];
  // Not b: they physically cannot do it, so the slot stays with the mate who offered it — a owns it
  // whatever the deficit says, because a is the one who offered that slot and nobody took it.
  assert.deepEqual(assignees(d, '2026-10-06', abc, absences, claim, ANCHOR, [d]), [
    { ownerId: 'a', holderId: 'a', done: false },
  ]);
  // The rolling pick is only consulted for slots nobody has touched. a carried the 5th, so the
  // untouched 7th is c's.
  const aDid = [...claim, ev({ duty_id: 'd1', member_id: 'a', outcome: 'done', due_on: '2026-10-05' })];
  assert.equal(one(d, '2026-10-07', abc, absences, aDid, ANCHOR, [d]), 'c');
});

test('ticking a duty never re-shuffles the pair that was on screen', () => {
  const pair = { ...daily('d1'), group_size: 2 };
  const before = assignees(pair, ANCHOR, six, [], [], ANCHOR, [pair]).map((s) => s.ownerId);
  const ticked = [ev({ duty_id: 'd1', member_id: before[0], outcome: 'done', due_on: ANCHOR })];
  const after = assignees(pair, ANCHOR, six, [], ticked, ANCHOR, [pair]).map((s) => s.ownerId);
  assert.deepEqual(after, before);
});
