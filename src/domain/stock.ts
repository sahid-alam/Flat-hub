// Stock, fridge and shopping-list maths. Pure TypeScript: no React, no Supabase.
// Quantities are in the product's base unit (g | ml | pc); stock_move is append-only, so every Σ is a plain sum.
// FEFO order and the shopping-list rule: docs/DATA_MODEL.md ("Stock & fridge").

import { istDate } from './kitty.ts';

export type Lot = {
  id: string;
  product_id: string;
  location: 'fridge' | 'freezer' | 'pantry';
  expiry_date: string | null;
  opened: boolean;
  received_at: string;
};
export type Move = { lot_id: string; delta_qty: number };
export type Uom = { product_id: string; unit: string; factor_to_base: number };
export type StockProduct = { id: string; name: string; track_stock: boolean; min_qty: number | null };
export type ManualItem = { product_id: string | null; name: string; done_at: string | null };
export type ShortItem = { product_id: string | null; name: string; have: number; min: number | null; source: 'low' | 'manual' };

const DAY = 86_400_000;
const dayNo = (date: string): number => Date.parse(date + 'T00:00:00Z') / DAY;
/** Accepts a date or a full timestamp, so callers can pass new Date().toISOString(). */
const today = (t: string): string => (t.length > 10 ? istDate(t) : t);
/** numeric(12,3) in the DB: round the float sum back to 3 dp so 0.3 − 0.1 − 0.2 is exactly 0. */
const round3 = (n: number): number => Math.round(n * 1000) / 1000 + 0; // + 0 turns -0 into 0

/** On-hand quantity of a lot in base units = Σ delta_qty. */
export function onHand(lotId: string, moves: Move[]): number {
  return round3(moves.reduce((a, m) => (m.lot_id === lotId ? a + m.delta_qty : a), 0));
}

export const isEmpty = (lotId: string, moves: Move[]): boolean => onHand(lotId, moves) <= 0;

/** First-expired, first-out: opened DESC, expiry_date ASC NULLS LAST, received_at ASC. Does not mutate the input. */
export function fefo<L extends Lot>(lots: L[]): L[] {
  return [...lots].sort(
    (a, b) =>
      Number(b.opened) - Number(a.opened) ||
      (a.expiry_date === b.expiry_date ? 0 : a.expiry_date === null ? 1 : b.expiry_date === null ? -1 : a.expiry_date < b.expiry_date ? -1 : 1) ||
      Date.parse(a.received_at) - Date.parse(b.received_at),
  );
}

/** Unopened lots that expire before an already-opened lot of the same product: open those first. */
export function staleWarning<L extends Lot>(lots: L[]): L[] {
  const openedFirstExpiry = new Map<string, string>();
  for (const l of lots) {
    if (!l.opened || l.expiry_date === null) continue;
    const seen = openedFirstExpiry.get(l.product_id);
    if (seen === undefined || l.expiry_date < seen) openedFirstExpiry.set(l.product_id, l.expiry_date);
  }
  return lots.filter((l) => {
    const opened = openedFirstExpiry.get(l.product_id);
    return !l.opened && l.expiry_date !== null && opened !== undefined && l.expiry_date < opened;
  });
}

/** Days until expiry; negative once expired, null when the lot has no expiry date. */
export function daysLeft(expiry: string | null, now: string): number | null {
  return expiry === null ? null : dayNo(expiry) - dayNo(today(now));
}

/** Lots due within `days` — already-expired lots included, so the fridge can shout about them. */
export function expiringSoon<L extends Lot>(lots: L[], now: string, days: number): L[] {
  return lots.filter((l) => {
    const d = daysLeft(l.expiry_date, now);
    return d !== null && d <= days;
  });
}

/** Convert a purchase quantity to the product's base unit. null when that unit isn't mapped for the product. */
export function toBase(qty: number, unit: string, productId: string, uoms: Uom[]): number | null {
  const u = uoms.find((x) => x.product_id === productId && x.unit === unit);
  return u ? round3(qty * u.factor_to_base) : null;
}

/** Manual rows still to buy, then tracked products below min_qty (by name). A product in both appears once, as manual. */
export function shoppingList(
  products: StockProduct[],
  lots: Lot[],
  moves: Move[],
  manual: ManualItem[],
  opts: object = {}, // ponytail: the contract reserves opts; nothing needs a knob yet
): ShortItem[] {
  void opts;
  const byId = new Map(products.map((p) => [p.id, p]));
  // over-consumed lots can go negative; they are empty, not a debt against the rest
  const have = (productId: string): number =>
    round3(lots.filter((l) => l.product_id === productId).reduce((a, l) => a + Math.max(0, onHand(l.id, moves)), 0));

  const manualRows: ShortItem[] = manual
    .filter((m) => !m.done_at)
    .map((m) => {
      const p = m.product_id ? byId.get(m.product_id) : undefined;
      return { product_id: m.product_id, name: m.name, have: p ? have(p.id) : 0, min: p?.min_qty ?? null, source: 'manual' as const };
    });
  const claimed = new Set(manualRows.map((r) => r.product_id));

  const lowRows: ShortItem[] = products
    .filter((p) => p.track_stock && p.min_qty !== null && !claimed.has(p.id) && have(p.id) < p.min_qty)
    .map((p) => ({ product_id: p.id, name: p.name, have: have(p.id), min: p.min_qty, source: 'low' as const }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return [...manualRows, ...lowRows];
}

export type BaseUnit = 'g' | 'ml' | 'pc';

/** Nobody says "keep at least 2000 g of atta". g/ml are stored; kg/L/pc are what a mate types. */
export const minUnit = (base: BaseUnit): 'kg' | 'L' | 'pc' => (base === 'g' ? 'kg' : base === 'ml' ? 'L' : 'pc');

/** "2" kg → 2000 g. null when it isn't a minimum: blank, zero, negative, or not a number. */
export function parseMinQty(text: string, base: BaseUnit): number | null {
  const t = text.replace(/[\s,]/g, '');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const qty = round3(Number(t) * (base === 'pc' ? 1 : 1000));
  // pieces are counted, not measured: "half a tray of eggs" is not a minimum anyone can act on
  if (base === 'pc' && !Number.isInteger(qty)) return null;
  return qty > 0 && Number.isFinite(qty) ? qty : null;
}

/** The inverse, for the editor's field: 2000 g → "2". null — no minimum — is an empty field. */
export function showMinQty(qty: number | null, base: BaseUnit): string {
  return qty === null ? '' : String(+(base === 'pc' ? qty : qty / 1000).toFixed(3));
}

/**
 * What this product was last put away as, in base units — the sum of the positive moves on its
 * newest lot. A manual spend line carries no unit ("milk, 1"), so without this the sheet would
 * open 1 ml of milk; the previous 1 L pack is the better guess. null when the product is new.
 */
export function lastPackSize(productId: string, lots: Lot[], moves: Move[]): number | null {
  const newest = lots
    .filter((l) => l.product_id === productId)
    .sort((a, b) => (a.received_at < b.received_at ? 1 : a.received_at > b.received_at ? -1 : 0))[0];
  if (!newest) return null;
  const put = round3(moves.reduce((a, m) => (m.lot_id === newest.id && m.delta_qty > 0 ? a + m.delta_qty : a), 0));
  return put > 0 ? put : null;
}
