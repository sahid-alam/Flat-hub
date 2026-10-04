// Shared pieces for /fridge and /stock: the data load, quantity and expiry wording, and the warm
// (never clay) marker chip. The maths lives in @/domain/stock; nothing here decides an order.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import type { Lot, Move, StockProduct } from '@/domain/stock';
import { useHousehold } from '@/lib/books';
import { supabase } from '@/lib/supabase';
import { T, usePalette } from '@/ui/kit';

export type LotRow = Lot & { created_at: string };
export type MoveRow = Move & { reason: 'purchase' | 'consume' | 'discard' | 'adjust' };
export type StockProductRow = StockProduct & { base_unit: 'g' | 'ml' | 'pc'; category: string | null };

/**
 * Lots, the stock_move ledger and the products behind them.
 * ponytail: its own fetch because books.tsx is another agent's file and doesn't carry min_qty/base_unit
 * yet. Same field names as contract 3, so integrating is swapping this body for useHousehold().
 */
export function useStock() {
  const { household } = useHousehold();
  const id = household.id;
  const [data, setData] = useState<{ lots: LotRow[]; moves: MoveRow[]; products: StockProductRow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [lots, moves, products] = await Promise.all([
      supabase.from('lot').select('id, product_id, location, expiry_date, opened, received_at, created_at').eq('household_id', id),
      supabase.from('stock_move').select('lot_id, delta_qty, reason').eq('household_id', id),
      supabase.from('product').select('id, name, category, track_stock, min_qty, base_unit').eq('household_id', id).order('name'),
    ]);
    const bad = [lots, moves, products].find((r) => r.error);
    if (bad) return setError(bad.error!.message);
    setError(null);
    setData({ lots: lots.data!, moves: moves.data!, products: products.data! });
  }, [id]);

  // Reloads on every focus, so coming back from Put away or the shopping list shows the new lots.
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  return { ...(data ?? { lots: [], moves: [], products: [] }), loading: data === null, error, reload };
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

/** The same warm tone as a block of prose: "this unopened pack expires before the opened one". */
export function WarnNote({ children }: { children: string }) {
  const c = usePalette();
  return (
    <View style={{ borderRadius: 14, backgroundColor: c.warnBg, paddingHorizontal: 12, paddingVertical: 8 }}>
      <T size={13} weight="600" color={c.warnFg}>
        {children}
      </T>
    </View>
  );
}

/** One of the three per-lot actions: an outlined 48pt pill that shares its row. */
export function ActionButton({
  label,
  accessibilityLabel,
  disabled,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const c = usePalette();
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
          borderColor: disabled ? c.hair : c.line,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 8,
        },
        pressed && { transform: [{ scale: 0.97 }] },
      ]}>
      <T size={15} weight="700" color={disabled ? c.muted : c.ink}>
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
