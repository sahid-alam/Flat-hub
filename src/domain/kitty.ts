// Kitty maths. Pure TypeScript: no React, no Supabase (the POS reuses this).
// Money is integer paise. Ledger reversals carry the negated amount, so every Σ is a plain sum.
// Formulas: docs/DATA_MODEL.md.

export type Member = { id: string; joined_on: string; left_on: string | null };
export type Absence = { member_id: string; from_date: string; to_date: string; created_at?: string };
export type Spend = {
  id: string;
  paid_by: string;
  paid_from: 'pool' | 'personal';
  total_paise: number;
  occurred_at: string;
  reverses_id: string | null;
  source?: 'zepto' | 'local' | 'other'; // the rows carry it; the share maths doesn't care
};
export type SpendLine = { line_total_paise: number; kind: 'item' | 'fee' | 'discount' };
/** What the breakdown needs of a spend line and the product behind it. */
export type BreakdownLine = { spend_id: string; line_total_paise: number; product_id: string | null };
export type BreakdownProduct = { id: string; category: string | null };
export type PoolEntry = {
  kind: 'contribution' | 'reimbursement';
  member_id: string;
  amount_paise: number;
  reverses_id: string | null;
  spend_id?: string | null; // reimbursement: the own-pocket spend it pays back
  occurred_at?: string; // the rows carry it; only closableMonths reads it
};
export type Books = {
  members: Member[];
  absences: Absence[];
  spends: Spend[];
  entries: PoolEntry[];
  monthlyTopupPaise: number;
  lines?: BreakdownLine[]; // only monthBreakdown reads these two
  products?: BreakdownProduct[];
};

const DAY = 86_400_000;
const IST = 5.5 * 3_600_000; // India has no DST

/** Calendar date (YYYY-MM-DD) in India for a timestamp. */
export const istDate = (iso: string): string => new Date(Date.parse(iso) + IST).toISOString().slice(0, 10);
const dayNo = (date: string): number => Date.parse(date + 'T00:00:00Z') / DAY;
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

/** Largest remainder in paise; ties go to the lowest member id. Shares always sum to totalPaise. */
export function allocate(totalPaise: number, weights: Record<string, number>): Record<string, number> {
  if (totalPaise < 0) {
    const pos = allocate(-totalPaise, weights);
    return Object.fromEntries(Object.entries(pos).map(([id, v]) => [id, -v || 0]));
  }
  const W = sum(Object.values(weights));
  if (W <= 0) throw new Error('allocate: weights sum to 0');
  const rows = Object.keys(weights)
    .sort()
    .map((id) => {
      const x = totalPaise * weights[id]; // exact while totalPaise·w < 2^53
      return { id, q: Math.floor(x / W), r: x % W };
    });
  let left = totalPaise - sum(rows.map((row) => row.q));
  const out: Record<string, number> = Object.fromEntries(rows.map((row) => [row.id, row.q]));
  // stable sort keeps id order within equal remainders
  for (const row of [...rows].sort((a, b) => b.r - a.r)) {
    if (left-- <= 0) break;
    out[row.id]++;
  }
  return out;
}

/** w(m) for month 'YYYY-MM' = membership days − days covered by absence runs of ≥ 3 days. */
export function presenceWeights(month: string, members: Member[], absences: Absence[]): Record<string, number> {
  const start = dayNo(month + '-01');
  const [y, mo] = month.split('-').map(Number);
  const end = Date.UTC(y, mo, 0) / DAY; // day 0 of next month = last day of this one

  const membership: Record<string, number> = {};
  const w: Record<string, number> = {};
  for (const m of members) {
    const from = Math.max(start, dayNo(m.joined_on));
    const to = Math.min(end, m.left_on ? dayNo(m.left_on) : Infinity);
    if (to < from) continue; // not a member this month
    membership[m.id] = to - from + 1;

    const ranges = absences
      .filter((a) => a.member_id === m.id)
      .map((a) => [dayNo(a.from_date), dayNo(a.to_date)])
      .sort((a, b) => a[0] - b[0]);
    const runs: number[][] = [];
    for (const [f, t] of ranges) {
      const last = runs[runs.length - 1];
      if (last && f <= last[1] + 1) last[1] = Math.max(last[1], t);
      else runs.push([f, t]);
    }
    const absent = sum(
      runs
        .filter(([f, t]) => t - f + 1 >= 3) // judged on the whole run, even across months
        .map(([f, t]) => Math.max(0, Math.min(t, to) - Math.max(f, from) + 1)),
    );
    w[m.id] = membership[m.id] - absent;
  }
  return sum(Object.values(w)) === 0 ? membership : w;
}

/** A reversal is anchored to its target, so it lands in the month its share was allocated in. */
export function anchors<R extends { id: string; reverses_id: string | null }>(rows: R[]): (r: R) => R {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return (r) => (r.reverses_id ? (byId.get(r.reverses_id) ?? r) : r);
}

/** Spend per IST month; a reversal counts in its target's month so it nets to zero. */
function spendByMonth(spends: Spend[]): Map<string, number> {
  const anchor = anchors(spends);
  const months = new Map<string, number>();
  for (const s of spends) {
    const month = istDate(anchor(s).occurred_at).slice(0, 7);
    months.set(month, (months.get(month) ?? 0) + s.total_paise);
  }
  return months;
}

export function shares(b: Books): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(b.members.map((m) => [m.id, 0]));
  for (const [month, total] of spendByMonth(b.spends)) {
    if (total === 0) continue;
    for (const [id, v] of Object.entries(allocate(total, presenceWeights(month, b.members, b.absences)))) {
      out[id] += v;
    }
  }
  return out;
}

const entries = (b: Books, kind: PoolEntry['kind'], m?: string) =>
  sum(b.entries.filter((e) => e.kind === kind && (m === undefined || e.member_id === m)).map((e) => e.amount_paise));
const personal = (b: Books, m: string) =>
  sum(b.spends.filter((s) => s.paid_from === 'personal' && s.paid_by === m).map((s) => s.total_paise));

export const poolCash = (b: Books): number =>
  entries(b, 'contribution') -
  sum(b.spends.filter((s) => s.paid_from === 'pool').map((s) => s.total_paise)) -
  entries(b, 'reimbursement');
export const credit = (b: Books, m: string): number =>
  entries(b, 'contribution', m) + personal(b, m) - entries(b, 'reimbursement', m);
export const share = (b: Books, m: string): number => shares(b)[m] ?? 0;
/** Positive: the kitty owes m. Negative: m should top up. */
export const position = (b: Books, m: string): number => credit(b, m) - share(b, m);
/** Ansh's list: what the kitty still owes m for own-pocket spends. */
export const toReimburse = (b: Books, m: string): number => personal(b, m) - entries(b, 'reimbursement', m);
export const suggestedTopup = (b: Books, m: string): number => Math.max(0, b.monthlyTopupPaise - position(b, m));

/** Own-pocket spends not yet paid back (reversed spends and reversed reimbursements drop out). Ansh's list, item by item. */
export function unreimbursed<S extends Spend>(spends: S[], entries: PoolEntry[]): S[] {
  const reversed = new Set(spends.map((s) => s.reverses_id));
  const paid = (id: string) =>
    sum(entries.filter((e) => e.kind === 'reimbursement' && e.spend_id === id).map((e) => e.amount_paise));
  return spends.filter((s) => s.paid_from === 'personal' && !s.reverses_id && !reversed.has(s.id) && paid(s.id) < s.total_paise);
}

/** Lines are optional; when present they must sum to the spend total (fees +, discounts −). */
export const linesBalance = (totalPaise: number, lines: SpendLine[]): boolean =>
  lines.length === 0 || sum(lines.map((l) => l.line_total_paise)) === totalPaise;

/** An absence logged after it started is flagged "added late" on the statement. */
export const addedLate = (a: Absence): boolean => !!a.created_at && istDate(a.created_at) > a.from_date;

// ─── Month close (M5) ───────────────────────────────────────────────────────

export type Close = { month: string };

export const isClosed = (month: string, closes: Close[]): boolean => closes.some((c) => c.month === month);

/** Months with activity, strictly before the current IST month, not yet closed. Oldest first. */
export function closableMonths(b: Books, closes: Close[], nowIso: string): string[] {
  const now = istDate(nowIso).slice(0, 7);
  const active = new Set(spendByMonth(b.spends).keys());
  for (const e of b.entries) if (e.occurred_at) active.add(istDate(e.occurred_at).slice(0, 7));
  return [...active].filter((m) => m < now && !isClosed(m, closes)).sort();
}

/** Integer percentages of `total` that sum to exactly 100, by the same largest-remainder rule as allocate(). */
export function pcts<T extends { paise: number }>(groups: T[]): (T & { pct: number })[] {
  // allocate() needs non-negative weights: a net-negative group (mostly discounts) reads 0% and the
  // positive groups share the 100 between them. A fully-reversed month reads 0% everywhere.
  const weights = Object.fromEntries(groups.map((g, i) => [String(i), Math.max(0, g.paise)]));
  const share = sum(Object.values(weights)) > 0 ? allocate(100, weights) : {};
  return groups.map((g, i) => ({ ...g, pct: share[String(i)] ?? 0 }));
}

/** The fixed order both monthBreakdown and stats.ts's periodBreakdown lay the sources out in: the
 *  largest-remainder rule in allocate() breaks a tie by position, so a different order is a
 *  different percentage, not just a different row order. */
export const SOURCES: NonNullable<Spend['source']>[] = ['zepto', 'local', 'other'];

/**
 * Where a month's money went: by store source and by product category, plus pool vs own pocket.
 * Lines and products ride on Books; without them everything falls under 'Other'.
 * A reversal is read as its target's lines negated, so it nets out of both breakdowns.
 */
export function monthBreakdown(b: Books, month: string) {
  const anchor = anchors(b.spends);
  const mine = b.spends.filter((s) => istDate(anchor(s).occurred_at).slice(0, 7) === month);
  const total = sum(mine.map((s) => s.total_paise));

  const bySource = pcts(
    SOURCES.map((source) => ({
      source,
      paise: sum(mine.filter((s) => (s.source ?? 'other') === source).map((s) => s.total_paise)),
    })).filter((g) => g.paise !== 0),
  );

  const category = new Map((b.products ?? []).map((p) => [p.id, p.category || 'Other']));
  const linesOf = (id: string) => (b.lines ?? []).filter((l) => l.spend_id === id);
  const cats = new Map<string, number>();
  for (const s of mine) {
    // a reversal always mirrors the target's lines negated: its own would move a frozen month's
    // categories while the total still netted to zero
    const lines = s.reverses_id
      ? linesOf(s.reverses_id).map((l) => ({ ...l, line_total_paise: -l.line_total_paise }))
      : linesOf(s.id);
    const add = (key: string, paise: number) => cats.set(key, (cats.get(key) ?? 0) + paise);
    if (lines.length === 0) add('Other', s.total_paise); // unitemised: the whole spend
    else {
      for (const l of lines) add(l.product_id ? (category.get(l.product_id) ?? 'Other') : 'Other', l.line_total_paise);
      add('Other', s.total_paise - sum(lines.map((l) => l.line_total_paise))); // lines may not cover the total
    }
  }
  const byCategory = pcts(
    [...cats].map(([category, paise]) => ({ category, paise })).filter((g) => g.paise !== 0).sort((x, y) => y.paise - x.paise),
  );

  return {
    bySource,
    byCategory,
    fromPool: sum(mine.filter((s) => s.paid_from === 'pool').map((s) => s.total_paise)),
    ownPocket: sum(mine.filter((s) => s.paid_from === 'personal').map((s) => s.total_paise)),
    total,
  };
}
