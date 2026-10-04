// Kitchen: fridge, shopping and stock in one tab, because all three answer "what food do we have
// or need". The segment lives in the URL, so /fridge, /shopping and /stock still land on the right
// one and a deep link is shareable. The bodies are the shipped screens, unchanged in behaviour.
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { useHousehold } from '@/lib/books';
import { FridgeBody, fridgeSoonCount } from '@/ui/fridge';
import { Choice, Screen, T, TAB_BAR, usePalette } from '@/ui/kit';
import { ShoppingBody, toBuyCount } from '@/ui/shopping';
import { StockBody, stockItemCount } from '@/ui/stock';

const SEGMENTS = ['fridge', 'shopping', 'stock'] as const;
type Seg = (typeof SEGMENTS)[number];

export default function Kitchen() {
  const c = usePalette();
  const { seg } = useLocalSearchParams<{ seg?: string }>();
  const { lots, moves, products, shopping } = useHousehold();

  const soon = fridgeSoonCount(lots, moves, new Date().toISOString());
  const toBuy = toBuyCount(products, lots, moves, shopping);
  const items = stockItemCount(lots, moves);

  // Landing segment: Shopping when anything is short, otherwise Fridge. An unknown ?seg falls back
  // to it rather than showing nothing.
  const landing: Seg = toBuy > 0 ? 'shopping' : 'fridge';
  const on: Seg = SEGMENTS.includes(seg as Seg) ? (seg as Seg) : landing;
  const show = (next: Seg) => router.setParams({ seg: next });

  return (
    <View style={{ flex: 1, backgroundColor: c.ground }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
          <T size={22} weight="700">
            Kitchen
          </T>
          <T size={13} soft>
            Fridge, shopping and stock
          </T>
        </View>
        {/* The counts ride on the labels: the chosen segment carries a check and an ink outline, so
            the others are free to say how much is behind them. */}
        <Choice<Seg>
          value={on}
          onChange={show}
          options={[
            { value: 'fridge', label: on === 'fridge' ? 'Fridge' : `Fridge · ${soon} soon` },
            { value: 'shopping', label: on === 'shopping' ? 'Shopping' : `Shopping · ${toBuy}` },
            { value: 'stock', label: on === 'stock' ? 'Stock' : `Stock · ${items}` },
          ]}
        />
      </View>
      <Screen padBottom={TAB_BAR}>
        {on === 'fridge' && <FridgeBody />}
        {on === 'shopping' && <ShoppingBody />}
        {on === 'stock' && <StockBody onShopping={() => show('shopping')} />}
      </Screen>
    </View>
  );
}
