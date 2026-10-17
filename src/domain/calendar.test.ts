/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { awayDays, awayPreview, icsFeed, marksOn, monthWeeks } from './calendar.ts';
import type { Duty, RotaRow } from './duties.ts';

const mate = (id: string) => ({ id, joined_on: '2026-01-01', left_on: null });
const abc = ['a', 'b', 'c'].map(mate);
const ANCHOR = '2026-10-01';
const garbage: Duty = {
  id: 'g', name: 'Garbage dump', effort_points: 3, every_days: 1, weekdays: null, schedule: 'rolling',
  fixed_member_id: null, active: true, group_size: 1, plans_meals: false, roster: ['a', 'b', 'c'],
  rules: [{ starts_on: ANCHOR, turns: 'order', on_miss: 'makeup', roster: ['a', 'b', 'c'], created_at: '1' }],
};

test('the month grid starts on Monday and pads both ends', () => {
  const weeks = monthWeeks('2026-10'); // 1 October 2026 is a Thursday
  assert.equal(weeks.length, 5);
  assert.deepEqual(weeks[0], [null, null, null, '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
  assert.deepEqual(weeks[4], ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', null]);
});

test('day markers: yours first, and a past turn nobody ticked reads as missed', () => {
  const row = (date: string, holder: string, done = false): RotaRow => ({ date, duty: garbage, slots: [{ ownerId: holder, holderId: holder, done }] });
  const rows = [row('2026-10-01', 'a'), row('2026-10-01', 'b', true), row('2026-10-03', 'b'), row('2026-10-03', 'c')];
  assert.deepEqual(marksOn(rows, '2026-10-01', 'b', '2026-10-02'), ['missed', 'done']);
  assert.deepEqual(marksOn(rows, '2026-10-03', 'b', '2026-10-02'), ['mine', 'other']);
  assert.deepEqual(marksOn(rows, '2026-10-05', 'b', '2026-10-02'), []);
});

test('the away preview names exactly the turns that change hands, using the real rota', () => {
  // b's turn is the 2nd. Away on the 2nd, b is passed over: c takes it, and the list moves on from there.
  const covers = awayPreview([garbage], abc, [], [], ANCHOR, ANCHOR, 'b', '2026-10-02', '2026-10-02', '2026-10-01T05:00:00Z');
  assert.deepEqual(covers[0], { date: '2026-10-02', duty: 'Garbage dump', from: 'b', to: 'c' });
  assert.equal(covers.some((c) => c.date === '2026-10-01'), false, 'a day before the absence never changes');
  assert.equal(awayDays('2026-10-02', '2026-10-04'), 3);
});

test('the calendar feed: my turns only, one stable event each, valid iCalendar lines', () => {
  const rows: RotaRow[] = [
    { date: '2026-10-05', duty: garbage, slots: [{ ownerId: 'b', holderId: 'b', done: false, makeup: true }] },
    { date: '2026-10-06', duty: garbage, slots: [{ ownerId: 'c', holderId: 'c', done: false }] },
    { date: '2026-10-01', duty: garbage, slots: [{ ownerId: 'b', holderId: 'b', done: false }] }, // missed
  ];
  const ics = icsFeed(rows, 'b', 'Flat 4B, with a long name that has to be folded across lines', '2026-10-03', '20261003T000000Z');
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 1, 'only my turn still to do; not c’s, not my missed one');
  assert.match(ics, /UID:g-20261005-b@flathub/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261005\r\nDTEND;VALUE=DATE:20261006/);
  assert.match(ics, /SUMMARY:Garbage dump \(make-up\)/);
  assert.match(ics, /X-WR-CALNAME:Flat 4B\\, with/, 'commas are escaped');
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, `folded: ${line}`);
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
});

test('a name with a line break cannot add a line of its own to the feed', () => {
  const sneaky = { ...garbage, name: 'Bins\rATTENDEE:mailto:x@evil\r\nX-INJ:1\u0007' };
  const ics = icsFeed([{ date: '2026-10-05', duty: sneaky, slots: [{ ownerId: 'b', holderId: 'b', done: false }] }], 'b', 'Flat', '2026-10-03', '20261003T000000Z');
  const lines = ics.split('\r\n').map((l) => l.replace(/^ /, ''));
  assert.ok(!lines.some((l) => l.startsWith('ATTENDEE') || l.startsWith('X-INJ')), 'no injected property');
  assert.ok(!/[\r\u0007]/.test(ics.replace(/\r\n/g, '')), 'no stray CR or control character survives');
});
