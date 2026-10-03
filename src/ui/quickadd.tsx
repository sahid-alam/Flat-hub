// Kitty home quick-add: tap a favourite, tap save. A local spend, paid by me from the kitty,
// with one line pointing at the product so stock (M3) can pick it up later.
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { formatINR, parseRupees, upiAmount } from '@/domain/money';
import { useHousehold, type ProductRow } from '@/lib/books';
import { newId } from '@/lib/id';
import { supabase } from '@/lib/supabase';
import { DISPLAY, ErrorText, Field, MagnetButton, Slip, T, Tile, usePalette } from '@/ui/kit';

const rupees = (paise: number | null) => (paise ? upiAmount(paise).replace(/\.00$/, '') : '');

export function QuickAdd() {
  const c = usePalette();
  const { products } = useHousehold();
  const [picked, setPicked] = useState<ProductRow | null>(null);
  const favourites = products.filter((p) => p.favourite);

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <T size={22} style={{ fontFamily: DISPLAY, lineHeight: 28 }}>
          Quick add
        </T>
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push('/favourites')}
          style={{ minHeight: 48, justifyContent: 'center' }}>
          <T size={15} weight="600" color={c.blue}>
            {favourites.length ? 'Edit favourites' : 'Pick favourites'}
          </T>
        </Pressable>
      </View>
      {favourites.length === 0 ? (
        <T soft>Star the things you buy every week (milk, bread, eggs) and they show up here for a two-tap spend.</T>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {favourites.map((p) => (
            <Tile
              key={p.id}
              title={p.name}
              detail={p.default_price_paise ? formatINR(p.default_price_paise) : 'set price'}
              on={picked?.id === p.id}
              onPress={() => setPicked(picked?.id === p.id ? null : p)}
            />
          ))}
        </View>
      )}
      {picked && <Confirm key={picked.id} product={picked} onDone={() => setPicked(null)} />}
    </View>
  );
}

function Confirm({ product, onDone }: { product: ProductRow; onDone: () => void }) {
  const { me, household, reload } = useHousehold();
  const [text, setText] = useState(rupees(product.default_price_paise));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ids] = useState(() => ({ spend: newId(), line: newId() })); // a retried save is a no-op
  const paise = parseRupees(text);

  async function save() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('add_spend', {
      p_spend: {
        id: ids.spend,
        household_id: household.id,
        source: 'local',
        store_name: null,
        paid_by: me.id,
        paid_from: 'pool',
        total_paise: paise,
      },
      p_lines: [{ id: ids.line, name: product.name, product_id: product.id, line_total_paise: paise, kind: 'item' }],
    });
    setBusy(false);
    if (error) return setError(error.message);
    await reload();
    onDone();
  }

  return (
    <Slip magnet="tomato">
      <Field
        label={`${product.name} (₹)`}
        value={text}
        onChangeText={setText}
        keyboardType="decimal-pad"
        placeholder="0"
        autoFocus={!product.default_price_paise}
      />
      <T size={15} soft>
        Local shop · paid by you · from the kitty
      </T>
      <ErrorText error={error} />
      <MagnetButton
        label={busy ? 'Saving…' : paise ? `Save ${formatINR(paise)}` : 'Save'}
        color="tomato"
        disabled={busy || !paise}
        onPress={save}
      />
    </Slip>
  );
}
