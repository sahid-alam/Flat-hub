// Everything on hand, grouped by where it lives. The "Running low" block is the shopping list's own
// rule (domain/stock.shoppingList), so the two screens can never disagree about what's short.
import { Stack, router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { isEmpty, onHand, shoppingList } from '@/domain/stock';
import { Block, Icon, Pill, Rule, Screen, SectionLabel, T, tokens, usePalette } from '@/ui/kit';
import { GroupHead, WarnChip, countLabel, fmtQty, useStock, type StockProductRow } from '@/ui/stock';

const PLACES = ['fridge', 'freezer', 'pantry'] as const;

export default function Stock() {
  const c = usePalette();
  const { lots, moves, products, loading } = useStock();

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
    <Screen>
      <Stack.Screen
        options={{
          title: 'Stock',
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/fridge')}
              style={{ minHeight: 48, justifyContent: 'center' }}>
              <Pill label="Fridge" />
            </Pressable>
          ),
        }}
      />

      {low.length > 0 && (
        <Block
          tone="stone"
          onPress={() => router.push('/shopping')}
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

      {loading ? null : held.length === 0 ? (
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
    </Screen>
  );
}
