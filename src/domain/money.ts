// Rupee formatting and parsing. Integer paise in, integer paise out.

/** ₹1,23,456.78 — Indian digit grouping (last three, then pairs). Paise shown only when non-zero unless `paise` is set. */
export function formatINR(paise: number, opts: { paise?: boolean; sign?: boolean } = {}): string {
  const neg = paise < 0;
  const abs = Math.abs(paise);
  const rupees = String(Math.floor(abs / 100));
  const p = abs % 100;
  const head = rupees.slice(0, -3).replace(/\B(?=(\d{2})+$)/g, ',');
  const grouped = head ? `${head},${rupees.slice(-3)}` : rupees;
  const frac = opts.paise || p ? `.${String(p).padStart(2, '0')}` : '';
  const sign = neg ? '−' : opts.sign && paise > 0 ? '+' : '';
  return `${sign}₹${grouped}${frac}`;
}

/** "2,011.77" / "30" / "₹ 45.5" → paise; null when it isn't a positive amount with at most 2 decimals. */
export function parseRupees(text: string): number | null {
  const t = text.replace(/[₹,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [r, f = ''] = t.split('.');
  const paise = Number(r) * 100 + Number(f.padEnd(2, '0'));
  return paise > 0 && Number.isSafeInteger(paise) ? paise : null;
}

/** UPI `am` parameter: rupees with exactly two decimals. */
export const upiAmount = (paise: number): string => `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, '0')}`;
