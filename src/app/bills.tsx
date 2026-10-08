// Bills: the cook, the electricity, the Wi-Fi. Whoever adds one pays the vendor, and the other five
// hand them their share. Deliberately not the kitty — nothing on this screen touches a pool entry.
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { View } from 'react-native';

import { isSettled, owingOnBill, toGetBack, toPay } from '@/domain/bills';
import { formatINR } from '@/domain/money';
import { useHousehold } from '@/lib/books';
import { dayLabel } from '@/lib/util';
import { Block, Chip, MagnetButton, Screen, SectionLabel, T } from '@/ui/kit';

export default function Bills() {
  const { bills, billShares, billPayments, me, name, reload } = useHousehold();
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const pay = toPay(bills, billShares, billPayments, me.id);
  const back = toGetBack(bills, billShares, billPayments, me.id);

  return (
    <Screen>
      <Block tone="stone" style={{ gap: 6 }}>
        <SectionLabel>Bills</SectionLabel>
        <View style={{ flexDirection: 'row', gap: 20, flexWrap: 'wrap' }}>
          <View style={{ gap: 2 }}>
            <T size={14} weight="700">
              Pay
            </T>
            <T num size={28}>
              {formatINR(pay)}
            </T>
          </View>
          <View style={{ gap: 2 }}>
            <T size={14} weight="700">
              Get back
            </T>
            <T num size={28}>
              {formatINR(back)}
            </T>
          </View>
        </View>
        <T size={13} weight="600" soft>
          Split equally between everyone in the flat. The kitty is separate.
        </T>
      </Block>

      <MagnetButton
        label="Add a bill"
        color="brass"
        icon={{ ios: 'plus', android: 'add' }}
        onPress={() => router.push('/bills/new')}
      />

      {bills.length === 0 && <T soft>No bills yet. Add the Wi-Fi, the electricity or the cook.</T>}

      {bills.map((b) => {
        const owing = owingOnBill(b, billShares, billPayments);
        // the words say which way the money goes, so the amount itself is never negative
        const mine = b.paid_by === me.id ? Object.values(owing).reduce((a, p) => a + p, 0) : (owing[me.id] ?? 0);
        const settled = isSettled(b, billShares, billPayments);
        return (
          <Block
            key={b.id}
            onPress={() => router.push(`/bills/${b.id}`)}
            accessibilityLabel={`${b.label}, ${formatINR(b.total_paise)}, paid by ${name(b.paid_by)}`}
            style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <T size={20} weight="700">
                  {b.label}
                </T>
                <T size={13} soft>
                  {dayLabel(b.occurred_on)} · paid by {b.paid_by === me.id ? 'you' : name(b.paid_by).split(' ')[0]}
                </T>
              </View>
              <T num size={24}>
                {formatINR(b.total_paise)}
              </T>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {settled ? (
                <Chip kind="reimbursed" label="All settled" />
              ) : (
                <>
                  <T size={15} weight="600" soft>
                    {b.paid_by === me.id ? 'Get back' : 'Pay'}
                  </T>
                  <T num size={18}>
                    {formatINR(mine)}
                  </T>
                </>
              )}
            </View>
          </Block>
        );
      })}
    </Screen>
  );
}
