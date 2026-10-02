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
};
export type SpendLine = { line_total_paise: number; kind: 'item' | 'fee' | 'discount' };
export type PoolEntry = {
  kind: 'contribution' | 'reimbursement';
  member_id: string;
  amount_paise: number;
  reverses_id: string | null;
  spend_id?: string | null; // reimbursement: the own-pocket spend it pays back
};
export type Books = {
  members: Member[];
  absences: Absence[];
  spends: Spend[];
  entries: PoolEntry[];
  monthlyTopupPaise: number;
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

/** Spend per IST month; a reversal counts in its target's month so it nets to zero. */
function spendByMonth(spends: Spend[]): Map<string, number> {
  const byId = new Map(spends.map((s) => [s.id, s]));
  const months = new Map<string, number>();
  for (const s of spends) {
    const anchor = s.reverses_id ? (byId.get(s.reverses_id) ?? s) : s;
    const month = istDate(anchor.occurred_at).slice(0, 7);
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
