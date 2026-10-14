// Duties: whose turn it is, and why nothing buys you out of one.
// Pure TypeScript (no React, no Supabase), same house rules as kitty.ts: integer points,
// append-only events, deterministic ties by id. No randomness anywhere — the next turn is
// always predictable. Rules: docs/DATA_MODEL.md § Duties.
//
// V3 changed three things:
//   * THERE IS NO SKIP. A duty past its due date that nobody ticked is MISSED — computed here from
//     the schedule, never recorded as an event. It earns no credit, exactly as a skip did not.
//     `outcome: 'skipped'` stays in the type because rows already in the ledger carry it; nothing
//     writes it any more.
//   * A duty can be done by TWO OR THREE MATES TOGETHER, the same day. `assignees()` returns one
//     SLOT per co-assignee, each ticked by its own holder, each earning the points individually,
//     each missable on its own.
//   * A SWAP IS AN OFFER, NOT A TRANSFER. The assignee offers the slot (a `duty_mark`, not a chore
//     event); another mate claims it, and the claim is the 'swapped' event this file already reads.
//     Nobody is ever given a duty without tapping to take it, and an unclaimed offer is missed.

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
  group_size: number; // how many mates do it TOGETHER on the day. Not alternating owners.
  plans_meals: boolean; // whoever holds it also tells the cook what to make
  roster: string[] | null; // who's in, in rota order; null = every mate
  /** A label for reading (Kitchen, Bathroom). Never affects who does what. */
  area_id?: string | null;
  /**
   * "Comes with": on a day both are due, this duty goes to whoever holds `follows_id` that day.
   * Binds WHO, never WHETHER — the two stay separate duties with their own ticks and points.
   */
  follows_id?: string | null;
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

/** An offer or a vouch on one slot of one instance. Neither carries points; neither moves the rota. */
export type DutyMark = {
  duty_id: string;
  due_on: string;
  member_id: string; // whose slot
  kind: 'offer' | 'vouch';
  by_member_id: string;
};

/**
 * One co-assignee's half of one instance. `ownerId` is the mate the rota picked and never changes;
 * `holderId` is who must tick it now, which differs only after somebody claimed an offer.
 */
export type Slot = { ownerId: string; holderId: string; done: boolean };

const DAY = 86_400_000;
const dayNo = (date: string): number => Date.parse(date + 'T00:00:00Z') / DAY;
const weekday = (date: string): number => new Date(date + 'T00:00:00Z').getUTCDay();
const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const text = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

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
/** In this duty's roster. A null roster means the whole flat; a stale id simply never matches a member. */
const inRoster = (duty: Duty, memberId: string): boolean => !duty.roster || duty.roster.includes(memberId);

/**
 * The duty this one comes with, if that link is live: the leader exists in `duties`, is active, and
 * is a ROOT (follows nothing itself). The database keeps links one level deep, but this checks
 * anyway — a chain in bad data then degrades to "this one stands alone" instead of a follower that
 * is never placed. A retired leader frees its followers to take their own turns.
 */
export function leaderOf(duty: Duty, duties: Duty[]): Duty | undefined {
  if (!duty.follows_id) return undefined;
  const lead = duties.find((d) => d.id === duty.follows_id);
  return lead && lead.active && !lead.follows_id ? lead : undefined;
}

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

/**
 * The one event that settles each SLOT: the last by id. Keyed per mate, not per instance — on a
 * two-person duty both halves are settled separately, and a claim's 'swapped' row (keyed to the
 * mate who offered) must not swallow the claimer's 'done'.
 */
const settling = (events: ChoreEvent[]): ChoreEvent[] => {
  const bySlot = new Map<string, ChoreEvent>();
  for (const e of live(events).sort(byId)) bySlot.set(`${e.duty_id}|${e.due_on}|${e.member_id}`, e);
  return [...bySlot.values()];
};

/**
 * Effort points a mate has actually earned. ONLY outcome 'done' — a missed duty earns no credit —
 * and only ONCE per slot: a double submit from a second tab must not pay the points twice.
 * The price comes off the event, not the duty, so editing a duty never re-prices earned credit.
 */
export function donePoints(events: ChoreEvent[], memberId: string): number {
  return settling(events)
    .filter((e) => e.outcome === 'done' && e.member_id === memberId)
    .reduce((n, e) => n + e.points, 0);
}

/**
 * Fair share, prorated per day: each due instance's points are split between the mates who were
 * actually on the roll, in the flat AND in the duty's roster that day. A mate who joined mid-window
 * is not billed for the weeks before they arrived, an away mate is not billed for days they could
 * not do the chore — which is what the "Away — no turns" badge promises — and nobody is billed for a
 * duty they are not in. A pair duty hands out `group_size` × the points every time it falls due, so
 * the expected points must be multiplied to match or every pair looks permanently behind.
 * Mates on roll in the window always get a key, even at 0, so a fully-away mate still appears.
 */
export function fairSharePoints(
  duties: Duty[],
  members: Member[],
  absences: Absence[],
  from: string,
  to: string,
  anchor: string,
  events: ChoreEvent[] = [],
): Record<string, number> {
  const present = members.filter((m) => m.joined_on <= to && (m.left_on === null || from <= m.left_on));
  const out: Record<string, number> = Object.fromEntries(present.map((m) => [m.id, 0]));
  // What each instance was WORTH, off the ledger. donePoints already reads the snapshot on the
  // event, so without this the two halves of the deficit are priced differently: `done` stays
  // frozen at what the work was worth and `fair` moves to whatever the duty costs today. Re-pricing
  // a 2-point duty to 10 then swung five finished instances from 0.3 points ahead to 6.3 behind —
  // a debt for chores already done, which the rota then re-shuffled on.
  const priced = new Map<string, number>();
  for (const e of live(events)) priced.set(`${e.duty_id}|${e.due_on}`, e.points);
  for (const d of duties.filter((d) => d.active)) {
    const lead = leaderOf(d, duties);
    for (const date of dueDates(d, from, to, anchor)) {
      // A follower linked today is done by its leader's crew, so that crew carries its expected
      // points: the leader's roster, and no more heads than the leader puts on the day. Billing it
      // to the whole flat instead would leave every mate outside that roster looking behind on a
      // duty that can never reach them — and the rota would then load them up elsewhere to catch up.
      const linked = lead && isDueOn(lead, date, anchor) ? lead : undefined;
      const crew = linked ?? d;
      const here = present.filter((m) => onRoll(m, date) && !away(absences, m.id, date) && inRoster(crew, m.id));
      if (!here.length) continue;
      // Three mates left and a duty for four hands out three lots of points, not four.
      const slots = Math.min(d.group_size, linked ? linked.group_size : d.group_size, here.length);
      // An instance nobody has touched yet has no snapshot, so it is worth what the duty is worth
      // now — which is also what it will snapshot as the moment anyone ticks it.
      const price = priced.get(`${d.id}|${date}`) ?? d.effort_points;
      for (const m of here) out[m.id] += (price * slots) / here.length;
    }
  }
  return out;
}

/**
 * Whose turn a single instance is — one slot per co-assignee. Deterministic: largest effort deficit,
 * then a tie-break. With no roster the tie-break is whoever did THIS duty least recently (never done
 * = longest ago) then member id, exactly as before. With a roster the tie-break is ROSTER POSITION,
 * which is what makes reordering do something: "I can't have Monday because of college, I can do
 * Tuesday" drags a mate down the list, and on an equal deficit the list decides.
 *
 * ponytail: roster order is a tie-break, not a timetable. Effort points still come first, so a mate
 * who fell behind is still picked early whatever the order says — and the rota preview in Manage is
 * what makes the consequence visible before saving. A hard timetable would need its own phase column.
 *
 * `duties` is the whole list, so the deficit is measured across every duty (that is what effort
 * points are for); it defaults to this duty alone for a caller that only has the one.
 */
export function assignees(
  duty: Duty,
  dueOn: string,
  members: Member[],
  absences: Absence[],
  events: ChoreEvent[],
  anchor: string,
  duties: Duty[] = [duty],
): Slot[] {
  // A follower reads its leader's answer for the day. Resolved here too, not only in rota(), so a
  // caller asking about one duty gets the same answer the rota does.
  const lead = leaderOf(duty, duties);
  const leaderSlots =
    lead && isDueOn(lead, dueOn, anchor) ? slotsFor(lead, dueOn, members, absences, events, anchor, duties, null) : null;
  return slotsFor(duty, dueOn, members, absences, events, anchor, duties, leaderSlots);
}

/**
 * The slots for one instance. `leaderSlots` is the leader's resolved answer when this duty comes
 * with one that is due today; otherwise null and the duty takes its own turn.
 *
 * A FOLLOWER INHERITS ITS LEADER'S HOLDERS — after claims and the away fallback, so it moves with
 * whoever is actually doing the leader today — up to its own group_size, in the leader's slot order.
 * That is one rule, and "the dishes-holder plans the meals" holds by construction under a rota
 * pick, a claim, or an absence. The one exception is the follower's OWN instance: anything recorded
 * on it (a Done, an offer taken) wins exactly as it does for any duty, so a mate who takes Dishes
 * but cannot plan meals can still offer the meal planning on its own.
 */
function slotsFor(
  duty: Duty,
  dueOn: string,
  members: Member[],
  absences: Absence[],
  events: ChoreEvent[],
  anchor: string,
  duties: Duty[],
  leaderSlots: Slot[] | null,
): Slot[] {
  const settled = live(events);
  const inst = settled.filter((e) => e.duty_id === duty.id && e.due_on === dueOn).sort(byId);

  // A claim moves one slot and nothing else: the mate who offered stays its owner, the mate who took
  // it becomes its holder. The latest claim wins (UUIDv7 ids sort by time). A claim by somebody who
  // is away that day sticks to nobody — they physically cannot do it, so the slot stays where it was.
  const claim = new Map<string, string>();
  for (const e of inst)
    if (e.outcome === 'swapped' && e.to_member_id && !away(absences, e.to_member_id, dueOn))
      claim.set(e.member_id, e.to_member_id);

  // This instance's OWN events are kept out of the pick, so ticking a duty never re-shuffles the pair
  // that was on screen a second ago. Other duties on the same day still count — that is how three
  // duties due today land on three different mates.
  const past = settled.filter((e) => e.due_on < dueOn || e.duty_id !== duty.id);
  // The leader's holders, de-duplicated (one mate never holds two halves), capped at this duty's own
  // group_size. A leader with nobody available leaves the follower to take its own turn rather than
  // vanish from the day.
  const inherited = leaderSlots ? [...new Set(leaderSlots.map((s) => s.holderId))].slice(0, duty.group_size) : [];
  const base =
    inherited.length > 0
      ? inherited
      : duty.schedule === 'fixed'
        ? duty.fixed_member_id
          ? [duty.fixed_member_id]
          : []
        : pick(duty, dueOn, members, absences, past, anchor, duties);

  // A mate with an event here but no longer in the pick — the roster changed under them — keeps their
  // slot, because their Done is real. Pure claimers are not owners: their 'done' belongs to the slot
  // they took.
  const claimers = new Set(claim.values());
  const recorded = [...new Set(inst.map((e) => e.member_id))].filter((id) => claim.has(id) || !claimers.has(id));
  const owners = [...new Set([...recorded, ...base])].slice(0, Math.max(duty.group_size, recorded.length));

  return owners.map((ownerId) => {
    const taker = claim.get(ownerId);
    // A claim by a mate who is ALREADY on this instance sticks to nobody — the same answer, and for
    // the same reason, as a claim by a mate who is away: there is no turn to hand over, because
    // they are holding one already. Without this, one mate ends up holding both halves of a pair
    // duty, `done` is keyed per holder, and a single tick reads as both halves finished: they do
    // the whole chore alone and are paid for half of it, permanently, with the shortfall showing
    // up nowhere. The mate it robs is the one who covered for a flatmate, which is the exact
    // behaviour the points exist to reward.
    const holderId = taker && !owners.includes(taker) ? taker : ownerId;
    return { ownerId, holderId, done: inst.some((e) => e.outcome === 'done' && e.member_id === holderId) };
  });
}

/** The rolling pick: `group_size` mates off the top of the deficit order. */
function pick(
  duty: Duty,
  dueOn: string,
  members: Member[],
  absences: Absence[],
  past: ChoreEvent[],
  anchor: string,
  duties: Duty[],
): string[] {
  const can = members.filter((m) => onRoll(m, dueOn) && !away(absences, m.id, dueOn) && inRoster(duty, m.id));
  if (can.length === 0) return [];
  const fair = fairSharePoints(duties, members, absences, anchor, dueOn, anchor, past);
  // Last day this mate did THIS duty; '' (never) sorts first, i.e. longest ago.
  const lastDid = (id: string) =>
    past
      .filter((e) => e.outcome === 'done' && e.duty_id === duty.id && e.member_id === id)
      .reduce((latest, e) => (e.due_on > latest ? e.due_on : latest), '');
  const order = duty.roster;
  return can
    .map((m) => ({ id: m.id, deficit: (fair[m.id] ?? 0) - donePoints(past, m.id), last: lastDid(m.id) }))
    .sort(
      (a, b) =>
        b.deficit - a.deficit ||
        // With a roster, position REPLACES the other tie-breaks. If it merely followed them,
        // `lastDid` would encode the old cycle and dragging a mate up the list would do nothing.
        (order ? order.indexOf(a.id) - order.indexOf(b.id) : text(a.last, b.last) || byId(a, b)),
    )
    .slice(0, Math.max(1, duty.group_size))
    .map((x) => x.id);
}

/**
 * A duty past its due date that its holder never ticked. COMPUTED, never recorded: nothing is
 * appended to the ledger for something nobody did, and it earns no credit — the same as before.
 * An open offer protects nobody; an unclaimed slot is missed like any other.
 */
export const missed = (slot: Slot, dueOn: string, today: string): boolean => !slot.done && dueOn < today;

/** Has this slot's owner offered it? An offer opens the slot to everyone; it hands it to nobody. */
export const offered = (marks: DutyMark[], dutyId: string, dueOn: string, ownerId: string): boolean =>
  marks.some((m) => m.kind === 'offer' && m.duty_id === dutyId && m.due_on === dueOn && m.member_id === ownerId);

/** Who has vouched that this slot was done. Carries no points, and never will. */
export const vouchers = (marks: DutyMark[], dutyId: string, dueOn: string, ownerId: string): string[] =>
  marks
    .filter((m) => m.kind === 'vouch' && m.duty_id === dutyId && m.due_on === dueOn && m.member_id === ownerId)
    .map((m) => m.by_member_id);

export type RotaRow = { date: string; duty: Duty; slots: Slot[] };

/**
 * The next `days` days of duty: date, duty, and one slot per co-assignee. `today` only matters when
 * the window reaches back before it, which the screen does so it can state yesterday's misses.
 */
export function rota(
  duties: Duty[],
  members: Member[],
  absences: Absence[],
  events: ChoreEvent[],
  from: string,
  days: number,
  anchor: string,
  today: string = from,
): RotaRow[] {
  const active = duties.filter((d) => d.active).sort(byId);
  // Every turn handed out here is credited provisionally, so the second duty due today sees the
  // first one's points. Without this, three duties due today all land on the same mate — and on a
  // pair duty, on the same pair. The ids sort after any UUIDv7, so a provisional row is always the
  // latest for its slot.
  const provisional: ChoreEvent[] = [];
  const out: RotaRow[] = [];

  // Followers, grouped under the leader they come with. Each is placed straight after its leader so
  // it reads the slots the leader was just given — not a fresh pick, which could differ once other
  // duties' provisional credit has landed in between.
  const followers = new Map<string, Duty[]>();
  for (const d of active) {
    const lead = leaderOf(d, duties);
    if (lead) followers.set(lead.id, [...(followers.get(lead.id) ?? []), d]);
  }

  const place = (duty: Duty, date: string, leaderSlots: Slot[] | null): Slot[] => {
    const slots = slotsFor(duty, date, members, absences, [...events, ...provisional], anchor, duties, leaderSlots);
    for (const s of slots)
      // A slot already past its due date with no Done is MISSED, and a missed slot gets NO
      // provisional credit. Crediting it would push whoever missed it down the queue — credit for
      // work nobody did, arriving through the assignment engine instead of through donePoints.
      if (!s.done && date >= today)
        provisional.push({
          id: `~${date}|${duty.id}|${s.holderId}`,
          duty_id: duty.id,
          member_id: s.holderId,
          outcome: 'done',
          to_member_id: null,
          due_on: date,
          reverses_id: null,
          points: duty.effort_points,
        });
    out.push({ date, duty, slots });
    return slots;
  };

  for (let i = 0; i < days; i++) {
    const date = new Date((dayNo(from) + i) * DAY).toISOString().slice(0, 10);
    for (const duty of active) {
      if (!isDueOn(duty, date, anchor)) continue;
      // Linked today: it is placed below, right after its leader. Its leader is not due today: it
      // takes its own turn here like any other duty.
      const lead = leaderOf(duty, duties);
      if (lead && isDueOn(lead, date, anchor)) continue;
      const slots = place(duty, date, null);
      // The follower's points are credited before the next duty is picked, so the leader's holder
      // carries both loads into tomorrow's picks — the pair costs what it costs, no more, no less.
      for (const f of followers.get(duty.id) ?? []) if (isDueOn(f, date, anchor)) place(f, date, slots);
    }
  }
  return out;
}

/** A duty as the database stores it. `created_at` is the rota's anchor: a duty is never due before it existed. */
export type DatedDuty = Duty & { created_at: string };

/**
 * Today's still-open slots, grouped by whoever has to tick one. This is the recipient list for the
 * "your duty is due today" notification (docs/NOTIFICATIONS.md #1), and it is the same list the
 * Duties tab draws — which is the whole point of it living here. The anchor is derived inside, the
 * way src/ui/duties.tsx derives it, so a push can never name a different mate than the screen does.
 *
 * The HOLDER is notified, not the owner: on a claimed slot that is the mate who took it, and on an
 * offered-but-unclaimed one it is still its owner, because an open offer hands the duty to nobody.
 *
 * `today` is an IST date (`istDate()`), not a UTC one: the 08:00 IST cron must ask about the day the
 * flat is actually in. One entry per mate, never one per duty — two duties on the same day are one
 * push naming both, because a second push would only collapse the first by tag. A mate holding both
 * halves of a pair duty is named once.
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
  for (const r of rota(duties, members, absences, events, today, 1, anchor))
    for (const slot of r.slots) {
      // A ticked slot needs no reminder. Everything else today is still somebody's to do.
      if (slot.done) continue;
      const names = byMember.get(slot.holderId) ?? [];
      if (!names.includes(r.duty.name)) names.push(r.duty.name);
      byMember.set(slot.holderId, names);
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
  const fair = fairSharePoints(duties, members, absences, from, to, anchor, events);
  return members
    .filter((m) => m.id in fair)
    .sort(byId)
    .map((m) => {
      const done = donePoints(window, m.id);
      return { memberId: m.id, done, fair: fair[m.id], deficit: fair[m.id] - done };
    });
}
