// Kitchen: fridge, shopping and stock in one tab, because all three answer "what food do we have
// or need". The segment lives in the URL, so /fridge, /shopping and /stock still land on the right
// one and a deep link is shareable. The bodies are the shipped screens, unchanged in behaviour.
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { useHousehold } from '@/lib/books';
import { FridgeBody } from '@/ui/fridge';
import { Choice, Screen, T, TAB_BAR, usePalette } from '@/ui/kit';
import { ShoppingBody, toBuyCount } from '@/ui/shopping';
import { StockBody } from '@/ui/stock';

const SEGMENTS = ['fridge', 'shopping', 'stock'] as const;
type Seg = (typeof SEGMENTS)[number];

export default function Kitchen() {
  const c = usePalette();
  const { seg } = useLocalSearchParams<{ seg?: string }>();
  const { lots, moves, products, shopping, reload } = useHousehold();

  // Tabs stay mounted and nothing else refetches, so without this the Kitchen can show hours-old
  // stock: a mate ticks the last milk on their phone and you still see it here.
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  // Landing segment: Shopping when anything is short, otherwise Fridge — latched at mount. Live,
  // it used to move under your finger: ticking the last item dropped the count to zero and threw
  // you off Shopping onto the Fridge mid-action.
  const [landed] = useState<Seg>(() => (toBuyCount(products, lots, moves, shopping) > 0 ? 'shopping' : 'fridge'));
  const on: Seg = SEGMENTS.includes(seg as Seg) ? (seg as Seg) : landed;
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
        {/* Equal thirds, one row. The counts used to ride on the labels, which pushed the three
            chips onto two lines at 390pt — a wrapped switch reads as two controls. Each body
            already says its own count ("5 still to buy", the expiry pills, the per-section totals),
            so the switch only has to say which view you are on. */}
        <Choice<Seg>
          fill
          label="What to show"
          value={on}
          onChange={show}
          options={[
            { value: 'fridge', label: 'Fridge' },
            { value: 'shopping', label: 'Shopping' },
            { value: 'stock', label: 'Stock' },
          ]}
        />
      </View>
      {/* All three stay mounted, hidden rather than unmounted: switching away used to throw away
          the typed "What do we need?" text, the open lot sheet and FridgeBody's pending-move map,
          which is what stops a retry minting a second stock_move.
          ponytail: one shared ScrollView, so the scroll position is shared too — per-segment
          scroll memory would need a ScrollView per body. */}
      <Screen padBottom={TAB_BAR}>
        <View style={{ display: on === 'fridge' ? 'flex' : 'none', gap: 16 }}>
          <FridgeBody />
        </View>
        <View style={{ display: on === 'shopping' ? 'flex' : 'none', gap: 16 }}>
          <ShoppingBody />
        </View>
        <View style={{ display: on === 'stock' ? 'flex' : 'none', gap: 16 }}>
          <StockBody onShopping={() => show('shopping')} />
        </View>
      </Screen>
    </View>
  );
}
