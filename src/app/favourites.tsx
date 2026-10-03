import { useState } from 'react';
import { View } from 'react-native';

import { formatINR, parseRupees, upiAmount } from '@/domain/money';
import { useHousehold, type ProductRow } from '@/lib/books';
import { newId } from '@/lib/id';
import { landed, supabase } from '@/lib/supabase';
import { Choice, ErrorText, Field, Heading, MagnetButton, Row, Rule, Slip, StarToggle, Screen, T } from '@/ui/kit';

const rupees = (paise: number | null) => (paise ? upiAmount(paise).replace(/\.00$/, '') : '');

export default function Favourites() {
  const { products, household, reload } = useHousehold();
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setFavourite(p: ProductRow, favourite: boolean) {
    setError(null);
    const { error } = await supabase.from('product').update({ favourite }).eq('id', p.id);
    if (error) setError(error.message);
    await reload();
  }

  return (
    <Screen>
      <AddProduct householdId={household.id} names={products.map((p) => p.name.toLowerCase())} onAdded={reload} />

      <Heading>Things we buy</Heading>
      <ErrorText error={error} />
      {products.length === 0 ? (
        <T soft>Nothing yet. Add milk, bread, eggs, whatever goes in the cart every week.</T>
      ) : (
        <Slip>
          {products.map((p, i) => (
            <View key={p.id} style={{ gap: 12 }}>
              {i > 0 && <Rule />}
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <StarToggle
                  on={p.favourite}
                  label={`${p.name} in quick add`}
                  onPress={() => setFavourite(p, !p.favourite)}
                />
                <View style={{ flex: 1 }}>
                  <Row
                    label={p.name}
                    detail={p.default_price_paise ? formatINR(p.default_price_paise) : 'no price'}
                    onPress={() => setEditing(editing === p.id ? null : p.id)}
                  />
                </View>
              </View>
              {editing === p.id && <EditPrice key={p.id} product={p} onDone={() => setEditing(null)} />}
            </View>
          ))}
        </Slip>
      )}
    </Screen>
  );
}

function EditPrice({ product, onDone }: { product: ProductRow; onDone: () => void }) {
  const { reload } = useHousehold();
  const [text, setText] = useState(rupees(product.default_price_paise));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paise = parseRupees(text);
  const blank = !text.trim();

  return (
    <View style={{ gap: 12 }}>
      <Field
        label="Usual price (₹)"
        value={text}
        onChangeText={setText}
        keyboardType="decimal-pad"
        placeholder="none"
        autoFocus
      />
      <ErrorText error={error} />
      <MagnetButton
        label={busy ? 'Saving…' : 'Save price'}
        outline
        disabled={busy || (!blank && !paise)}
        onPress={async () => {
          setBusy(true);
          setError(null);
          const { error } = await supabase
            .from('product')
            .update({ default_price_paise: blank ? null : paise })
            .eq('id', product.id);
          setBusy(false);
          if (error) return setError(error.message);
          await reload();
          onDone();
        }}
      />
    </View>
  );
}

function AddProduct({ householdId, names, onAdded }: { householdId: string; names: string[]; onAdded: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [favourite, setFavourite] = useState<'yes' | 'no'>('yes');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [id, setId] = useState(newId); // one id per product: a retried save is a no-op

  const trimmed = name.trim().replace(/\s+/g, ' ');
  const paise = parseRupees(price);
  const priceOk = !price.trim() || paise !== null;
  const dup = names.includes(trimmed.toLowerCase());

  async function add() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.from('product').insert({
      id,
      household_id: householdId,
      name: trimmed,
      default_price_paise: price.trim() ? paise : null,
      favourite: favourite === 'yes',
    });
    // An error after our row landed (lost response, then a 23505 on the retry) is a success.
    if (error && !(await landed('product', id))) {
      setBusy(false);
      await onAdded();
      return setError(error.code === '23505' ? `${trimmed} is already on the list.` : error.message);
    }
    setBusy(false);
    await onAdded();
    setName('');
    setPrice('');
    setId(newId());
  }

  return (
    <Slip magnet="orange">
      <Field label="Add a product" value={name} onChangeText={setName} placeholder="Amul Taaza 500 ml" maxLength={80} />
      <Field label="Usual price (₹, optional)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="29" />
      <View style={{ gap: 8 }}>
        <T size={15} weight="600" soft>
          Show in quick add
        </T>
        <Choice
          value={favourite}
          onChange={setFavourite}
          options={[
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' },
          ]}
        />
      </View>
      {dup && <T size={15} soft>{trimmed} is already on the list.</T>}
      <ErrorText error={error} />
      <MagnetButton
        label={busy ? 'Adding…' : 'Add'}
        color="orange"
        icon={{ ios: 'plus', android: 'add' }}
        disabled={busy || !trimmed || !priceOk || dup}
        onPress={add}
      />
    </Slip>
  );
}
