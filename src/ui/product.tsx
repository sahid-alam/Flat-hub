// The one place a product's metadata gets typed. Before B6 nothing in the app wrote `category`,
// `min_qty`, `track_stock` or `base_unit` (docs/AUDIT.md section 0), so three shipped features
// rendered falsehoods: Spending's category bars, Shopping's "From low stock", and a litre of milk
// reading "1 pc left". The columns and their UPDATE grants have been there since M2 — this is
// their writer, not new schema.
//
// Used by /favourites (create and edit) and by /import, where a Zepto line that matched nothing
// could not create a product at all. Draft in, columns out; the screens own the save and the error.
import { View } from 'react-native';

import { formatINR, parseRupees, upiAmount } from '@/domain/money';
import { minUnit, parseMinQty, showMinQty, type BaseUnit } from '@/domain/stock';
import type { ProductRow } from '@/lib/books';
import { Choice, Field, SectionLabel, T } from '@/ui/kit';

/** 'Other' is the chip for "don't care", stored as null — which is already what monthBreakdown
 *  calls an uncategorised line (domain/kitty.ts:210), so it lands in a bar with the same name.
 *  Several of these are read by ui/putaway.tsx:33 to guess Fridge / Freezer / Pantry. */
export const CATEGORIES = [
  'Dairy',
  'Vegetables',
  'Fruit',
  'Eggs & Meat',
  'Staples',
  'Snacks',
  'Drinks',
  'Frozen',
  'Household',
  'Other',
] as const;

const UNITS: { value: BaseUnit; label: string }[] = [
  { value: 'g', label: 'Grams' },
  { value: 'ml', label: 'Millilitres' },
  { value: 'pc', label: 'Pieces' },
];

export type ProductDraft = {
  name: string;
  category: string; // a CATEGORIES chip; 'Other' is stored as null
  base_unit: BaseUnit;
  min: string; // typed in minUnit(base_unit): kg, L or pc
  track: boolean;
  favourite: boolean;
  price: string; // rupees, as typed
};

export const blankDraft = (name = ''): ProductDraft => ({
  name,
  category: 'Other',
  base_unit: 'pc',
  min: '',
  track: true,
  favourite: true,
  price: '',
});

export const draftOf = (p: ProductRow): ProductDraft => ({
  name: p.name,
  category: p.category && (CATEGORIES as readonly string[]).includes(p.category) ? p.category : 'Other',
  base_unit: p.base_unit,
  min: showMinQty(p.min_qty, p.base_unit),
  track: p.track_stock,
  favourite: p.favourite,
  price: p.default_price_paise ? upiAmount(p.default_price_paise).replace(/\.00$/, '') : '',
});

/** Blank is fine for the price and the minimum: they mean "no usual price" and "never nag me". */
export const draftOk = (d: ProductDraft): boolean =>
  !!d.name.trim() &&
  (!d.price.trim() || parseRupees(d.price) !== null) &&
  (!d.min.trim() || parseMinQty(d.min, d.base_unit) !== null);

/** The product columns, ready for an insert or an update. Paise, never rupees (CLAUDE.md). */
export function draftColumns(d: ProductDraft) {
  return {
    name: d.name.trim().replace(/\s+/g, ' '),
    category: d.category === 'Other' ? null : d.category,
    base_unit: d.base_unit,
    min_qty: d.min.trim() ? parseMinQty(d.min, d.base_unit) : null,
    track_stock: d.track,
    favourite: d.favourite,
    default_price_paise: d.price.trim() ? parseRupees(d.price) : null,
  };
}

const YES_NO = [
  { value: 'yes' as const, label: 'Yes' },
  { value: 'no' as const, label: 'No' },
];
const yn = (on: boolean) => (on ? 'yes' : 'no');

/**
 * Every metadata field, as one run of rows. `lockUnit` is passed once the product has lots:
 * `stock_move.delta_qty` carries no unit of its own, so moving milk from pieces to millilitres
 * would silently reread every "1 pc" already in the append-only ledger as "1 ml".
 * `hideName` is for the import card, where the line's own name field is the product's name.
 */
export function ProductFields({
  draft,
  onChange,
  lockUnit,
  hideName,
}: {
  draft: ProductDraft;
  onChange: (d: ProductDraft) => void;
  lockUnit?: boolean;
  hideName?: boolean;
}) {
  const set = (patch: Partial<ProductDraft>) => onChange({ ...draft, ...patch });
  const paise = parseRupees(draft.price);
  const unit = minUnit(draft.base_unit);

  return (
    <View style={{ gap: 14 }}>
      {!hideName && (
        <Field
          label="Name"
          value={draft.name}
          onChangeText={(name) => set({ name })}
          placeholder="Amul Taaza milk"
          maxLength={80}
        />
      )}

      <View style={{ gap: 8 }}>
        <SectionLabel>What kind of thing is it?</SectionLabel>
        <Choice
          label="Category"
          value={draft.category}
          onChange={(category) => set({ category })}
          options={CATEGORIES.map((c) => ({ value: c as string, label: c }))}
        />
        <T size={13} soft>
          The label on Spending&apos;s &ldquo;Where it went&rdquo;, and the hint the put-away sheet uses to guess Fridge or Pantry.
        </T>
      </View>

      <View style={{ gap: 8 }}>
        <SectionLabel>Counted in</SectionLabel>
        {lockUnit ? (
          <T size={15} weight="600">
            {UNITS.find((u) => u.value === draft.base_unit)?.label} &middot; fixed, there is stock on the books
          </T>
        ) : (
          <Choice label="Counted in" value={draft.base_unit} onChange={(base_unit) => set({ base_unit })} options={UNITS} />
        )}
        <T size={13} soft>
          {draft.base_unit === 'pc'
            ? 'Pieces suit eggs, bread and cylinders. Milk counted in millilitres reads “1 L left” instead of “1 pc left”.'
            : `Stock switches to ${unit} past a thousand: 1800 ml reads “1.8 L”.`}
        </T>
      </View>

      <View style={{ gap: 8 }}>
        <Field
          label={`Keep at least (${unit}) · optional`}
          value={draft.min}
          onChangeText={(min) => set({ min })}
          keyboardType="decimal-pad"
          placeholder="none"
        />
        <T size={13} soft>
          {!draft.min.trim()
            ? 'Leave it empty and the app never adds this to the list on its own.'
            : parseMinQty(draft.min, draft.base_unit) !== null
              ? `Under ${draft.min.trim()} ${unit} in the house, it puts itself on the shopping list.`
              : `A number of ${unit}, or nothing at all.`}
        </T>
      </View>

      <View style={{ gap: 8 }}>
        <SectionLabel>Count what is in the house</SectionLabel>
        <Choice label="Track stock" value={yn(draft.track)} onChange={(v) => set({ track: v === 'yes' })} options={YES_NO} />
        <T size={13} soft>
          {draft.track
            ? 'Buying it opens the put-away sheet, so the fridge and the minimum above both work.'
            : 'Buy it without counting it: no put-away sheet, no low-stock nudge.'}
        </T>
      </View>

      <Field
        label="Usual price (₹) · optional"
        value={draft.price}
        onChangeText={(price) => set({ price })}
        keyboardType="decimal-pad"
        placeholder="none"
      />
      {paise !== null && (
        <T size={13} soft>
          Quick Add will offer {formatINR(paise)}.
        </T>
      )}

      <View style={{ gap: 8 }}>
        <SectionLabel>Show in quick add</SectionLabel>
        <Choice
          label="Show in quick add"
          value={yn(draft.favourite)}
          onChange={(v) => set({ favourite: v === 'yes' })}
          options={YES_NO}
        />
      </View>
    </View>
  );
}
