// The flat's catalogue. Every product's metadata is typed here: the category Spending groups by,
// the minimum that puts it on the shopping list, what it is counted in, and whether it is counted
// at all. Before B6 this screen wrote five columns and the other four had no writer anywhere
// (docs/AUDIT.md section 0).
import { useState } from 'react';
import { View } from 'react-native';

import { formatINR } from '@/domain/money';
import { minUnit, showMinQty } from '@/domain/stock';
import { useHousehold, type ProductRow } from '@/lib/books';
import { newId } from '@/lib/id';
import { landed, supabase } from '@/lib/supabase';
import { Block, ErrorText, MagnetButton, Row, Rule, Screen, SectionLabel, StarToggle, T } from '@/ui/kit';
import { blankDraft, draftColumns, draftOf, draftOk, ProductFields, type ProductDraft } from '@/ui/product';

/** What the row says about a product without opening it: price, category, and the minimum. */
function summary(p: ProductRow): string {
  const bits = [p.default_price_paise ? formatINR(p.default_price_paise) : 'no price', p.category ?? 'Other'];
  if (p.min_qty !== null) bits.push(`keep ${showMinQty(p.min_qty, p.base_unit)} ${minUnit(p.base_unit)}`);
  if (!p.track_stock) bits.push('not counted');
  return bits.join(' · ');
}

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

      <ErrorText error={error} />
      {products.length === 0 ? (
        <T soft>Nothing yet. Add milk, bread, eggs, whatever goes in the cart every week.</T>
      ) : (
        <Block>
          <SectionLabel>Things we buy · ★ shows in quick add</SectionLabel>
          {products.map((p, i) => (
            <View key={p.id} style={{ gap: 12 }}>
              {i > 0 && <Rule />}
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <StarToggle on={p.favourite} label={`${p.name} in quick add`} onPress={() => setFavourite(p, !p.favourite)} />
                <View style={{ flex: 1 }}>
                  <Row label={p.name} detail={summary(p)} onPress={() => setEditing(editing === p.id ? null : p.id)} />
                </View>
              </View>
              {editing === p.id && <EditProduct key={p.id} product={p} onDone={() => setEditing(null)} />}
            </View>
          ))}
        </Block>
      )}
    </Screen>
  );
}

function EditProduct({ product, onDone }: { product: ProductRow; onDone: () => void }) {
  const { reload, lots } = useHousehold();
  const [draft, setDraft] = useState<ProductDraft>(() => draftOf(product));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Lots are counted in the base unit and stock_move carries no unit of its own, so the unit is
  // only a choice until the first lot exists. After that, changing it would reread history.
  const hasStock = lots.some((l) => l.product_id === product.id);

  return (
    <View style={{ gap: 14 }}>
      <ProductFields draft={draft} onChange={setDraft} lockUnit={hasStock} />
      <ErrorText error={error} />
      <MagnetButton
        label={busy ? 'Saving…' : 'Save'}
        outline
        disabled={busy || !draftOk(draft)}
        onPress={async () => {
          setBusy(true);
          setError(null);
          const { error } = await supabase.from('product').update(draftColumns(draft)).eq('id', product.id);
          setBusy(false);
          if (error) return setError(error.code === '23505' ? 'Another product already has that name.' : error.message);
          await reload();
          onDone();
        }}
      />
    </View>
  );
}

function AddProduct({ householdId, names, onAdded }: { householdId: string; names: string[]; onAdded: () => Promise<void> }) {
  const [draft, setDraft] = useState<ProductDraft>(blankDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [id, setId] = useState(newId); // one id per product: a retried save is a no-op

  const cols = draftColumns(draft);
  const dup = names.includes(cols.name.toLowerCase());

  async function add() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.from('product').insert({ id, household_id: householdId, ...cols });
    // An error after our row landed (lost response, then a 23505 on the retry) is a success.
    if (error && !(await landed('product', id))) {
      setBusy(false);
      await onAdded();
      return setError(error.code === '23505' ? `${cols.name} is already on the list.` : error.message);
    }
    setBusy(false);
    await onAdded();
    setDraft(blankDraft());
    setId(newId());
  }

  return (
    <Block>
      <SectionLabel>Add a product</SectionLabel>
      <ProductFields draft={draft} onChange={setDraft} />
      {dup && (
        <T size={15} soft>
          {cols.name} is already on the list.
        </T>
      )}
      <ErrorText error={error} />
      <MagnetButton
        label={busy ? 'Adding…' : 'Add'}
        color="brass"
        icon={{ ios: 'plus', android: 'add' }}
        disabled={busy || !draftOk(draft) || dup}
        onPress={add}
      />
    </Block>
  );
}
