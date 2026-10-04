// The shopping list: rows a mate typed (shopping_item) plus tracked products whose on-hand has fallen
// below min_qty. The low half is derived, so it can't be deleted — ticking it means "bought it".
// A ticked row does not vanish: it drops into the Bought block, where it can be unticked.
// The body lives here so the Kitchen tab and the old /shopping path render the same screen.
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { istDate } from '@/domain/kitty';
import { shoppingList } from '@/domain/stock';
import { useHousehold, type LotRow, type MoveRow, type ProductRow, type ShoppingRow } from '@/lib/books';
import { newId } from '@/lib/id';
import { supabase } from '@/lib/supabase';
import { today } from '@/lib/util';
import { Block, ErrorText, Field, Icon, MagnetButton, Rule, SectionLabel, T, usePalette } from '@/ui/kit';
import { GroupHead, WarnChip } from '@/ui/stock';

const qty = (n: number, unit: string) =>
  unit === 'pc' ? `${n} pc` : n >= 1000 ? `${+(n / 1000).toFixed(2)} ${unit === 'ml' ? 'L' : 'kg'}` : `${n} ${unit}`;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** What the Kitchen tab's Shopping segment counts: everything still to buy. */
export function toBuyCount(products: ProductRow[], lots: LotRow[], moves: MoveRow[], shopping: ShoppingRow[]): number {
  const open = shopping.filter((s) => !s.done_at);
  // A low product ticked today is bought, so it drops out of the count exactly as it does from the hero.
  const tickedToday = new Set(shopping.filter((s) => s.done_at && istDate(s.done_at) === today()).map((s) => s.product_id));
  return (
    shoppingList(products, lots, moves, open).filter((r) => r.source === 'low' && !tickedToday.has(r.product_id)).length +
    open.length
  );
}

export function ShoppingBody() {
  const c = usePalette();
  const { household, me, products, lots, moves, shopping, name, reload } = useHousehold();
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
  const manualDone = doneToday.filter((d) => !lowTicks.has(d.id));
  const stillToBuy = low.filter((r) => !r.ticked).length + open.length;

  // Ticked today, in one block at the bottom: low rows that were ticked, then the typed ones.
  const bought = [
    ...low
      .filter((r) => r.ticked)
      .map((r) => ({
        key: r.ticked!.id,
        name: r.name,
        meta: `From low stock · ticked by ${name(r.ticked!.added_by)}`,
        // A low row has no shopping_item of its own: the tick wrote one, so unticking takes it out again.
        untick: () => run(supabase.from('shopping_item').delete().eq('id', r.ticked!.id)),
      })),
    ...manualDone.map((s) => ({
      key: s.id,
      name: s.name,
      meta: `Asked for by ${name(s.added_by)}`,
      untick: () => run(supabase.from('shopping_item').update({ done_at: null }).eq('id', s.id)),
    })),
  ];

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

  const lowOpen = low.filter((r) => !r.ticked);

  return (
    <>
      <Block tone="stone">
        <SectionLabel>Still to buy</SectionLabel>
        <T num size={52} style={{ lineHeight: 52 }}>
          {stillToBuy}
        </T>
        <T size={13} weight="600" soft>
          {lowOpen.length} from low stock · {open.length} asked for · {bought.length} already ticked
        </T>
      </Block>

      {stillToBuy === 0 && bought.length === 0 ? (
        <Block>
          <T soft>Nothing to buy. Low-stock items turn up here on their own; type anything else below.</T>
        </Block>
      ) : null}

      {lowOpen.length > 0 && (
        <Block>
          <GroupHead title="From low stock" detail="the app noticed" />
          {lowOpen.map((r, i) => (
            <View key={r.product_id ?? r.name}>
              {i > 0 && <Rule />}
              <Tick
                label={r.name}
                mark="Low stock"
                detail={`${qty(r.have, unitOf(r.product_id))} left of ${qty(r.min ?? 0, unitOf(r.product_id))} min`}
                disabled={busy}
                onPress={() => tickLow(r.product_id, r.name)}
              />
            </View>
          ))}
        </Block>
      )}

      {open.length > 0 && (
        <Block>
          <GroupHead title="Asked for" detail="a mate typed it" />
          {open.map((s, i) => (
            <View key={s.id}>
              {i > 0 && <Rule />}
              <Tick label={s.name} detail={`Added by ${name(s.added_by)}`} disabled={busy} onPress={() => tick(s)} />
            </View>
          ))}
        </Block>
      )}

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

      {bought.length > 0 && (
        <Block tone="raised">
          <GroupHead title="Bought" detail={`today, ${bought.length} item${bought.length === 1 ? '' : 's'}`} />
          {bought.map((b, i) => (
            <View key={b.key}>
              {i > 0 && <Rule />}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 4 }}>
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 9,
                    backgroundColor: c.ink,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <Icon name={{ ios: 'checkmark', android: 'check' }} size={16} color={c.ground} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <T size={15} weight="700" soft style={{ textDecorationLine: 'line-through' }}>
                    {b.name}
                  </T>
                  <T size={13} soft>
                    {b.meta}
                  </T>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Untick ${b.name}, put it back on the list`}
                  accessibilityState={{ disabled: busy }}
                  disabled={busy}
                  onPress={b.untick}
                  style={({ pressed }) => [
                    {
                      minHeight: 48,
                      justifyContent: 'center',
                      paddingHorizontal: 14,
                      borderRadius: 9999,
                      borderWidth: 1.5,
                      borderColor: busy ? c.hair : c.line,
                    },
                    pressed && { opacity: 0.6 },
                  ]}>
                  <T size={14} weight="700" color={busy ? c.muted : c.ink}>
                    Untick
                  </T>
                </Pressable>
              </View>
            </View>
          ))}
          <T size={12} soft>
            A tick counts for today only, so a product that runs low again next week comes back unticked. Untick puts
            it straight back on the list.
          </T>
        </Block>
      )}

      <T size={13} soft>
        Low-stock rows clear themselves once a spend puts the product back above its minimum.
      </T>
    </>
  );
}

/** A tickable row, 60pt. kit has no checkbox and only this screen needs one. */
function Tick({
  label,
  detail,
  mark,
  disabled,
  onPress,
}: {
  label: string;
  detail: string;
  mark?: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: false, disabled }}
      accessibilityLabel={`${label}${mark ? `, ${mark.toLowerCase()}` : ''}, ${detail}, still to buy`}
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
          borderColor: c.line,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      />
      <View style={{ flex: 1, gap: 4 }}>
        <T size={16} weight="700">
          {label}
        </T>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 }}>
          {mark && <WarnChip label={mark} />}
          <T size={13} soft>
            {detail}
          </T>
        </View>
      </View>
    </Pressable>
  );
}
