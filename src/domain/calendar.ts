// The calendar's arithmetic: the month grid, what each day's markers say, what marking yourself away
// would change, and the private calendar feed. Pure TypeScript, so the screen, the edge function that
// serves the feed and the tests all get the same answer. The rota itself is src/domain/duties.ts.
import { missed, rota, type ChoreEvent, type Duty, type RotaRow } from './duties.ts';
import type { Absence, Member } from './kitty.ts';

const DAY = 86_400_000;
const dayNo = (date: string): number => Date.parse(date + 'T00:00:00Z') / DAY;
export const shiftDate = (date: string, days: number): string => new Date((dayNo(date) + days) * DAY).toISOString().slice(0, 10);

/** The month as Monday-first weeks of dates; days outside the month are null. */
export function monthWeeks(month: string): (string | null)[][] {
  const first = `${month}-01`;
  const lead = (new Date(first + 'T00:00:00Z').getUTCDay() + 6) % 7; // Monday = 0
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = first; d.startsWith(month); d = shiftDate(d, 1)) cells.push(d);
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
}

export type Mark = 'mine' | 'done' | 'missed' | 'other';

/**
 * One marker per turn on `date`, mine first. A turn is `done`, `missed` (past, nobody ticked it), or
 * still to come — `mine` when it is yours to do, `other` when it is someone else's.
 */
export function marksOn(rows: RotaRow[], date: string, me: string, today: string): Mark[] {
  const out: Mark[] = [];
  for (const r of rows)
    if (r.date === date)
      for (const s of r.slots)
        out.push(s.done ? 'done' : missed(s, r.date, today) ? 'missed' : s.holderId === me ? 'mine' : 'other');
  const rank: Record<Mark, number> = { mine: 0, missed: 1, other: 2, done: 3 };
  return out.sort((a, b) => rank[a] - rank[b]);
}

/** A turn that changes hands if you are away: whose it was, and who covers it instead. */
export type Cover = { date: string; duty: string; from: string; to: string | null };

/**
 * What marking `me` away from `from` to `to` would change, worked out by the real rota with and
 * without the absence. Only turns that change hands are returned, from the first away day until
 * a fortnight after the last, which is far enough to show the knock-on in a six-mate rota.
 */
export function awayPreview(
  duties: Duty[],
  members: Member[],
  absences: Absence[],
  events: ChoreEvent[],
  anchor: string,
  today: string,
  me: string,
  from: string,
  to: string,
  now: string,
): Cover[] {
  const start = from < today ? today : from;
  const days = dayNo(to) - dayNo(start) + 15;
  if (days <= 0) return [];
  const before = rota(duties, members, absences, events, start, days, anchor, today);
  const away: Absence = { member_id: me, from_date: from, to_date: to, created_at: now };
  const after = rota(duties, members, [...absences, away], events, start, days, anchor, today);
  const out: Cover[] = [];
  for (const r of before) {
    const a = after.find((x) => x.date === r.date && x.duty.id === r.duty.id);
    const was = r.slots.map((s) => s.holderId);
    const nowHeld = a?.slots.map((s) => s.holderId) ?? [];
    const gone = was.filter((id) => !nowHeld.includes(id));
    const came = nowHeld.filter((id) => !was.includes(id));
    gone.forEach((id, i) => out.push({ date: r.date, duty: r.duty.name, from: id, to: came[i] ?? null }));
  }
  return out;
}

/** Days in an away run, inclusive. The kitty only discounts a run of three days or more. */
export const awayDays = (from: string, to: string): number => dayNo(to) - dayNo(from) + 1;

// ---------------------------------------------------------------- the private calendar feed

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const compact = (date: string) => date.replace(/-/g, '');

/**
 * An iCalendar feed of one mate's turns: an all-day event per turn they hold, with a 9am reminder.
 * The UID is the turn itself (duty, day, owner), so when the rota moves a turn the calendar app
 * updates that event instead of adding a second one. Done turns stay, marked done; missed ones are
 * left out — the feed is for what to do, not a record of what was not done.
 */
export function icsFeed(rows: RotaRow[], me: string, flat: string, today: string, stamp: string): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FlatHub//Duties//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(`${flat} · my turns`)}`,
    'X-PUBLISHED-TTL:PT6H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
  ];
  for (const r of rows)
    for (const s of r.slots) {
      if (s.holderId !== me || missed(s, r.date, today)) continue;
      const title = `${r.duty.name}${s.makeup ? ' (make-up)' : ''}${s.done ? ' ✓' : ''}`;
      lines.push(
        'BEGIN:VEVENT',
        `UID:${r.duty.id}-${compact(r.date)}-${s.ownerId}@flathub`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${compact(r.date)}`,
        `DTEND;VALUE=DATE:${compact(shiftDate(r.date, 1))}`,
        `SUMMARY:${esc(title)}`,
        `DESCRIPTION:${esc(`${r.duty.effort_points} ${r.duty.effort_points === 1 ? 'point' : 'points'}. Tick it in FlatHub when it's done: https://flathub.vercel.app/duties`)}`,
        'TRANSP:TRANSPARENT',
      );
      if (!s.done) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(r.duty.name)}`, 'TRIGGER:PT9H', 'END:VALARM');
      lines.push('END:VEVENT');
    }
  lines.push('END:VCALENDAR');
  // RFC 5545: CRLF line ends, and lines folded at 75 octets.
  return lines.map(fold).join('\r\n') + '\r\n';
}

function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > (parts.length ? 74 : 75)) {
      parts.push(cur);
      cur = '';
    }
    cur += ch;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}
