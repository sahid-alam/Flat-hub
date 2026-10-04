// The shopping list: rows a mate typed (shopping_item) plus tracked products whose on-hand has fallen
// below min_qty. The low half is derived, so it can't be deleted — ticking it means "bought it".
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { istDate } from '@/domain/kitty';
import { shoppingList, type Lot, type Move } from '@/domain/stock';
import { useHousehold, type ProductRow } from '@/lib/books';
import { newId } from '@/lib/id';
import { supabase } from '@/lib/supabase';
import { today } from '@/lib/util';
import { Block, ErrorText, Field, Icon, MagnetButton, Rule, Screen, SectionLabel, T, usePalette } from '@/ui/kit';

type ShoppingRow = {
  id: string;
  product_id: string | null;
  name: string;
  added_by: string;
  done_by_spend_line_id: string | null;
  done_at: string | null;
};
type StockProductRow = ProductRow & { min_qty: number | null; base_unit: 'g' | 'ml' | 'pc' };

const qty = (n: number, unit: string) =>
  unit === 'pc' ? `${n} pc` : n >= 1000 ? `${+(n / 1000).toFixed(2)} ${unit === 'ml' ? 'L' : 'kg'}` : `${n} ${unit}`;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export default function Shopping() {
  // ponytail: books.tsx is another agent's this milestone. It must expose lots/moves/shopping and select
  // min_qty + base_unit on product; one cast names that contract here and goes away at integration.
  const hh = useHousehold() as unknown as Omit<ReturnType<typeof useHousehold>, 'products'> & {
    lots: Lot[];
    moves: Move[];
    shopping: ShoppingRow[];
    products: StockProductRow[];
  };
  const { household, me, products, lots, moves, shopping, name, reload } = hh;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = shopping.filter((s) => !s.done_at);
  // A tick counts for the day it was made: a product that goes low again next week starts unticked.
  const doneToday = shopping.filter((s) => s.done_at && istDate(s.done_at) === today());
  const unitOf = (id: string | null) => products.find((p) => p.id === id)?.base_unit ?? 'pc';

  // An open manual row claims its product, so shoppingList never lists it twice.
  const low = shoppingList(products, lots, moves, open)
    .filter((r) => r.source === 'low')
    .map((r) => ({ ...r, ticked: doneToday.find((d) => d.product_id === r.product_id) ?? null }));
  const lowTicks = new Set(low.map((r) => r.ticked?.id));
  const manual = [...open, ...doneToday.filter((d) => !lowTicks.has(d.id))];
  const stillToBuy = low.filter((r) => !r.ticked).length + open.length;
  const ticked = low.filter((r) => r.ticked).length + (manual.length - open.length);

  const trimmed = text.trim().replace(/\s+/g, ' ');
  const match = products.find((p) => same(p.name, trimmed) || p.aliases.some((a) => same(a, trimmed)));

  async function run(p: PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true);
    setError(null);
    const { error } = await p;
    if (error) setError(error.message);
    else await reload();
    setBusy(false);
    return !error;
  }

  const tick = (row: ShoppingRow) =>
    run(supabase.from('shopping_item').update({ done_at: new Date().toISOString() }).eq('id', row.id));
  const untick = (row: ShoppingRow) => run(supabase.from('shopping_item').update({ done_at: null }).eq('id', row.id));
  // A low row has no shopping_item of its own: ticking writes a done one, unticking takes it back out.
  const tickLow = (productId: string | null, label: string) =>
    run(
      supabase.from('shopping_item').insert({
        id: newId(),
        household_id: household.id,
        product_id: productId,
        name: label,
        added_by: me.id,
        done_at: new Date().toISOString(),
      }),
    );

  return (
    <Screen>
      <Block tone="stone">
        <SectionLabel>Still to buy</SectionLabel>
        <T num size={52} style={{ lineHeight: 52 }}>
          {stillToBuy}
        </T>
        <T size={13} weight="600" soft>
          {low.length} from low stock · {manual.length} asked for · {ticked} already ticked
        </T>
      </Block>

      {low.length === 0 && manual.length === 0 ? (
        <Block>
          <T soft>Nothing to buy. Low-stock items turn up here on their own; type anything else below.</T>
        </Block>
      ) : null}

      {low.length > 0 && (
        <Block>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <SectionLabel>From low stock</SectionLabel>
            <T size={13} soft>
              Tick when bought
            </T>
          </View>
          {low.map((r, i) => (
            <View key={r.product_id ?? r.name}>
              {i > 0 && <Rule />}
              <Tick
                label={r.name}
                mark="Low stock"
                detail={`${qty(r.have, unitOf(r.product_id))} left of ${qty(r.min ?? 0, unitOf(r.product_id))} min`}
                checked={!!r.ticked}
                disabled={busy}
                onPress={() => (r.ticked ? run(supabase.from('shopping_item').delete().eq('id', r.ticked.id)) : tickLow(r.product_id, r.name))}
              />
            </View>
          ))}
        </Block>
      )}

      {manual.length > 0 && (
        <Block>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <SectionLabel>Asked for</SectionLabel>
            <T size={13} soft>
              Tap to tick off
            </T>
          </View>
          {manual.map((s, i) => (
            <View key={s.id}>
              {i > 0 && <Rule />}
              <Tick
                label={s.name}
                detail={`Added by ${name(s.added_by)}`}
                checked={!!s.done_at}
                disabled={busy}
                onPress={() => (s.done_at ? untick(s) : tick(s))}
              />
            </View>
          ))}
        </Block>
      )}

      <T size={13} soft>
        Low-stock rows can't be removed by hand: they clear themselves once a spend puts the product back above
        its minimum. Ticking one just means you've bought it.
      </T>

      <Block>
        <SectionLabel>Add to the list</SectionLabel>
        <Field label="What do we need?" value={text} onChangeText={setText} placeholder="Phenyl, matchbox…" maxLength={80} />
        <ErrorText error={error} />
        <MagnetButton
          label={busy ? 'Saving…' : 'Add to the list'}
          icon={{ ios: 'plus', android: 'add' }}
          disabled={busy || !trimmed}
          onPress={async () => {
            const ok = await run(
              supabase.from('shopping_item').insert({
                id: newId(),
                household_id: household.id,
                product_id: match?.id ?? null,
                name: trimmed,
                added_by: me.id,
              }),
            );
            if (ok) setText('');
          }}
        />
      </Block>
    </Screen>
  );
}

/** A tickable row, 60pt. kit has no checkbox and only this screen needs one. */
function Tick({
  label,
  detail,
  mark,
  checked,
  disabled,
  onPress,
}: {
  label: string;
  detail: string;
  mark?: string;
  checked: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={`${label}${mark ? `, ${mark.toLowerCase()}` : ''}, ${detail}, ${checked ? 'bought' : 'still to buy'}`}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 60, paddingVertical: 8 },
        pressed && { opacity: 0.6 },
      ]}>
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 9,
          borderWidth: 2,
          borderColor: checked ? c.ink : c.line,
          backgroundColor: checked ? c.ink : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        {checked && <Icon name={{ ios: 'checkmark', android: 'check' }} size={16} color={c.ground} />}
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <T size={16} weight="700" soft={checked} style={checked ? { textDecorationLine: 'line-through' } : undefined}>
          {label}
        </T>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 }}>
          {mark && (
            <View style={{ paddingHorizontal: 10, paddingVertical: 1, borderRadius: 11, backgroundColor: c.warnBg }}>
              <T size={12} weight="700" color={c.warnFg} style={{ lineHeight: 16 }}>
                {mark}
              </T>
            </View>
          )}
          <T size={13} soft>
            {detail}
          </T>
        </View>
      </View>
    </Pressable>
  );
}
