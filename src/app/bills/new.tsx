// Add a bill: a label, an amount and a date. The payer is always you — you are the one handing the
// money to the vendor — and the total splits equally between everyone in the flat on that date.
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { splitBill, splitMembers } from '@/domain/bills';
import { formatINR, parseRupees } from '@/domain/money';
import { useHousehold } from '@/lib/books';
import { newId } from '@/lib/id';
import { supabase } from '@/lib/supabase';
import { sayError, today } from '@/lib/util';
import { AmountBlock } from '@/ui/capture';
import { Choice, DateField, ErrorText, Field, MagnetButton, Screen, SectionLabel, T } from '@/ui/kit';

// The flat's three standing bills. They are only shortcuts into the label field; anything can be typed.
const USUAL = ['Wi-Fi', 'Electricity', 'Cook'];

export default function AddBill() {
  const { members, household, me, holder, reload } = useHousehold();
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [id] = useState(newId);

  const paise = parseRupees(amount);
  const sharing = splitMembers(members, date);
  // `sharing.length &&` is load-bearing: splitBill of nobody is allocate() with no weights, which
  // THROWS, and this line is the render body rather than the try/catch around save(). A bill dated
  // before everyone's joined_on — September's electricity, typed on the first evening Bills exists
  // — used to take the whole app down with it.
  const shares = paise && sharing.length ? splitBill(paise, sharing.map((m) => m.id)) : null;
  // The button says what is missing rather than sitting grey and silent (DESIGN.md rule 2).
  const blocker = !label.trim().length
    ? 'Name the bill first'
    : !paise
      ? 'Enter the amount'
      : !sharing.length
        ? 'Nobody was in the flat on that date'
        : null;

  async function save() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('add_bill', {
      p_bill: {
        id,
        household_id: household.id,
        label: label.trim(),
        total_paise: paise,
        paid_by: me.id,
        occurred_on: date,
      },
      p_shares: Object.entries(shares!).map(([member_id, p]) => ({ id: newId(), member_id, paise: p })),
    });
    if (error) {
      setError(sayError(error, holder?.display_name));
      setBusy(false);
      return;
    }
    await reload();
    router.back();
  }

  return (
    <Screen>
      <View style={{ gap: 8 }}>
        <SectionLabel>What for</SectionLabel>
        <Choice
          value={USUAL.includes(label) ? label : ''}
          onChange={setLabel}
          label="What the bill is for"
          options={USUAL.map((u) => ({ value: u, label: u }))}
        />
      </View>
      <Field label="Label" value={label} onChangeText={setLabel} placeholder="Wi-Fi" />
      <AmountBlock label="Bill amount" value={amount} onChangeText={setAmount} placeholder="600" />
      <DateField label="Billed on" value={date} onChange={setDate} />
      <T size={15} soft>
        {shares
          ? `${sharing.length} ${sharing.length === 1 ? 'mate' : 'mates'} · ${formatINR(
              Math.max(...Object.values(shares)),
            )} each. You pay the bill; everyone else pays you back.`
          : 'Splits equally between everyone in the flat on that date. You pay the bill; everyone else pays you back.'}
      </T>
      <ErrorText error={error} />
      <MagnetButton
        label={busy ? 'Saving…' : (blocker ?? `Add ${formatINR(paise!)} bill`)}
        color="brass"
        disabled={busy || blocker !== null}
        onPress={save}
      />
    </Screen>
  );
}
