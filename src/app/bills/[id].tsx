// One bill: who paid it, what each mate's share is, and which shares are settled. The payer is the one
// who marks a share paid — the money arrives in their hand, so only they can say it did.
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { isSettled, owingOnBill, paidOnShare } from '@/domain/bills';
import { formatINR } from '@/domain/money';
import { useHousehold } from '@/lib/books';
import { newId } from '@/lib/id';
import { insertOnce } from '@/lib/supabase';
import { dayLabel, sayError } from '@/lib/util';
import { Block, Chip, ErrorText, Hero, MagnetButton, Rule, Screen, SectionLabel, T } from '@/ui/kit';

export default function BillDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { bills, billShares, billPayments, members, me, name, household, holder, reload } = useHousehold();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bill = bills.find((b) => b.id === id);
  if (!bill) return <Redirect href="/bills" />; // a stale deep link, or a bill from before this device synced

  const shares = billShares.filter((s) => s.bill_id === bill.id);
  const owing = owingOnBill(bill, billShares, billPayments);
  const mine = bill.paid_by === me.id;
  const left = Object.values(owing).reduce((a, p) => a + p, 0);

  async function markPaid(memberId: string, paise: number) {
    setBusy(memberId);
    setError(null);
    try {
      await insertOnce('bill_payment', {
        id: newId(),
        household_id: household.id,
        bill_id: bill!.id,
        member_id: memberId,
        paise,
      });
      await reload();
    } catch (e) {
      setError(sayError(e, holder?.display_name));
    }
    setBusy(null);
  }

  // the shares are a fixed list per bill, so the order is the mates' own alphabetical order
  const rows = shares
    .map((s) => ({ ...s, display: name(s.member_id) }))
    .sort((a, b) => a.display.localeCompare(b.display));

  return (
    <Screen>
      <Block tone="stone" style={{ gap: 6 }}>
        <SectionLabel>{bill.label}</SectionLabel>
        <Hero paise={bill.total_paise} size={56} />
        <T size={15} weight="600" soft>
          {dayLabel(bill.occurred_on)} · paid by {mine ? 'you' : name(bill.paid_by)}
        </T>
      </Block>

      <Block style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <SectionLabel>{rows.length} shares</SectionLabel>
          <T size={15} weight="700">
            {isSettled(bill, billShares, billPayments)
              ? 'All settled'
              : `${formatINR(left)} ${mine ? 'to get back' : 'left to settle'}`}
          </T>
        </View>
        <ErrorText error={error} />
        {rows.map((s, i) => {
          const isPayer = s.member_id === bill.paid_by;
          const done = !isPayer && paidOnShare(billPayments, bill.id, s.member_id) >= s.paise;
          return (
            <View key={s.member_id} style={{ gap: 10 }}>
              {i > 0 && <Rule />}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <T weight="600">
                    {s.member_id === me.id ? `${s.display} (you)` : s.display}
                  </T>
                  {isPayer ? (
                    <Chip kind="pool" label="Paid the bill" />
                  ) : done ? (
                    <Chip kind="reimbursed" label="Settled" />
                  ) : (
                    <Chip kind="pending" label={mine ? 'Not yet' : 'To pay'} />
                  )}
                </View>
                <T num size={20}>
                  {formatINR(s.paise)}
                </T>
              </View>
              {mine && !isPayer && !done && (
                <MagnetButton
                  label={busy === s.member_id ? 'Saving…' : `Mark ${s.display.split(' ')[0]}'s ${formatINR(s.paise)} paid`}
                  disabled={busy !== null}
                  onPress={() => markPaid(s.member_id, s.paise)}
                />
              )}
            </View>
          );
        })}
      </Block>

      {!mine && (
        <T size={15} soft>
          {name(bill.paid_by).split(' ')[0]} marks your share settled once you have handed it over.
        </T>
      )}
      {members.length !== rows.length && (
        <T size={13} soft>
          The shares are fixed as they were on {dayLabel(bill.occurred_on)}; the flat has changed since.
        </T>
      )}
    </Screen>
  );
}
