import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { linesBalance } from '@/domain/kitty';
import { formatINR, parseRupees } from '@/domain/money';
import { useHousehold, type SpendRow } from '@/lib/books';
import { newId } from '@/lib/id';
import { supabase } from '@/lib/supabase';
import { Choice, ErrorText, Field, Icon, MagnetButton, Screen, Slip, T, usePalette } from '@/ui/kit';

type Kind = 'item' | 'fee' | 'discount';
type Line = { id: string; name: string; amount: string; kind: Kind };

export default function AddSpend() {
  const c = usePalette();
  const { me, members, household, reload } = useHousehold();
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState<SpendRow['source']>('local');
  const [store, setStore] = useState('');
  const [paidBy, setPaidBy] = useState(me.id);
  const [paidFrom, setPaidFrom] = useState<'pool' | 'personal'>('pool');
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [id] = useState(newId); // one id per form: a retried save is a no-op

  const total = parseRupees(amount);
  // discounts are typed as positive amounts and stored negative
  const parsed = lines.map((l) => {
    const p = parseRupees(l.amount);
    return { ...l, paise: p === null ? null : l.kind === 'discount' ? -p : p };
  });
  const linesValid = parsed.every((l) => l.paise !== null && l.name.trim());
  const linesTotal = parsed.reduce((a, l) => a + (l.paise ?? 0), 0);
  const balanced = total !== null && linesValid && linesBalance(total, parsed.map((l) => ({ line_total_paise: l.paise!, kind: l.kind })));

  const update = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (i === j ? { ...l, ...patch } : l)));

  async function save() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('add_spend', {
      p_spend: {
        id,
        household_id: household.id,
        source,
        store_name: store.trim() || null,
        paid_by: paidBy,
        paid_from: paidFrom,
        total_paise: total,
      },
      p_lines: parsed.map((l) => ({ id: l.id, name: l.name.trim(), line_total_paise: l.paise, kind: l.kind })),
    });
    setBusy(false);
    if (error) return setError(error.message);
    await reload();
    router.back();
  }

  return (
    <Screen>
      <Field label="Amount paid (₹)" big autoFocus value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" />

      <View style={{ gap: 8 }}>
        <T size={15} weight="600" soft>
          Where from
        </T>
        <Choice
          value={source}
          onChange={setSource}
          options={[
            { value: 'local', label: 'Local' },
            { value: 'zepto', label: 'Zepto' },
            { value: 'other', label: 'Other' },
          ]}
        />
      </View>
      {source !== 'zepto' && (
        <Field label="Store (optional)" value={store} onChangeText={setStore} placeholder="Sharma Dairy" />
      )}

      <View style={{ gap: 8 }}>
        <T size={15} weight="600" soft>
          Paid by
        </T>
        <Choice
          value={paidBy}
          onChange={setPaidBy}
          options={members.map((m) => ({ value: m.id, label: m.id === me.id ? `${m.display_name} (me)` : m.display_name }))}
        />
      </View>

      <View style={{ gap: 8 }}>
        <T size={15} weight="600" soft>
          Paid from
        </T>
        <Choice
          value={paidFrom}
          onChange={setPaidFrom}
          options={[
            { value: 'pool', label: 'The kitty' },
            { value: 'personal', label: 'Own pocket' },
          ]}
        />
        {paidFrom === 'personal' && (
          <T size={15} soft>
            It goes on the treasurer's "to reimburse" list until it's paid back.
          </T>
        )}
      </View>

      <Slip>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <T weight="600">Lines (optional)</T>
          {lines.length > 0 && total !== null && (
            <T size={15} weight="600" color={balanced ? c.green : c.tomato}>
              {balanced ? 'Adds up' : `${formatINR(linesTotal)} of ${formatINR(total)}`}
            </T>
          )}
        </View>
        {lines.map((l, i) => (
          <View key={l.id} style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
              <View style={{ flex: 2 }}>
                <Field label={`Line ${i + 1}`} value={l.name} onChangeText={(name) => update(i, { name })} placeholder="Dahi 400 g" />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="₹" value={l.amount} onChangeText={(a) => update(i, { amount: a })} keyboardType="decimal-pad" placeholder="0" />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove line ${i + 1}`}
                onPress={() => setLines(lines.filter((_, j) => j !== i))}
                style={{ width: 48, height: 56, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={{ ios: 'xmark', android: 'close' }} size={18} color={c.inkSoft} />
              </Pressable>
            </View>
            <Choice
              value={l.kind}
              onChange={(kind) => update(i, { kind })}
              options={[
                { value: 'item', label: 'Item' },
                { value: 'fee', label: 'Fee' },
                { value: 'discount', label: 'Discount' },
              ]}
            />
          </View>
        ))}
        <MagnetButton
          label="Add a line"
          outline
          icon={{ ios: 'plus', android: 'add' }}
          onPress={() => setLines([...lines, { id: newId(), name: '', amount: '', kind: 'item' }])}
        />
        {lines.length > 0 && (
          <T size={15} soft>
            Delivery and handling are fees; coupons are discounts. Lines must add up to the amount paid.
          </T>
        )}
      </Slip>

      <ErrorText error={error} />
      <MagnetButton
        label={busy ? 'Saving…' : total ? `Save ${formatINR(total)}` : 'Save'}
        color="tomato"
        disabled={busy || !total || (lines.length > 0 && !balanced)}
        onPress={save}
      />
    </Screen>
  );
}
