// Receipt / Zepto extraction: clean up what the LLM returned, and match lines to products.
// Pure TypeScript: no React, no Supabase. Money is integer paise.

import { linesBalance, SOURCES, type Source } from './kitty.ts';
import { formatINR, parseRupees } from './money.ts';

export type ExtractedLine = {
  name: string;
  qty: number;
  unit: string | null;
  line_total_paise: number;
  kind: 'item' | 'fee' | 'discount';
};
export type Extraction = {
  source: Source;
  store_name: string | null;
  total_paise: number;
  occurred_on: string | null;
  lines: ExtractedLine[];
};

const KINDS = ['item', 'fee', 'discount'] as const;
const LABEL = { item: 'Item', fee: 'Fee', discount: 'Discount' } as const;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Signed paise from a number or string. Integers are paise; fractions and "₹" strings are rupees.
 * ponytail: integer rupees in a paise field can't be told apart; the edge function's schema asks for paise,
 * and the balance check below catches mixed units. */
function toPaise(v: unknown): number | null {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null;
    return Number.isInteger(v) ? v : Math.round(v * 100);
  }
  if (typeof v !== 'string') return null;
  const t = v.trim();
  const neg = /^[-−]/.test(t);
  const body = t.replace(/^[-−]\s*/, '');
  let p: number | null;
  if (/[₹.]/.test(body)) p = parseRupees(body);
  else if (/^\d[\d,]*$/.test(body)) p = Number(body.replace(/,/g, ''));
  else return null;
  if (p === null) return /^[₹\s]*0+(\.0+)?$/.test(body) ? 0 : null;
  return neg ? -p : p;
}

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

export function normalizeExtraction(raw: unknown): { extraction: Extraction | null; problems: string[] } {
  if (!isObj(raw)) return { extraction: null, problems: ["Couldn't read anything from this bill."] };
  const problems: string[] = [];

  const lines: ExtractedLine[] = [];
  for (const l of Array.isArray(raw.lines) ? raw.lines : []) {
    if (!isObj(l)) continue;
    const amount = toPaise(l.line_total_paise);
    const name = text(l.name);
    if (amount === null && !name) continue; // empty line
    const kind: ExtractedLine['kind'] = KINDS.includes(l.kind as never)
      ? (l.kind as ExtractedLine['kind'])
      : (amount ?? 0) < 0
        ? 'discount'
        : 'item';
    const abs = Math.abs(amount ?? 0);
    if (kind !== 'item' && abs === 0) continue; // a ₹0 fee or discount means nothing (and the DB rejects a ₹0 discount)
    if (amount === null) problems.push(`"${name}" has no price.`);
    const qty = Number(l.qty);
    lines.push({
      name: name ?? LABEL[kind],
      qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
      unit: text(l.unit),
      line_total_paise: kind === 'discount' ? -abs : abs,
      kind,
    });
  }

  const linesSum = sum(lines.map((l) => l.line_total_paise));
  let total = toPaise(raw.total_paise);
  if (total === null || total <= 0) {
    if (linesSum <= 0) return { extraction: null, problems: ["Couldn't find a total or any priced lines on this bill."] };
    problems.push(`No total found, so using the lines' sum of ${formatINR(linesSum)}.`);
    total = linesSum;
  }
  if (!linesBalance(total, lines)) {
    problems.push(`lines add up to ${formatINR(linesSum)} but the total is ${formatINR(total)}`);
  }

  const on = text(raw.occurred_on);
  const occurred_on = on && /^\d{4}-\d{2}-\d{2}$/.test(on) && Number.isFinite(Date.parse(on)) ? on : null;
  const source = SOURCES.includes(raw.source as never) ? (raw.source as Extraction['source']) : 'other';

  return { extraction: { source, store_name: text(raw.store_name), total_paise: total, occurred_on, lines }, problems };
}

/**
 * The flat's share of a bill, once a mate's own lines are taken off it. The ₹480 of chips that rode
 * on the flat's ₹1,180 Blinkit order leaves both the lines AND the total, so the saved spend is the
 * ₹700 the flat actually owes and the kitty never sees the chips. The full bill is still kept, raw,
 * on `spend.extraction`.
 *
 * Invariant 1 survives: a bill whose lines summed to its total still balances afterwards, because
 * the same amount comes off both sides.
 */
export function flatShare<L extends { line_total_paise: number; mine?: boolean }>(
  totalPaise: number,
  lines: L[],
): { total_paise: number; lines: L[] } {
  const mine = sum(lines.filter((l) => l.mine).map((l) => l.line_total_paise));
  return { total_paise: totalPaise - mine, lines: lines.filter((l) => !l.mine) };
}

export type ProductLike = { id: string; name: string; aliases: string[] };

/** Lowercase words only, with pack sizes dropped: "Amul Butter (500 g) x2" → "amul butter". */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\bpack of \d+\b/g, ' ')
    .replace(/\b\d+(\.\d+)?\s*(kg|g|gm|gms|grams?|mg|ml|l|ltr|litres?|liters?|pcs?|pieces?|units?|n|x)\b/g, ' ')
    .replace(/\bx\s*\d+\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const tokens = (s: string): Set<string> => new Set(normalizeName(s).split(' ').filter(Boolean));

/** Exact normalized name or alias only. Safe to use without a confirm card. */
export function exactProduct<P extends ProductLike>(lineName: string, products: P[]): P | null {
  const key = normalizeName(lineName);
  if (!key) return null;
  return products.find((p) => [p.name, ...p.aliases].some((n) => normalizeName(n) === key)) ?? null;
}

/** Exact name/alias first, then the best word overlap (Jaccard ≥ 0.5). Null when nothing fits or two products tie.
 *  The fuzzy half is a guess, so only /import — which shows a confirm card — may use this. */
export function matchProduct<P extends ProductLike>(lineName: string, products: P[]): P | null {
  const key = normalizeName(lineName);
  if (!key) return null;
  const exact = exactProduct(lineName, products);
  if (exact) return exact;

  // ponytail: O(products × names) scan; fine for a flat's few hundred products.
  const line = tokens(lineName);
  let best: P | null = null;
  let bestScore = 0;
  let tie = false;
  for (const p of products) {
    let score = 0;
    for (const n of [p.name, ...p.aliases]) {
      const c = tokens(n);
      const shared = [...c].filter((t) => line.has(t)).length;
      score = Math.max(score, shared / (c.size + line.size - shared || 1));
    }
    if (score > bestScore) [best, bestScore, tie] = [p, score, false];
    else if (score === bestScore && score > 0) tie = true;
  }
  return bestScore >= 0.5 && !tie ? best : null;
}
