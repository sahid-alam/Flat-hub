// Shared pieces for /fridge and /stock: quantity and expiry wording, and the warm (never clay)
// marker chip. The maths lives in @/domain/stock; the rows come from useHousehold().
import { Pressable, View } from 'react-native';

import { isEmpty, onHand, shoppingList } from '@/domain/stock';
import { useHousehold, type LotRow, type MoveRow, type ProductRow } from '@/lib/books';
import { Block, Icon, Rule, SectionLabel, T, tokens, usePalette } from '@/ui/kit';

const PLACES = ['fridge', 'freezer', 'pantry'] as const;

export type { LotRow, MoveRow };
export type StockProductRow = ProductRow;

/** Days: at or under this, the expiry chip turns warm. Shared by /fridge and the home Fridge row. */
export const SOON = 2;

/** Lots, the stock_move ledger and the products behind them — all from the one household load. */
export function useStock() {
  const { lots, moves, products, reload } = useHousehold();
  return { lots, moves, products, reload };
}

/** 1200 g → "1.2 kg", 1800 ml → "1.8 L", 4 pc → "4 pc". Base units only; the DB holds 3 decimals. */
export function fmtQty(qty: number, unit: 'g' | 'ml' | 'pc'): string {
  if (unit === 'pc') return `${+qty.toFixed(3)} pc`;
  if (qty >= 1000) return `${+(qty / 1000).toFixed(2)} ${unit === 'ml' ? 'L' : 'kg'}`;
  return `${+qty.toFixed(3)} ${unit}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Expiry in words. Far-off dates read as a month ("Good till Jan 2027"), not a count of days. */
export function daysLabel(days: number, expiry: string): string {
  if (days < -1) return `Expired ${-days} days ago`;
  if (days === -1) return 'Expired yesterday';
  if (days === 0) return 'Use today';
  if (days === 1) return '1 day left';
  if (days <= 30) return `${days} days left`;
  return `Good till ${MONTHS[Number(expiry.slice(5, 7)) - 1]} ${expiry.slice(0, 4)}`;
}

/** Warm marker: expiring, expired or low. DESIGN.md keeps clay for failed saves, so this is warnBg/warnFg. */
export function WarnChip({ label }: { label: string }) {
  const c = usePalette();
  return (
    <View style={{ alignSelf: 'flex-start', borderRadius: 9999, backgroundColor: c.warnBg, paddingHorizontal: 8, paddingVertical: 2 }}>
      <T size={12} weight="700" color={c.warnFg} style={{ lineHeight: 16 }}>
        {label}
      </T>
    </View>
  );
}

/** One of the three per-lot actions: a 48pt pill that shares its row. `tone` is the sheet's
 *  hierarchy — 'brass' is the expected action (one per sheet), 'negative' the clay-bordered loss. */
export function ActionButton({
  label,
  accessibilityLabel,
  disabled,
  onPress,
  tone,
}: {
  label: string;
  accessibilityLabel: string;
  disabled?: boolean;
  onPress: () => void;
  tone?: 'brass' | 'negative';
}) {
  const c = usePalette();
  const edge = tone === 'brass' ? c.accent : tone === 'negative' ? c.negative : c.line;
  const fg = tone === 'brass' ? c.onAccent : tone === 'negative' ? c.negative : c.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          flex: 1,
          minHeight: 48,
          borderRadius: 9999,
          borderWidth: 1.5,
          borderColor: disabled ? c.hair : edge,
          backgroundColor: tone === 'brass' && !disabled ? c.accent : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 4,
        },
        pressed && { transform: [{ scale: 0.97 }] },
      ]}>
      {/* react-native-web ignores adjustsFontSizeToFit, so the longest label ("Threw away") is
          fitted by type size and padding rather than by shrinking at runtime. */}
      <T size={14} weight="700" numberOfLines={1} color={disabled ? c.muted : fg}>
        {label}
      </T>
    </Pressable>
  );
}

/** A section head inside a block: "FRIDGE" on the left, a count or a hint on the right. */
export function GroupHead({ title, detail }: { title: string; detail?: string }) {
  const c = usePalette();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, minHeight: 28 }}>
      <T size={12} weight="700" color={c.muted} style={{ letterSpacing: 1.9 }}>
        {title.toUpperCase()}
      </T>
      {detail ? (
        <T size={13} soft>
          {detail}
        </T>
      ) : null}
    </View>
  );
}

export const countLabel = (n: number): string => `${n} item${n === 1 ? '' : 's'}`;

// ---------------------------------------------------------------- the Stock segment

/** Everything on hand, grouped by where it lives. The "Running low" block is the shopping list's own
 *  rule (domain/stock.shoppingList), so the two segments can never disagree about what's short. */
export function StockBody({ onShopping }: { onShopping: () => void }) {
  const c = usePalette();
  const { lots, moves, products } = useStock();

  const byId = new Map(products.map((p) => [p.id, p]));
  const held = lots.filter((l) => !isEmpty(l.id, moves));
  const low = shoppingList(products, lots, moves, []);
  // `have` on a low row counts every location, so the chip reads the same here as on the shopping list.
  const lowBy = new Map(low.filter((r) => r.product_id).map((r) => [r.product_id!, r]));

  // One row per product per location: two dahi cups in the fridge read as one 650 g line.
  const rowsAt = (where: string) => {
    const total = new Map<string, number>();
    for (const l of held.filter((x) => x.location === where))
      total.set(l.product_id, (total.get(l.product_id) ?? 0) + onHand(l.id, moves));
    return [...total]
      .map(([id, qty]) => ({ product: byId.get(id), qty }))
      .filter((r): r is { product: StockProductRow; qty: number } => !!r.product)
      .sort((a, b) => a.product.name.localeCompare(b.product.name));
  };

  return (
    <>
      {low.length > 0 && (
        <Block
          tone="stone"
          onPress={onShopping}
          accessibilityLabel={`Running low: ${low.length}. ${low.map((r) => r.name).join(', ')}. Open the shopping list`}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <SectionLabel>Running low</SectionLabel>
            <T size={40} num>
              {low.length}
            </T>
            <T size={15} numberOfLines={2}>
              {low.map((r) => r.name).join(' · ')}
            </T>
          </View>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: tokens.block.onyx,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Icon name={{ ios: 'arrow.up.right', android: 'arrow_outward' }} size={20} color={tokens.block.stone} />
          </View>
        </Block>
      )}

      {held.length === 0 ? (
        <Block>
          <T size={17} weight="700">
            Nothing on hand yet
          </T>
          <T soft>
            Stock comes from a spend: add one with a product you track, and the Put away step turns each line into a
            lot here. Mark things Finished in the fridge and they drop off this list.
          </T>
        </Block>
      ) : (
        PLACES.map((where) => {
          const rows = rowsAt(where);
          if (rows.length === 0) return null;
          return (
            <Block key={where}>
              <GroupHead title={where} detail={countLabel(rows.length)} />
              {rows.map(({ product, qty }, i) => {
                const short = lowBy.get(product.id);
                const mark =
                  short && short.min !== null
                    ? `Low · ${fmtQty(short.have, product.base_unit)} of ${fmtQty(short.min, product.base_unit)} min`
                    : null;
                return (
                  <View key={product.id} style={{ gap: 12 }}>
                    {i > 0 && <Rule />}
                    <View
                      accessible
                      accessibilityLabel={`${product.name}, ${fmtQty(qty, product.base_unit)}${mark ? `, ${mark}` : ''}`}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }}>
                      <View style={{ flex: 1, gap: 4 }}>
                        <T size={17} weight="600">
                          {product.name}
                        </T>
                        {mark && <WarnChip label={mark} />}
                      </View>
                      <T size={20} num color={c.ink}>
                        {fmtQty(qty, product.base_unit)}
                      </T>
                    </View>
                  </View>
                );
              })}
            </Block>
          );
        })
      )}
    </>
  );
}

/** What the Kitchen tab's Stock segment counts: distinct products on hand. */
export function stockItemCount(lots: LotRow[], moves: MoveRow[]): number {
  return new Set(lots.filter((l) => !isEmpty(l.id, moves)).map((l) => l.product_id)).size;
}
