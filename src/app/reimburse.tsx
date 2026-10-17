import { useState } from 'react';
import { View } from 'react-native';

import { istDate, toReimburse, unreimbursed } from '@/domain/kitty';
import { formatINR } from '@/domain/money';
import { useHousehold } from '@/lib/books';
import { newId } from '@/lib/id';
import { insertOnce } from '@/lib/supabase';
import { dayLabel } from '@/lib/util';
import { SOURCE } from '@/ui/activity';
import { Block, Chip, ErrorText, MagnetButton, Rule, Screen, SectionLabel, T } from '@/ui/kit';
import { PayWithUpi } from '@/ui/pay';

/** Ansh's list: own-pocket spends the kitty still has to pay back. Only the treasurer can mark them paid. */
export default function ToReimburse() {
  const { spends, entries, members, household, books, holder, isTreasurer, reload } = useHousehold();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const owed = unreimbursed(spends, entries);
  const mates = members
    .filter((m) => owed.some((s) => s.paid_by === m.id))
    .sort((a, b) => a.display_name.localeCompare(b.display_name));

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
        <Block key={m.id}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <SectionLabel>Get back</SectionLabel>
              <T size={20} weight="700">
                {m.display_name}
              </T>
            </View>
            <T num size={28}>
              {formatINR(toReimburse(books, m.id))}
            </T>
          </View>
          {/* Send it all in one UPI payment, then mark each spend paid back below. */}
          {isTreasurer && <PayWithUpi to={m} paise={toReimburse(books, m.id)} note="FlatHub · paying back your spends" />}
          {owed
            .filter((s) => s.paid_by === m.id)
            .map((s) => (
              <View key={s.id} style={{ gap: 10 }}>
                <Rule />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <T weight="600">
                      {[SOURCE[s.source], s.store_name].filter(Boolean).join(' · ')}
                    </T>
                    <T size={13} soft>
                      {dayLabel(istDate(s.occurred_at))}
                    </T>
                    <Chip kind="pending" />
                  </View>
                  <T num size={20}>
                    {formatINR(s.total_paise)}
                  </T>
                </View>
                {isTreasurer && (
                  <MagnetButton
                    label={busy === s.id ? 'Saving…' : `Mark ${formatINR(s.total_paise)} paid back`}
                    color="brass"
                    disabled={busy !== null}
                    onPress={() => markPaid(s.id, m.id, s.total_paise)}
                  />
                )}
              </View>
            ))}
        </Block>
      ))}
    </Screen>
  );
}
