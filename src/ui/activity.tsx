import { Pressable, View } from 'react-native';

import { formatINR } from '@/domain/money';
import { useHousehold, type EntryRow, type SpendRow } from '@/lib/books';
import { newId } from '@/lib/id';
import { insertOnce } from '@/lib/supabase';
import { confirm, dayLabel } from '@/lib/util';
import { istDate } from '@/domain/kitty';
import { Magnet, T, usePalette, type Palette } from '@/ui/kit';

export type Item = { at: string; spend?: SpendRow; entry?: EntryRow };

export const SOURCE: Record<SpendRow['source'], string> = { zepto: 'Zepto', local: 'Local', other: 'Other' };

/** Spends and pool entries, newest first, as one feed. */
export function feed(spends: SpendRow[], entries: EntryRow[]): Item[] {
  return [
    ...spends.map((spend) => ({ at: spend.occurred_at, spend })),
    ...entries.map((entry) => ({ at: entry.occurred_at, entry })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));
}

/** One slip on the door. Long-press an original to reverse it (ledgers are never edited). */
export function ActivitySlip({ item, onChanged, readOnly }: { item: Item; onChanged?: () => void; readOnly?: boolean }) {
  const c = usePalette();
  const { name, spends, entries, lines, household } = useHousehold();
  const reversedIds = new Set([...spends, ...entries].map((r) => r.reverses_id).filter(Boolean));

  let magnet: keyof Palette, title: string, sub: string, amount: string;
  const row = item.spend ?? item.entry!;
  const isReversal = !!row.reverses_id;
  const isReversed = reversedIds.has(row.id);
  if (item.spend) {
    const s = item.spend;
    magnet = 'tomato';
    title = [SOURCE[s.source], s.store_name].filter(Boolean).join(' · ');
    sub = `${name(s.paid_by)} · ${s.paid_from === 'pool' ? 'from the kitty' : 'own pocket'}`;
    amount = formatINR(Math.abs(s.total_paise));
  } else {
    const e = item.entry!;
    magnet = e.kind === 'contribution' ? 'green' : 'blue';
    title = e.kind === 'contribution' ? `${name(e.member_id)} put in` : `Paid back ${name(e.member_id)}`;
    sub = e.note ?? (e.kind === 'contribution' ? 'top-up' : 'reimbursed');
    amount = formatINR(Math.abs(e.amount_paise));
  }
  if (isReversal) title = `Reversed: ${title}`;

  async function reverse() {
    if (readOnly || isReversal || isReversed) return;
    const ok = await confirm('Reverse this entry?', `${title}, ${amount}. A reversing entry is added; nothing is deleted.`, 'Reverse');
    if (!ok) return;
    if (item.spend) {
      const s = item.spend;
      await insertOnce('spend', {
        id: newId(),
        household_id: household.id,
        source: s.source,
        store_name: s.store_name,
        paid_by: s.paid_by,
        paid_from: s.paid_from,
        total_paise: -s.total_paise,
        reverses_id: s.id,
      });
    } else {
      const e = item.entry!;
      await insertOnce('pool_entry', {
        id: newId(),
        household_id: household.id,
        kind: e.kind,
        member_id: e.member_id,
        amount_paise: -e.amount_paise,
        spend_id: e.spend_id,
        reverses_id: e.id,
      });
    }
    onChanged?.();
  }

  const struck = isReversed || isReversal;
  return (
    <Pressable
      onLongPress={reverse}
      accessibilityHint={readOnly || isReversal || isReversed ? undefined : 'Long-press to reverse'}
      style={({ pressed }) => [
        { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 60, paddingVertical: 8 },
        pressed && { opacity: 0.7 },
      ]}>
      <Magnet color={struck ? c.rule : c[magnet]} />
      <View style={{ flex: 1 }}>
        <T weight="600" numberOfLines={1} color={struck ? c.inkSoft : undefined}>
          {title}
        </T>
        <T size={15} soft numberOfLines={1}>
          {dayLabel(istDate(item.at))} · {sub}
          {isReversed ? ' · reversed' : ''}
        </T>
        {readOnly && item.spend && (
          <T size={13} soft>
            {lines
              .filter((l) => l.spend_id === item.spend!.id)
              .map((l) => `${l.name} ${formatINR(l.line_total_paise)}`)
              .join(' · ')}
          </T>
        )}
      </View>
      <T
        weight="700"
        color={struck ? c.inkSoft : c[magnet]}
        style={struck ? { textDecorationLine: 'line-through' } : undefined}>
        {amount}
      </T>
    </Pressable>
  );
}
