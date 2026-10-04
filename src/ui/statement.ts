import type { EntryRow, SpendRow } from '@/lib/books';
import { monthOf, thisMonth } from '@/lib/util';
import type { BlockTone } from '@/ui/kit';

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
export const monthName = (month: string): string => MONTH_NAMES[Number(month.slice(5)) - 1];

/** A month's spends and pool entries. A reversal belongs to its target's month, exactly as the share maths allocates it. */
export function monthRows(spends: SpendRow[], entries: EntryRow[], month: string) {
  const byId = new Map(spends.map((s) => [s.id, s]));
  const anchor = (s: SpendRow) => monthOf((s.reverses_id ? (byId.get(s.reverses_id) ?? s) : s).occurred_at);
  const monthSpends = spends.filter((s) => anchor(s) === month);
  const monthEntries = entries.filter((e) => monthOf(e.occurred_at) === month);
  return { monthSpends, monthEntries, spent: monthSpends.reduce((a, s) => a + s.total_paise, 0) };
}

const index = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1;
const TONES: BlockTone[] = ['stone', 'brass', 'raised'];
/** Card fill by months back from now, so the list and the opened month agree. */
export const toneFor = (month: string): BlockTone => TONES[(((index(thisMonth()) - index(month)) % 3) + 3) % 3];
export const statusFor = (month: string): string => (month >= thisMonth() ? 'provisional' : 'closed');
export const daysIn = (month: string): number => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate();
