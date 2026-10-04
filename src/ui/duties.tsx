// What the duty screens and the home row share: the flat's anchor date, today's instances, and
// cadence in words. The rules themselves live in src/domain/duties.ts.
import { useMemo } from 'react';

import { rota, type Duty } from '@/domain/duties';
import { istDate } from '@/domain/kitty';
import { useHousehold } from '@/lib/books';
import { today } from '@/lib/util';

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Every day", "Every 3 days", "Mon, Thu". */
export function cadenceLabel(d: Duty): string {
  if (d.weekdays) {
    if (d.weekdays.length === 7) return 'Every day';
    return d.weekdays.length ? [...d.weekdays].sort().map((n) => WD[n]).join(', ') : 'No day picked';
  }
  return d.every_days === 1 ? 'Every day' : `Every ${d.every_days} days`;
}

/** An instance is still open while nobody has recorded a done or a skip; a swap only moves it. */
export const isOpen = (outcome: 'done' | 'skipped' | 'swapped' | null) => outcome === null || outcome === 'swapped';

export function useDuties() {
  const h = useHousehold();
  // ponytail: one anchor for the whole flat, the oldest duty's created date. Every-N phase is then
  // counted from that date rather than each duty's own, and a duty added mid-window picks up fair
  // share for days before it existed — the same inflation for everyone, so the order never moves.
  // Per-duty anchors would need domain/duties.ts to read created_at.
  const anchor = h.duties.reduce((a, d) => (istDate(d.created_at) < a ? istDate(d.created_at) : a), today());
  const todays = useMemo(
    () => rota(h.duties, h.members, h.absences, h.choreEvents, today(), 1, anchor),
    [h.duties, h.members, h.absences, h.choreEvents, anchor],
  );
  return { ...h, anchor, todays };
}
