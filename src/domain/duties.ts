// Duties: whose turn it is, and why a skip never buys you out of one.
// Pure TypeScript (no React, no Supabase), same house rules as kitty.ts: integer points,
// append-only events, deterministic ties by id. No randomness anywhere — the next turn is
// always predictable. Rules: docs/DATA_MODEL.md § Duties.

import type { Member, Absence } from './kitty.ts';

export type Duty = {
  id: string;
  name: string;
  effort_points: number;
  every_days: number | null;
  weekdays: number[] | null; // 0 = Sunday … 6 = Saturday, like Date#getUTCDay
  schedule: 'rolling' | 'fixed';
  fixed_member_id: string | null;
  active: boolean;
};

export type ChoreEvent = {
  id: string; // UUIDv7: ids sort by creation time, which is how "the latest event" is decided
  duty_id: string;
  member_id: string;
  outcome: 'done' | 'skipped' | 'swapped';
  to_member_id: string | null;
  due_on: string;
  reverses_id: string | null;
};

const DAY = 86_400_000;
const dayNo = (date: string): number => Date.parse(date + 'T00:00:00Z') / DAY;
const weekday = (date: string): number => new Date(date + 'T00:00:00Z').getUTCDay();
const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** A reversed event and its reversal both drop out, so every count below is a plain count. */
const live = (events: ChoreEvent[]): ChoreEvent[] => {
  const reversed = new Set(events.flatMap((e) => (e.reverses_id ? [e.reverses_id] : [])));
  return events.filter((e) => !e.reverses_id && !reversed.has(e.id));
};

/** Member of the household on that date (joined_on … left_on, both inclusive). */
const onRoll = (m: Member, date: string): boolean => m.joined_on <= date && (m.left_on === null || date <= m.left_on);
/** Away on that date. The 3-day rule is a money rule: for duties, one day away is one day you can't do it. */
const away = (absences: Absence[], memberId: string, date: string): boolean =>
  absences.some((a) => a.member_id === memberId && a.from_date <= date && date <= a.to_date);

/** `anchor` is the duty's created date: a duty is never due before it existed. */
export function isDueOn(duty: Duty, date: string, anchor: string): boolean {
  const n = dayNo(date) - dayNo(anchor);
  if (n < 0) return false;
  if (duty.weekdays) return duty.weekdays.includes(weekday(date));
  return duty.every_days ? n % duty.every_days === 0 : false;
}

/** Due dates in from…to inclusive. Cadence only — callers filter on `active`. */
export function dueDates(duty: Duty, from: string, to: string, anchor: string): string[] {
  const out: string[] = [];
  for (let d = dayNo(from); d <= dayNo(to); d++) {
    const date = new Date(d * DAY).toISOString().slice(0, 10);
    if (isDueOn(duty, date, anchor)) out.push(date);
  }
  return out;
}

/** Effort points a mate has actually earned. ONLY outcome 'done' — a skip earns no credit. */
export function donePoints(events: ChoreEvent[], memberId: string, duties: Duty[]): number {
  const points = new Map(duties.map((d) => [d.id, d.effort_points]));
  return live(events)
    .filter((e) => e.outcome === 'done' && e.member_id === memberId)
    .reduce((n, e) => n + (points.get(e.duty_id) ?? 0), 0);
}

/** Total points scheduled in the window, split evenly between the mates present in it. */
export function fairSharePoints(
  duties: Duty[],
  members: Member[],
  from: string,
  to: string,
  anchor: string,
): Record<string, number> {
  const present = members.filter((m) => m.joined_on <= to && (m.left_on === null || from <= m.left_on));
  const total = duties
    .filter((d) => d.active)
    .reduce((n, d) => n + dueDates(d, from, to, anchor).length * d.effort_points, 0);
  const each = present.length ? total / present.length : 0;
  return Object.fromEntries(present.map((m) => [m.id, each]));
}

/**
 * Whose turn a single instance is. Deterministic: largest effort deficit, then whoever did THIS
 * duty least recently (never done = longest ago), then member id. null when nobody is available.
 * `duties` is the whole list, so the deficit is measured across every duty (that is what effort
 * points are for); it defaults to this duty alone for a caller that only has the one.
 */
export function assignee(
  duty: Duty,
  dueOn: string,
  members: Member[],
  absences: Absence[],
  events: ChoreEvent[],
  anchor: string,
  duties: Duty[] = [duty],
): string | null {
  const settled = live(events);
  // Anything already recorded for this instance settles it: a swap hands it over (whatever the
  // schedule says), a done or a skip names who owned it. Last event wins — UUIDv7 ids sort by time.
  const last = settled.filter((e) => e.duty_id === duty.id && e.due_on === dueOn).sort(byId).pop();
  if (last) return last.outcome === 'swapped' ? last.to_member_id : last.member_id;
  if (duty.schedule === 'fixed') return duty.fixed_member_id;

  const can = members.filter((m) => onRoll(m, dueOn) && !away(absences, m.id, dueOn)).sort(byId);
  if (can.length === 0) return null;

  const past = settled.filter((e) => e.due_on <= dueOn);
  const fair = fairSharePoints(duties, members, anchor, dueOn, anchor);
  // Last day this mate did THIS duty; '' (never) sorts first, i.e. longest ago.
  const lastDid = (id: string) =>
    past
      .filter((e) => e.outcome === 'done' && e.duty_id === duty.id && e.member_id === id)
      .reduce((latest, e) => (e.due_on > latest ? e.due_on : latest), '');

  return can
    .map((m) => ({ id: m.id, deficit: (fair[m.id] ?? 0) - donePoints(past, m.id, duties), last: lastDid(m.id) }))
    // ponytail: two duties due the same day with identical history land on the same mate until the
    // least-recently-done tie-break separates them. Thread pending assignments through if that bites.
    .sort((a, b) => b.deficit - a.deficit || (a.last < b.last ? -1 : a.last > b.last ? 1 : 0) || byId(a, b))[0].id;
}

/** The next `days` days of duty: date, duty, whose turn, and what was recorded (null = still open). */
export function rota(
  duties: Duty[],
  members: Member[],
  absences: Absence[],
  events: ChoreEvent[],
  from: string,
  days: number,
  anchor: string,
): { date: string; duty: Duty; memberId: string | null; outcome: ChoreEvent['outcome'] | null }[] {
  const settled = live(events);
  const active = duties.filter((d) => d.active).sort(byId);
  const out: { date: string; duty: Duty; memberId: string | null; outcome: ChoreEvent['outcome'] | null }[] = [];
  for (let i = 0; i < days; i++) {
    const date = new Date((dayNo(from) + i) * DAY).toISOString().slice(0, 10);
    for (const duty of active) {
      if (!isDueOn(duty, date, anchor)) continue;
      const last = settled.filter((e) => e.duty_id === duty.id && e.due_on === date).sort(byId).pop();
      out.push({
        date,
        duty,
        memberId: assignee(duty, date, members, absences, events, anchor, duties),
        outcome: last ? last.outcome : null,
      });
    }
  }
  return out;
}

/** Done vs fair share for everyone. Sorted by member id, never by score: this is not a leaderboard. */
export function standing(
  duties: Duty[],
  members: Member[],
  absences: Absence[],
  events: ChoreEvent[],
  from: string,
  to: string,
  anchor: string,
): { memberId: string; done: number; fair: number; deficit: number }[] {
  const window = live(events).filter((e) => from <= e.due_on && e.due_on <= to);
  const fair = fairSharePoints(duties, members, from, to, anchor);
  return members
    .filter((m) => m.id in fair)
    .sort(byId)
    .map((m) => {
      const done = donePoints(window, m.id, duties);
      return { memberId: m.id, done, fair: fair[m.id], deficit: fair[m.id] - done };
    });
}
