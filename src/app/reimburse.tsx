import { useState } from 'react';
import { View } from 'react-native';

import { istDate, toReimburse, unreimbursed } from '@/domain/kitty';
import { formatINR } from '@/domain/money';
import { useHousehold } from '@/lib/books';
import { newId } from '@/lib/id';
import { insertOnce } from '@/lib/supabase';
import { dayLabel } from '@/lib/util';
import { SOURCE } from '@/ui/activity';
import { ErrorText, MagnetButton, Rule, Screen, Slip, T, usePalette } from '@/ui/kit';

/** Ansh's list: own-pocket spends the kitty still owes back. Only the treasurer can mark them paid. */
export default function ToReimburse() {
  const c = usePalette();
  const { spends, entries, members, household, books, holder, isTreasurer, reload } = useHousehold();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const owed = unreimbursed(spends, entries);
  const mates = members.filter((m) => owed.some((s) => s.paid_by === m.id));

  async function markPaid(spendId: string, memberId: string, paise: number) {
    setBusy(spendId);
    setError(null);
    try {
      await insertOnce('pool_entry', {
        id: newId(),
        household_id: household.id,
        kind: 'reimbursement',
        member_id: memberId,
        amount_paise: paise,
        spend_id: spendId,
      });
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }

  return (
    <Screen>
      {!isTreasurer && (
        <T soft>{holder?.display_name ?? 'The treasurer'} marks these paid once the money is sent back.</T>
      )}
      <ErrorText error={error} />
      {mates.length === 0 && <T soft>Nothing to pay back. Everyone's square.</T>}
      {mates.map((m) => (
        <Slip key={m.id} magnet="blue">
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <T size={20} weight="700">
              {m.display_name}
            </T>
            <T size={20} weight="700" color={c.blue}>
              {formatINR(toReimburse(books, m.id))}
            </T>
          </View>
          {owed
            .filter((s) => s.paid_by === m.id)
            .map((s, i) => (
              <View key={s.id} style={{ gap: 8 }}>
                {i > 0 && <Rule />}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <T>
                    {[SOURCE[s.source], s.store_name].filter(Boolean).join(' · ')} · {dayLabel(istDate(s.occurred_at))}
                  </T>
                  <T weight="600">{formatINR(s.total_paise)}</T>
                </View>
                {isTreasurer && (
                  <MagnetButton
                    label={busy === s.id ? 'Saving…' : `Mark ${formatINR(s.total_paise)} paid back`}
                    color="blue"
                    outline
                    disabled={busy !== null}
                    onPress={() => markPaid(s.id, m.id, s.total_paise)}
                  />
                )}
              </View>
            ))}
        </Slip>
      ))}
    </Screen>
  );
}
