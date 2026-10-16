/// <reference types="node" />
// Turn rules (20261017120000): strict order, and what a missed turn costs. Each rule has its case,
// and so do the two ways a debt could be wiped: a reorder, and switching the penalty off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignees, donePoints, missed, owedTurns, rota, type ChoreEvent, type Duty, type DutyRule } from './duties.ts';
import type { Absence, Member } from './kitty.ts';

const ANCHOR = '2026-10-01'; // a Thursday
const mate = (id: string): Member => ({ id, joined_on: '2026-01-01', left_on: null });
const six = ['a', 'b', 'c', 'd', 'e', 'f'].map(mate);

const rule = (roster: string[], on_miss: DutyRule['on_miss'] = 'makeup', starts_on = ANCHOR, created_at = '1'): DutyRule => ({
  starts_on,
  turns: 'order',
  on_miss,
  roster,
  created_at,
});
const ordered = (rules: DutyRule[], extra: Partial<Duty> = {}): Duty => ({
  id: 'g',
  name: 'Garbage',
  effort_points: 3,
  every_days: 1,
  weekdays: null,
  schedule: 'rolling',
  fixed_member_id: null,
  active: true,
  group_size: 1,
  plans_meals: false,
  roster: rules[rules.length - 1].roster,
  rules,
  ...extra,
});

let seq = 0;
const done = (who: string, due_on: string, duty_id = 'g'): ChoreEvent => ({
  id: `e${String(++seq).padStart(3, '0')}`,
  duty_id,
  member_id: who,
  outcome: 'done',
  to_member_id: null,
  due_on,
  reverses_id: null,
  points: 3,
});

/** Who holds each day, `*` marking a make-up turn. */
const line = (d: Duty, events: ChoreEvent[], from: string, days: number, today: string, absences: Absence[] = []) =>
  rota([d], six, absences, events, from, days, ANCHOR, today).map((r) =>
    r.slots.map((s) => s.holderId + (s.makeup ? '*' : '')).join('+'),
  );
const owed = (d: Duty, events: ChoreEvent[], today: string) => Object.fromEntries(owedTurns(d, six, [], events, ANCHOR, today));

test('strict order: straight down the list, whatever the points say', () => {
  // `a` has done far more than anyone on another duty; under the points pick that pushes `a` last.
  const busy = [done('a', '2026-09-28', 'x'), done('a', '2026-09-29', 'x'), done('a', '2026-09-30', 'x')];
  assert.deepEqual(line(ordered([rule(['c', 'a', 'b'])]), busy, ANCHOR, 6, ANCHOR), ['c', 'a', 'b', 'c', 'a', 'b']);
});

test('a mate who is away is passed over for that turn and owes nothing for it', () => {
  const d = ordered([rule(['c', 'a', 'b'])]);
  const away: Absence[] = [{ member_id: 'b', from_date: '2026-10-03', to_date: '2026-10-03' }];
  assert.deepEqual(line(d, [], ANCHOR, 4, ANCHOR, away), ['c', 'a', 'c', 'a']);
  // Nothing was ticked, so c and a owe for the days they missed; b, passed over, owes nothing.
  assert.equal(owedTurns(d, six, away, [], ANCHOR, '2026-10-05').has('b'), false);
});

test('a pair duty takes the next two in order', () => {
  assert.deepEqual(line(ordered([rule(['a', 'b', 'c', 'd'])], { group_size: 2 }), [], ANCHOR, 3, ANCHOR), [
    'a+b',
    'c+d',
    'a+b',
  ]);
});

// CLAUDE.md's rule, under the new engine: a missed turn earns no credit, and here it also costs a turn.
test('make-up: the list moves on, and the misser owes one turn straight after their NEXT regular turn', () => {
  const d = ordered([rule(['a', 'b', 'c'])]);
  const today = '2026-10-02';
  const [first] = assignees(d, ANCHOR, six, [], [], ANCHOR, [d], today);
  assert.equal(missed(first, ANCHOR, today), true);
  assert.equal(donePoints([], 'a'), 0, 'a missed turn earns no credit');
  // Not tomorrow (that is 'redo'): b and c are up first, then a's own turn, then the make-up.
  assert.deepEqual(line(d, [], ANCHOR, 6, today), ['a', 'b', 'c', 'a', 'a*', 'b']);
  assert.deepEqual(owed(d, [], today), { a: 1 });
});

test('make-up: a missed make-up is owed again, and only one is served per regular turn', () => {
  const d = ordered([rule(['a', 'b', 'c'])]);
  // a misses the 1st, does the 4th, misses the make-up on the 5th; everyone else does theirs.
  const events = [done('b', '2026-10-02'), done('c', '2026-10-03'), done('a', '2026-10-04'), done('b', '2026-10-06'), done('c', '2026-10-07')];
  assert.deepEqual(owed(d, events, '2026-10-08'), { a: 1 });
  assert.deepEqual(line(d, events, '2026-10-08', 3, '2026-10-08'), ['a', 'a*', 'b']);
});

test('redo: the misser takes the very next due day, then the list carries on', () => {
  const d = ordered([rule(['a', 'b', 'c'], 'redo')]);
  assert.deepEqual(line(d, [], ANCHOR, 5, '2026-10-02'), ['a', 'a*', 'b', 'c', 'a']);
});

test('none: the list moves on and nothing more is owed', () => {
  const d = ordered([rule(['a', 'b', 'c'], 'none')]);
  assert.deepEqual(line(d, [], ANCHOR, 5, '2026-10-02'), ['a', 'b', 'c', 'a', 'b']);
  assert.deepEqual(owed(d, [], '2026-10-02'), {});
});

test('a reorder starts tomorrow at the top of the new list, and re-decides nothing already past', () => {
  const before = ordered([rule(['a', 'b', 'c'])]);
  const after = ordered([rule(['a', 'b', 'c']), rule(['c', 'b', 'a'], 'makeup', '2026-10-04', '2')]);
  const events = [done('b', '2026-10-02'), done('c', '2026-10-03')];
  // The 1st was a's and a missed it — under either history.
  for (const d of [before, after]) {
    assert.equal(assignees(d, ANCHOR, six, [], events, ANCHOR, [d], '2026-10-04')[0].holderId, 'a');
    assert.deepEqual(owed(d, events, '2026-10-04'), { a: 1 }, 'the debt survives the reorder');
  }
  assert.deepEqual(line(after, events, '2026-10-04', 4, '2026-10-04'), ['c', 'b', 'a', 'a*']);
});

test('switching the penalty to none never forgives a make-up already owed', () => {
  const d = ordered([rule(['a', 'b', 'c']), rule(['a', 'b', 'c'], 'none', '2026-10-04', '2')]);
  const events = [done('b', '2026-10-02'), done('c', '2026-10-03')];
  assert.deepEqual(owed(d, events, '2026-10-04'), { a: 1 });
  assert.deepEqual(line(d, events, '2026-10-04', 3, '2026-10-04'), ['a', 'a*', 'b']);
});

test('the debt is the holder’s: whoever took the offer took the turn', () => {
  const d = ordered([rule(['a', 'b', 'c'])]);
  const claim: ChoreEvent = { ...done('a', ANCHOR), outcome: 'swapped', to_member_id: 'b' };
  assert.deepEqual(owed(d, [claim], '2026-10-02'), { b: 1 });
});

test('a projection never invents a miss: days after today are not past yet', () => {
  const d = ordered([rule(['a', 'b', 'c'])]);
  assert.deepEqual(line(d, [], ANCHOR, 6, ANCHOR), ['a', 'b', 'c', 'a', 'b', 'c']);
  // Asked directly about the 5th on the 1st: today's turn is not done yet, and that is not a miss.
  const [fifth] = assignees(d, '2026-10-05', six, [], [], ANCHOR, [d], ANCHOR);
  assert.deepEqual([fifth.holderId, !!fifth.makeup], ['b', false]);
});

test('before its first rule a duty keeps the points pick it was shown under', () => {
  const later = ordered([rule(['c', 'b', 'a'], 'makeup', '2026-10-05')]);
  const plain = { ...later, rules: undefined };
  for (const day of ['2026-10-01', '2026-10-02', '2026-10-03'])
    assert.equal(assignees(later, day, six, [], [], ANCHOR, [later])[0].holderId, assignees(plain, day, six, [], [], ANCHOR, [plain])[0].holderId);
  assert.equal(assignees(later, '2026-10-05', six, [], [], ANCHOR, [later])[0].holderId, 'c');
});

test('the live Garbage dump: from the first rule day the list starts at the top, and old misses owe nothing', () => {
  const flat = ['Anant', 'Adnan', 'Ansh', 'Sahid', 'Ayan', 'Jatin'];
  const members = flat.map(mate);
  const d = ordered([rule(flat, 'makeup', '2026-10-18')], { every_days: null, weekdays: [1, 2, 3, 4, 5, 6] });
  const history = [done('Sahid', '2026-10-05'), done('Ayan', '2026-10-06'), done('Ansh', '2026-10-07')];
  const days = rota([d], members, [], history, '2026-10-19', 3, '2026-10-05', '2026-10-19');
  assert.deepEqual(days.map((r) => r.slots[0].holderId), ['Anant', 'Adnan', 'Ansh']);
  assert.deepEqual(Object.fromEntries(owedTurns(d, members, [], history, '2026-10-05', '2026-10-19')), {});
});
