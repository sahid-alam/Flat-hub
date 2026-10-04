import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { suggestedTopup } from '@/domain/kitty';
import { formatINR, parseRupees, upiAmount } from '@/domain/money';
import { useHousehold } from '@/lib/books';
import { newId } from '@/lib/id';
import { insertOnce } from '@/lib/supabase';
import { dateToTimestamp, today } from '@/lib/util';
import { AmountBlock } from '@/ui/capture';
import { Choice, DateField, ErrorText, Field, MagnetButton, Screen, SectionLabel, T } from '@/ui/kit';

const rupeesText = (paise: number) => upiAmount(paise).replace(/\.00$/, '');

/** Record a top-up for any mate (the treasurer often records them as UPI pings arrive). */
export default function RecordTopUp() {
  const { me, members, household, books, reload } = useHousehold();
  const [member, setMember] = useState(me.id);
  const [amount, setAmount] = useState(rupeesText(suggestedTopup(books, me.id)));
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [id] = useState(newId);
  const paise = parseRupees(amount);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await insertOnce('pool_entry', {
        id,
        household_id: household.id,
        kind: 'contribution',
        member_id: member,
        amount_paise: paise,
        occurred_at: date === today() ? new Date().toISOString() : dateToTimestamp(date),
        note: note.trim() || null,
      });
      await reload();
      router.back();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={{ gap: 8 }}>
        <SectionLabel>Who put in</SectionLabel>
        <Choice
          value={member}
          onChange={(m) => {
            setMember(m);
            setAmount(rupeesText(suggestedTopup(books, m)));
          }}
          options={members.map((m) => ({ value: m.id, label: m.id === me.id ? `${m.display_name} (me)` : m.display_name }))}
        />
      </View>
      {/* after the mate: picking one resets the amount to their suggestion */}
      <AmountBlock label="Amount put in" value={amount} onChangeText={setAmount} placeholder="2000" />
      <T size={15} soft>
        Suggested {formatINR(suggestedTopup(books, member))}: the monthly {formatINR(household.monthly_topup_paise)} less any credit.
      </T>
      <DateField label="Paid on" value={date} onChange={setDate} />
      <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="UPI ref, cash…" />
      <ErrorText error={error} />
      <MagnetButton
        label={busy ? 'Saving…' : paise ? `Record ${formatINR(paise)}` : 'Record'}
        color="brass"
        disabled={busy || !paise}
        onPress={save}
      />
    </Screen>
  );
}
