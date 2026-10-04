import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { exactProduct } from '@/domain/extraction';
import { linesBalance } from '@/domain/kitty';
import { formatINR, parseRupees } from '@/domain/money';
import { useHousehold, type SpendRow } from '@/lib/books';
import { sayError } from '@/lib/util';
import { newId } from '@/lib/id';
import { supabase } from '@/lib/supabase';
import { AmountBlock, BalanceBar, roundingLine } from '@/ui/capture';
import { Block, Choice, ErrorText, Field, Icon, MagnetButton, Screen, SectionLabel, T, usePalette } from '@/ui/kit';
import { usePutAway } from '@/ui/putaway';

type Kind = 'item' | 'fee' | 'discount';
type Line = { id: string; name: string; amount: string; kind: Kind };

export default function AddSpend() {
  const c = usePalette();
  const { me, members, household, products, holder, reload } = useHousehold();
  const putAway = usePutAway();
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
    // One match per line, used for both the spend_line and the lot that may follow it. /spend has no
    // confirm card, and spend_line.product_id can never be corrected, so only an exact name or alias
    // counts — a fuzzy guess would file "Milk powder" under Milk for good. /import does the fuzzy pass.
    const named = parsed.map((l) => ({
      ...l,
      name: l.name.trim(),
      product_id: l.kind === 'item' ? exactProduct(l.name, products)?.id ?? null : null,
    }));
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
      p_lines: named.map((l) => ({ id: l.id, name: l.name, line_total_paise: l.paise, kind: l.kind, product_id: l.product_id })),
    });
    setBusy(false);
    if (error) return setError(sayError(error, holder?.display_name));
    // ponytail: /spend has no qty field, so a tracked line opens its lot at qty 1 of the base unit.
    await putAway.ask(named.map((l) => ({ id: l.id, name: l.name, product_id: l.product_id, qty: 1, unit: null, kind: l.kind })));
    await reload();
    router.back();
  }

  const unbalanced = lines.length > 0 && !balanced;

  return (
    <Screen>
      <AmountBlock label="Amount paid" autoFocus value={amount} onChangeText={setAmount} />

      <View style={{ gap: 8 }}>
        <SectionLabel>Paid by</SectionLabel>
        <Choice
          value={paidBy}
          onChange={setPaidBy}
          options={members.map((m) => ({ value: m.id, label: m.id === me.id ? `${m.display_name} (me)` : m.display_name }))}
        />
      </View>

      <View style={{ gap: 8 }}>
        <SectionLabel>Paid from</SectionLabel>
        <Choice
          value={paidFrom}
          onChange={setPaidFrom}
          options={[
            { value: 'pool', label: 'From pool' },
            { value: 'personal', label: 'Own pocket' },
          ]}
        />
        {paidFrom === 'personal' && (
          <T size={15} soft>
            It goes on the treasurer's "to reimburse" list until it's paid back.
          </T>
        )}
      </View>

      <View style={{ gap: 8 }}>
        <SectionLabel>Where from</SectionLabel>
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

      <Block>
        <SectionLabel>Lines · optional</SectionLabel>
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
                <Icon name={{ ios: 'xmark', android: 'close' }} size={18} color={c.muted} />
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
      </Block>

      {lines.length > 0 && total !== null && linesValid && (
        <BalanceBar
          total={total}
          lines={linesTotal}
          onFix={() => setLines([...lines, { id: newId(), ...roundingLine(total - linesTotal) }])}
        />
      )}

      <ErrorText error={error} />
      <MagnetButton
        label={busy ? 'Saving…' : lines.length > 0 && total === null
              ? 'Enter the amount paid'
              : unbalanced
                ? 'Save once lines add up'
                : total
                  ? `Save ${formatINR(total)}`
                  : 'Save'}
        color="brass"
        disabled={busy || !total || unbalanced}
        onPress={save}
      />
      {putAway.sheet}
    </Screen>
  );
}
