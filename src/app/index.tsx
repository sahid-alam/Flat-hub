import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { poolCash, position, suggestedTopup, unreimbursed } from '@/domain/kitty';
import { formatINR, parseRupees, upiAmount } from '@/domain/money';
import { useHousehold } from '@/lib/books';
import { newId } from '@/lib/id';
import { insertOnce } from '@/lib/supabase';
import { monthLabel, monthOf, thisMonth } from '@/lib/util';
import { ActivitySlip, feed } from '@/ui/activity';
import {
  DISPLAY,
  ErrorText,
  Field,
  Icon,
  MagnetButton,
  MagnetNumerals,
  Position,
  Row,
  Rule,
  Screen,
  Slip,
  T,
  usePalette,
} from '@/ui/kit';

export default function KittyHome() {
  const c = usePalette();
  const h = useHousehold();
  const { books, me, holder, isTreasurer, entries, spends, household, reload } = h;
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const month = thisMonth();
  const paidThisMonth =
    entries
      .filter((e) => e.kind === 'contribution' && e.member_id === me.id && monthOf(e.occurred_at) === month)
      .reduce((a, e) => a + e.amount_paise, 0) > 0;
  const mine = position(books, me.id);
  const owed = unreimbursed(spends, entries);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.enamel }}>
      <Screen>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <T size={17} weight="600" soft>
            {household.name}
          </T>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mates"
            onPress={() => router.push('/mates')}
            style={{ minWidth: 48, minHeight: 48, alignItems: 'flex-end', justifyContent: 'center' }}>
            <Icon name={{ ios: 'person.2', android: 'group' }} size={24} />
          </Pressable>
        </View>

        <View style={{ gap: 2 }}>
          <MagnetNumerals paise={poolCash(books)} />
          <T size={19} weight="600">
            in the kitty
          </T>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 6 }}>
            <T soft>You</T>
            <Position paise={mine} />
            <T soft>{mine > 0 ? '· the kitty owes you' : mine < 0 ? '· due at your next top-up' : '· all square'}</T>
          </View>
        </View>

        {!paidThisMonth && (
          <TopUpCard
            key={suggestedTopup(books, me.id)}
            suggested={suggestedTopup(books, me.id)}
            holderName={holder?.display_name ?? 'the treasurer'}
            vpa={holder?.upi_vpa ?? null}
            self={isTreasurer}
            month={month}
            onRecord={async (paise) => {
              await insertOnce('pool_entry', {
                id: newId(),
                household_id: household.id,
                kind: 'contribution',
                member_id: me.id,
                amount_paise: paise,
                note: `${monthLabel(month)} top-up`,
              });
              await reload();
            }}
          />
        )}

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <MagnetButton
              label="Spend"
              color="tomato"
              icon={{ ios: 'plus', android: 'add' }}
              onPress={() => router.push('/spend')}
            />
          </View>
          <View style={{ flex: 1 }}>
            <MagnetButton
              label="Top-up"
              color="green"
              icon={{ ios: 'plus', android: 'add' }}
              onPress={() => router.push('/topup')}
            />
          </View>
        </View>

        <Slip>
          <Row label="Away" icon={{ ios: 'airplane', android: 'flight' }} onPress={() => router.push('/away')} />
          <Rule />
          <Row
            label="To reimburse"
            icon={{ ios: 'arrow.uturn.left', android: 'undo' }}
            detail={owed.length ? `${owed.length} · ${formatINR(owed.reduce((a, s) => a + s.total_paise, 0))}` : 'none'}
            onPress={() => router.push('/reimburse')}
          />
          <Rule />
          <Row
            label={`Statement · ${monthLabel(month)}`}
            icon={{ ios: 'doc.text', android: 'description' }}
            onPress={() => router.push('/statement')}
          />
        </Slip>

        <View style={{ gap: 4 }}>
          <T size={22} style={{ fontFamily: DISPLAY, lineHeight: 28 }}>
            On the door
          </T>
          {spends.length + entries.length === 0 ? (
            <T soft>Nothing yet. Add the first spend or top-up.</T>
          ) : (
            <>
              {feed(spends, entries)
                .slice(0, 8)
                .map((item) => (
                  <ActivitySlip key={(item.spend ?? item.entry)!.id} item={item} onChanged={reload} />
                ))}
              <T size={13} soft>
                Long-press an entry to reverse it.
              </T>
            </>
          )}
        </View>
      </Screen>
    </SafeAreaView>
  );
}

function TopUpCard({
  suggested,
  holderName,
  vpa,
  self,
  month,
  onRecord,
}: {
  suggested: number;
  holderName: string;
  vpa: string | null;
  self: boolean;
  month: string;
  onRecord: (paise: number) => Promise<void>;
}) {
  const [text, setText] = useState(upiAmount(suggested).replace(/\.00$/, ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paise = parseRupees(text);
  const first = holderName.split(' ')[0];

  if (suggested === 0)
    return (
      <Slip magnet="green">
        <T weight="600">You're covered for {monthLabel(month)}.</T>
        <T soft>Your credit in the kitty is more than this month's top-up.</T>
      </Slip>
    );

  const upi =
    vpa && paise
      ? `upi://pay?pa=${vpa}&pn=${encodeURIComponent(holderName)}&am=${upiAmount(paise)}&cu=INR&tn=${encodeURIComponent(`FlatHub kitty ${monthLabel(month)}`)}`
      : null;

  return (
    <Slip magnet="green">
      <T size={22} style={{ fontFamily: DISPLAY, lineHeight: 28 }}>
        {self ? `Put in your ${formatINR(paise ?? suggested)}` : `Top up ${formatINR(paise ?? suggested)} to ${first}`}
      </T>
      <Field
        label={`${monthLabel(month)} top-up (₹)`}
        value={text}
        onChangeText={setText}
        keyboardType="decimal-pad"
        accessibilityHint="Edit if you're paying a different amount"
      />
      {!self &&
        (upi ? (
          <MagnetButton
            label="Pay with UPI"
            color="green"
            icon={{ ios: 'indianrupeesign', android: 'currency_rupee' }}
            onPress={() => Linking.openURL(upi).catch(() => setError('No UPI app found on this phone.'))}
          />
        ) : (
          <T size={15} soft>
            {first} hasn't added a UPI ID yet (Mates → your UPI ID).
          </T>
        ))}
      <MagnetButton
        label={busy ? 'Saving…' : self ? 'Record my top-up' : "I've paid, record it"}
        color="green"
        outline
        disabled={!paise || busy}
        onPress={async () => {
          setBusy(true);
          setError(null);
          try {
            await onRecord(paise!);
          } catch (e) {
            setError((e as Error).message);
          }
          setBusy(false);
        }}
      />
      <ErrorText error={error} />
    </Slip>
  );
}
