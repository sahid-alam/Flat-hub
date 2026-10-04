import { Pressable, View } from 'react-native';

import { istDate, unreimbursed } from '@/domain/kitty';
import { formatINR } from '@/domain/money';
import { useHousehold, type EntryRow, type SpendRow } from '@/lib/books';
import { newId } from '@/lib/id';
import { insertOnce } from '@/lib/supabase';
import { confirm, dayLabel } from '@/lib/util';
import { Chip, T, usePalette, type ChipKind } from '@/ui/kit';

export type Item = { at: string; spend?: SpendRow; entry?: EntryRow };

export const SOURCE: Record<SpendRow['source'], string> = { zepto: 'Zepto', local: 'Local', other: 'Other' };

/** Spends and pool entries, newest first, as one feed. */
export function feed(spends: SpendRow[], entries: EntryRow[]): Item[] {
  return [
    ...spends.map((spend) => ({ at: spend.occurred_at, spend })),
    ...entries.map((entry) => ({ at: entry.occurred_at, entry })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));
}

type SpendBits = Pick<SpendRow, 'id' | 'source' | 'store_name' | 'paid_by' | 'paid_from' | 'total_paise'>;

/** Reverse a spend: a new row with the negated total (ledgers are never edited). A retry is a no-op (reverses_id is unique). */
export async function reverseSpend(s: SpendBits, householdId: string) {
  await insertOnce('spend', {
    id: newId(),
    household_id: householdId,
    source: s.source,
    store_name: s.store_name,
    paid_by: s.paid_by,
    paid_from: s.paid_from,
    total_paise: -s.total_paise,
    reverses_id: s.id,
  });
}

/** One entry in a feed. Long-press an original to reverse it. */
export function ActivitySlip({ item, onChanged, readOnly }: { item: Item; onChanged?: () => void; readOnly?: boolean }) {
  const c = usePalette();
  const { name, spends, entries, lines, household } = useHousehold();
  const reversedIds = new Set([...spends, ...entries].map((r) => r.reverses_id).filter(Boolean));

  let title: string, sub: string, chip: ChipKind | null = null;
  const row = item.spend ?? item.entry!;
  const isReversal = !!row.reverses_id;
  const isReversed = reversedIds.has(row.id);
  const struck = isReversed || isReversal;
  if (item.spend) {
    const s = item.spend;
    title = [SOURCE[s.source], s.store_name].filter(Boolean).join(' · ');
    sub = name(s.paid_by);
    if (!struck) chip = s.paid_from === 'pool' ? 'pool' : unreimbursed([s], entries).length ? 'pending' : 'reimbursed';
    else sub += s.paid_from === 'pool' ? ' · from the kitty' : ' · own pocket';
  } else {
    const e = item.entry!;
    title = e.kind === 'contribution' ? `${name(e.member_id)} put in` : `Paid back ${name(e.member_id)}`;
    sub = e.note ?? (e.kind === 'contribution' ? 'top-up' : 'reimbursed');
  }
  if (isReversal) title = `Reversed: ${title}`;
  const paise = item.spend?.total_paise ?? item.entry!.amount_paise;
  const amount = formatINR(Math.abs(paise));

  async function reverse() {
    if (readOnly || struck) return;
    const ok = await confirm('Reverse this entry?', `${title}, ${amount}. A reversing entry is added; nothing is deleted.`, 'Reverse');
    if (!ok) return;
    if (item.spend) await reverseSpend(item.spend, household.id);
    else {
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

  return (
    <Pressable
      onLongPress={reverse}
      accessibilityHint={readOnly || struck ? undefined : 'Long-press to reverse'}
      style={({ pressed }) => [
        { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 8 },
        pressed && { opacity: 0.7 },
      ]}>
      <View style={{ flex: 1, gap: 4 }}>
        <T weight="700" numberOfLines={1} color={struck ? c.muted : undefined}>
          {title}
        </T>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {chip && <Chip kind={chip} />}
          <T size={13} soft numberOfLines={1} style={{ flexShrink: 1 }}>
            {dayLabel(istDate(item.at))} · {sub}
            {isReversed ? ' · reversed' : ''}
          </T>
        </View>
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
        num
        size={20}
        color={isReversal ? c.negative : isReversed ? c.muted : undefined}
        style={isReversed ? { textDecorationLine: 'line-through' } : undefined}>
        {isReversal ? `−${amount}` : amount}
      </T>
    </Pressable>
  );
}
