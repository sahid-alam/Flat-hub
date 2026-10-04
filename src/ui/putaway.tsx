// "Put it away": after a spend is saved, the lines that matched a tracked product become lots.
// Each line gets a location (Fridge / Freezer / Pantry, guessed from the product's category) and an
// optional expiry. Skip still creates the lots — pantry, no expiry — so a shop is never lost.
// One RPC (put_away) does the lots and their opening 'purchase' moves in one transaction; the lot ids
// are minted once per sheet, so a retry after a lost response is a complete no-op.
import { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';

import { toBase } from '@/domain/stock';
import { useHousehold, type ProductRow } from '@/lib/books';
import { newId } from '@/lib/id';
import { supabase } from '@/lib/supabase';
import { Choice, DateField, ErrorText, MagnetButton, SectionLabel, T, usePalette } from '@/ui/kit';

type Location = 'fridge' | 'freezer' | 'pantry';

/** A saved spend line, as /import and /spend already hold it. */
export type PutAwayLine = {
  id: string; // the spend_line id
  name: string;
  product_id: string | null;
  qty: number;
  unit: string | null;
  kind: 'item' | 'fee' | 'discount';
};

type Draft = { lotId: string; line: PutAwayLine; product: ProductRow; location: Location; expiry: string };

/** Where a product goes by default. Category is free text, so this reads it loosely. */
function defaultLocation(category: string | null): Location {
  const c = (category ?? '').toLowerCase();
  if (/frozen|ice/.test(c)) return 'freezer';
  if (/dairy|fridge|chill|veg|fruit|produce|meat|fish|egg/.test(c)) return 'fridge';
  return 'pantry';
}

/** The opening quantity in the product's base unit. */
function openingQty(line: PutAwayLine, product: ProductRow, uoms: { product_id: string; unit: string; factor_to_base: number }[]): number {
  if (!line.unit || line.unit === product.base_unit) return line.qty;
  const mapped = toBase(line.qty, line.unit, product.id, uoms);
  if (mapped !== null) return mapped;
  const u = line.unit.toLowerCase();
  if ((u === 'kg' && product.base_unit === 'g') || (u === 'l' && product.base_unit === 'ml')) return line.qty * 1000;
  // ponytail: an unmapped unit lands as its own number, as does a line with no unit at all
  // (/spend and quick-add both send qty 1, unit null, so a 5 kg bag of atta opens as 1 g).
  // The sheet shows the number before it is saved; mapping the unit under the product
  // (product_uom) and a compensating 'adjust' move fixes a lot that went in wrong.
  return line.qty;
}

/**
 * The Put away sheet, driven by a promise.
 *
 *   const putAway = usePutAway();
 *   ...
 *   await putAway.ask(lines);   // resolves at once when no line is tracked
 *   await reload();
 *   router.back();
 *   ...
 *   {putAway.sheet}
 */
export function usePutAway() {
  const { products, household, reload } = useHousehold();
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  const done = useRef<(() => void) | null>(null);

  const ask = (lines: PutAwayLine[]) =>
    new Promise<void>((resolve) => {
      const rows: Draft[] = [];
      const rest: string[] = [];
      for (const line of lines) {
        const product = line.kind === 'item' && line.product_id ? products.find((p) => p.id === line.product_id) : undefined;
        if (product?.track_stock)
          rows.push({ lotId: newId(), line, product, location: defaultLocation(product.category), expiry: '' });
        else if (line.kind === 'item') rest.push(line.name);
      }
      if (rows.length === 0) return resolve();
      done.current = resolve;
      setSkipped(rest);
      setDrafts(rows);
    });

  const close = () => {
    setDrafts(null);
    done.current?.();
    done.current = null;
  };

  return {
    ask,
    sheet: drafts && <PutAwaySheet drafts={drafts} skipped={skipped} householdId={household.id} onChange={setDrafts} onClose={close} onSaved={reload} />,
  };
}

function PutAwaySheet({
  drafts,
  skipped,
  householdId,
  onChange,
  onClose,
  onSaved,
}: {
  drafts: Draft[];
  skipped: string[];
  householdId: string;
  onChange: (d: Draft[]) => void;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const c = usePalette();
  const { uoms } = useHousehold();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (i: number, patch: Partial<Draft>) => onChange(drafts.map((d, j) => (i === j ? { ...d, ...patch } : d)));

  // `everything` is the Skip path: the same lots, in the pantry, with no expiry, so nothing is lost.
  async function save(as: 'chosen' | 'pantry') {
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('put_away', {
      p_lots: drafts.map((d) => ({
        id: d.lotId,
        household_id: householdId,
        product_id: d.product.id,
        spend_line_id: d.line.id,
        location: as === 'pantry' ? 'pantry' : d.location,
        expiry_date: as === 'pantry' ? null : d.expiry || null,
        qty: openingQty(d.line, d.product, uoms),
      })),
    });
    setBusy(false);
    if (error) return setError(error.message);
    await onSaved();
    onClose();
  }

  const n = drafts.length;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={() => save('pantry')}>
      <View style={{ flex: 1, backgroundColor: c.scrim, justifyContent: 'flex-end' }}>
        <View
          role="dialog"
          accessibilityLabel="Put the order away"
          style={{ maxHeight: '94%', backgroundColor: c.ground, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 8 }}>
          <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: c.line }} />
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
            <T size={22} weight="700">
              Put it away
            </T>
            <T size={13} soft>
              Saved. {n} {n === 1 ? 'line is' : 'lines are'} tracked — tell the app where {n === 1 ? 'it' : 'they'} went.
            </T>

            {drafts.map((d, i) => (
              <View key={d.lotId} style={{ backgroundColor: c.surface, borderRadius: 24, padding: 16, gap: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                  <T size={16} weight="700" style={{ flex: 1 }}>
                    {d.line.name}
                  </T>
                  {/* What will actually hit the ledger, so a wrong unit is caught before the tap. */}
                  <T size={16} weight="700" num soft>
                    {openingQty(d.line, d.product, uoms)} {d.product.base_unit}
                  </T>
                </View>
                <SectionLabel>Where does it go?</SectionLabel>
                <Choice
                  value={d.location}
                  onChange={(location) => set(i, { location })}
                  options={[
                    { value: 'fridge' as Location, label: 'Fridge' },
                    { value: 'freezer' as Location, label: 'Freezer' },
                    { value: 'pantry' as Location, label: 'Pantry' },
                  ]}
                />
                {/* Web build: an empty value renders the browser's own dd/mm/yyyy, which is what "optional" looks like. */}
                <DateField label="Expiry · optional" value={d.expiry} onChange={(expiry) => set(i, { expiry })} />
              </View>
            ))}

            {skipped.length > 0 && (
              <T size={13} soft>
                {skipped.join(' and ')} {skipped.length === 1 ? 'is' : 'are'} not tracked, so {skipped.length === 1 ? 'it is' : 'they are'} already done.
              </T>
            )}

            <ErrorText error={error} />
            <MagnetButton
              label={busy ? 'Putting away…' : `Put away ${n} ${n === 1 ? 'item' : 'items'}`}
              color="brass"
              icon={{ ios: 'archivebox', android: 'inventory_2' }}
              disabled={busy}
              onPress={() => save('chosen')}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Skip for now — put everything in the pantry with no expiry"
              disabled={busy}
              onPress={() => save('pantry')}
              style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}>
              <T size={15} weight="700" soft>
                Skip for now
              </T>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
