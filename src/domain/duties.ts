// Duties: whose turn it is, and why a skip never buys you out of one.
// Pure TypeScript (no React, no Supabase), same house rules as kitty.ts: integer points,
// append-only events, deterministic ties by id. No randomness anywhere — the next turn is
// always predictable. Rules: docs/DATA_MODEL.md § Duties.

import { istDate, type Member, type Absence } from './kitty.ts';

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
  points: number; // the duty's price AT THE TIME, snapshotted by the db. Never re-priced.
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
export const away = (absences: Absence[], memberId: string, date: string): boolean =>
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

/** The one event that settles an instance: the last by id, exactly what assignee() looks at. */
const settling = (events: ChoreEvent[]): ChoreEvent[] => {
  const byInstance = new Map<string, ChoreEvent>();
  for (const e of live(events).sort(byId)) byInstance.set(`${e.duty_id}|${e.due_on}`, e);
  return [...byInstance.values()];
};

/**
 * Effort points a mate has actually earned. ONLY outcome 'done' — a skip earns no credit — and only
 * ONCE per instance: a double submit from a second tab must not pay the points twice.
 * The price comes off the event, not the duty, so editing a duty never re-prices earned credit.
 */
export function donePoints(events: ChoreEvent[], memberId: string): number {
  return settling(events)
    .filter((e) => e.outcome === 'done' && e.member_id === memberId)
    .reduce((n, e) => n + e.points, 0);
}

/**
 * Fair share, prorated per day: each due instance's points are split between the mates who were
 * actually on the roll AND in the flat that day. A mate who joined mid-window is not billed for the
 * weeks before they arrived, and an away mate is not billed for days they could not do the chore —
 * which is what the "Away — no turns" badge promises. Mates on roll in the window always get a key,
 * even at 0, so a fully-away mate still appears in the standing.
 */
export function fairSharePoints(
  duties: Duty[],
  members: Member[],
  absences: Absence[],
  from: string,
  to: string,
  anchor: string,
): Record<string, number> {
  const present = members.filter((m) => m.joined_on <= to && (m.left_on === null || from <= m.left_on));
  const out: Record<string, number> = Object.fromEntries(present.map((m) => [m.id, 0]));
  for (const d of duties.filter((d) => d.active)) {
    for (const date of dueDates(d, from, to, anchor)) {
      const here = present.filter((m) => onRoll(m, date) && !away(absences, m.id, date));
      for (const m of here) out[m.id] += d.effort_points / here.length;
    }
  }
  return out;
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
  // A swap TO a mate who is away that day settles nothing: they physically cannot do it, so the
  // instance falls back to the rolling pick rather than being dumped on them.
  const last = settled.filter((e) => e.duty_id === duty.id && e.due_on === dueOn).sort(byId).pop();
  if (last && !(last.outcome === 'swapped' && away(absences, last.to_member_id ?? '', dueOn)))
    return last.outcome === 'swapped' ? last.to_member_id : last.member_id;
  if (duty.schedule === 'fixed') return duty.fixed_member_id;

  const can = members.filter((m) => onRoll(m, dueOn) && !away(absences, m.id, dueOn)).sort(byId);
  if (can.length === 0) return null;

  const past = settled.filter((e) => e.due_on <= dueOn);
  const fair = fairSharePoints(duties, members, absences, anchor, dueOn, anchor);
  // Last day this mate did THIS duty; '' (never) sorts first, i.e. longest ago.
  const lastDid = (id: string) =>
    past
      .filter((e) => e.outcome === 'done' && e.duty_id === duty.id && e.member_id === id)
      .reduce((latest, e) => (e.due_on > latest ? e.due_on : latest), '');

  return can
    .map((m) => ({ id: m.id, deficit: (fair[m.id] ?? 0) - donePoints(past, m.id), last: lastDid(m.id) }))
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
  // Every turn handed out here is credited provisionally, so the second duty due today sees the
  // first one's points. Without this, three duties due the same day all land on the same mate.
  // The ids sort after any UUIDv7, so a provisional row is always the latest for its instance.
  const provisional: ChoreEvent[] = [];
  const out: { date: string; duty: Duty; memberId: string | null; outcome: ChoreEvent['outcome'] | null }[] = [];
  for (let i = 0; i < days; i++) {
    const date = new Date((dayNo(from) + i) * DAY).toISOString().slice(0, 10);
    for (const duty of active) {
      if (!isDueOn(duty, date, anchor)) continue;
      const last = settled.filter((e) => e.duty_id === duty.id && e.due_on === date).sort(byId).pop();
      const memberId = assignee(duty, date, members, absences, [...events, ...provisional], anchor, duties);
      if (!last && memberId)
        provisional.push({
          id: `~${date}|${duty.id}`,
          duty_id: duty.id,
          member_id: memberId,
          outcome: 'done',
          to_member_id: null,
          due_on: date,
          reverses_id: null,
          points: duty.effort_points,
        });
      out.push({ date, duty, memberId, outcome: last ? last.outcome : null });
    }
  }
  return out;
}

/**
 * Is this instance still somebody's to do? A swap is NOT settled — it hands the turn over, and the
 * mate it landed on still owes it. Only 'done' and 'skipped' close an instance.
 */
export const isOpen = (outcome: ChoreEvent['outcome'] | null): boolean => outcome === null || outcome === 'swapped';

/** A duty as the database stores it. `created_at` is the rota's anchor: a duty is never due before it existed. */
export type DatedDuty = Duty & { created_at: string };

/**
 * Today's still-open duty instances, grouped by whose turn it is. This is the recipient list for
 * the "your duty is due today" notification (docs/NOTIFICATIONS.md #1), and it is the same list the
 * Duties tab draws — which is the whole point of it living here. The anchor is derived inside, the
 * way src/ui/duties.tsx derives it, so a push can never name a different mate than the screen does.
 *
 * `today` is an IST date (`istDate()`), not a UTC one: the 08:00 IST cron must ask about the day the
 * flat is actually in. One entry per mate, never one per duty — two duties on the same day are one
 * push naming both, because a second push would only collapse the first by tag.
 */
export function dueToday(
  duties: DatedDuty[],
  members: Member[],
  absences: Absence[],
  events: ChoreEvent[],
  today: string,
): { memberId: string; dutyNames: string[] }[] {
  const anchor = duties.reduce((a, d) => (istDate(d.created_at) < a ? istDate(d.created_at) : a), today);
  const byMember = new Map<string, string[]>();
  for (const r of rota(duties, members, absences, events, today, 1, anchor)) {
    // A done or skipped instance needs no reminder. A swapped one still does — `memberId` is
    // already whoever it was swapped to, so the nudge follows the turn.
    if (!isOpen(r.outcome) || !r.memberId) continue;
    byMember.set(r.memberId, [...(byMember.get(r.memberId) ?? []), r.duty.name]);
  }
  return [...byMember]
    .map(([memberId, dutyNames]) => ({ memberId, dutyNames }))
    .sort((a, b) => (a.memberId < b.memberId ? -1 : 1));
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
  const fair = fairSharePoints(duties, members, absences, from, to, anchor);
  return members
    .filter((m) => m.id in fair)
    .sort(byId)
    .map((m) => {
      const done = donePoints(window, m.id);
      return { memberId: m.id, done, fair: fair[m.id], deficit: fair[m.id] - done };
    });
}
