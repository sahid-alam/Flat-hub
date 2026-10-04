// What's in the fridge and freezer, first-expired first-out. Every action appends a stock_move;
// nothing here ever updates or deletes a row. See docs/DATA_MODEL.md ("Stock & fridge").
import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { daysLeft, expiringSoon, fefo, isEmpty, onHand, staleWarning } from '@/domain/stock';
import { useHousehold } from '@/lib/books';
import { newId } from '@/lib/id';
import { insertOnce } from '@/lib/supabase';
import { Block, Chip, ErrorText, Pill, Rule, Screen, T } from '@/ui/kit';
import { ActionButton, GroupHead, WarnChip, WarnNote, daysLabel, fmtQty, useStock, type LotRow, type MoveRow, type StockProductRow } from '@/ui/stock';

const SOON = 2; // days: the chip turns warm
const URGENT = 0; // expired or due today: pulled to the top of the list

export default function Fridge() {
  const { me, household } = useHousehold();
  const { lots, moves, products, loading, error, reload } = useStock();
  const [busy, setBusy] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const now = new Date().toISOString();
  const byId = new Map(products.map((p) => [p.id, p]));
  const here = lots.filter((l) => l.location !== 'pantry' && !isEmpty(l.id, moves));
  const urgent = new Set(expiringSoon(here, now, URGENT).map((l) => l.id));
  const stale = new Set(staleWarning(here).map((l) => l.id));
  // FEFO first, then the expired and due-today lots pulled in front of it.
  const ordered = fefo(here);
  const sorted = [...ordered.filter((l) => urgent.has(l.id)), ...ordered.filter((l) => !urgent.has(l.id))];

  /** Appends one move. "Half left" removes half of what's on hand; "finished"/"threw away" remove all of it. */
  async function record(lot: LotRow, reason: 'consume' | 'discard', fraction: 1 | 0.5) {
    const have = onHand(lot.id, moves);
    if (have <= 0) return;
    const qty = Math.max(Math.round(have * fraction * 1000) / 1000, 0.001);
    setBusy(lot.id);
    setSaveError(null);
    try {
      await insertOnce('stock_move', {
        id: newId(),
        household_id: household.id,
        lot_id: lot.id,
        delta_qty: -Math.min(qty, have),
        reason,
        member_id: me.id,
      });
      await reload();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    }
    setBusy(null);
  }

  const group = (where: 'fridge' | 'freezer') => sorted.filter((l) => l.location === where);

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: 'Fridge',
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/stock')}
              style={{ minHeight: 48, justifyContent: 'center' }}>
              <Pill label="All stock" />
            </Pressable>
          ),
        }}
      />
      <ErrorText error={error ?? saveError} />
      {loading ? null : sorted.length === 0 ? (
        <Block>
          <T size={17} weight="700">
            Nothing in the fridge yet
          </T>
          <T soft>
            Lots come from a spend. Add one with a product you track, and the Put away step asks where it goes and
            when it expires — that's what fills this screen.
          </T>
        </Block>
      ) : (
        (['fridge', 'freezer'] as const).map((where) =>
          group(where).length === 0 ? null : (
            <Block key={where}>
              <GroupHead title={where} detail={where === 'fridge' ? 'First expired, first out' : undefined} />
              {group(where).map((lot, i) => (
                <View key={lot.id} style={{ gap: 10 }}>
                  {i > 0 && <Rule />}
                  <LotCard
                    lot={lot}
                    product={byId.get(lot.product_id)}
                    moves={moves}
                    days={daysLeft(lot.expiry_date, now)}
                    stale={stale.has(lot.id)}
                    busy={busy === lot.id}
                    onAction={record}
                  />
                </View>
              ))}
            </Block>
          ),
        )
      )}
    </Screen>
  );
}

function LotCard({
  lot,
  product,
  moves,
  days,
  stale,
  busy,
  onAction,
}: {
  lot: LotRow;
  product: StockProductRow | undefined;
  moves: MoveRow[];
  days: number | null;
  stale: boolean;
  busy: boolean;
  onAction: (lot: LotRow, reason: 'consume' | 'discard', fraction: 1 | 0.5) => void;
}) {
  const unit = product?.base_unit ?? 'pc';
  const name = product?.name ?? 'Unknown product';
  const left = fmtQty(onHand(lot.id, moves), unit);
  const bought = moves.filter((m) => m.lot_id === lot.id && m.reason === 'purchase').reduce((a, m) => a + m.delta_qty, 0);
  const size = bought > 0 ? fmtQty(bought, unit) : null;
  const what = size ? `${name} ${size}` : name;

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <T size={20} weight="700" style={{ flex: 1 }} numberOfLines={2}>
          {name}
        </T>
        <T size={17} num>
          {left} left
        </T>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        {days !== null && lot.expiry_date !== null ? (
          days <= SOON ? (
            <WarnChip label={daysLabel(days, lot.expiry_date)} />
          ) : (
            <Chip kind="pool" label={daysLabel(days, lot.expiry_date)} />
          )
        ) : null}
        {lot.opened && <Chip kind="pending" label="Opened" />}
        {size && (
          <T size={13} soft>
            {size} pack
          </T>
        )}
      </View>
      {stale && <WarnNote>{`This unopened pack expires before the opened ${name.toLowerCase()} — finish this one first.`}</WarnNote>}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <ActionButton
          label="Finished"
          accessibilityLabel={`${what} · mark finished`}
          disabled={busy}
          onPress={() => onAction(lot, 'consume', 1)}
        />
        <ActionButton
          label="Half left"
          accessibilityLabel={`${what} · mark half left`}
          disabled={busy}
          onPress={() => onAction(lot, 'consume', 0.5)}
        />
        <ActionButton
          label="Threw away"
          accessibilityLabel={`${what} · threw away`}
          disabled={busy}
          onPress={() => onAction(lot, 'discard', 1)}
        />
      </View>
    </View>
  );
}
