// Shared pieces for /fridge and /stock: quantity and expiry wording, and the warm (never clay)
// marker chip. The maths lives in @/domain/stock; the rows come from useHousehold().
import { Pressable, View } from 'react-native';

import { useHousehold, type ProductRow } from '@/lib/books';
import { T, usePalette } from '@/ui/kit';

export type { LotRow, MoveRow } from '@/lib/books';
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
          paddingHorizontal: 4,
        },
        pressed && { transform: [{ scale: 0.97 }] },
      ]}>
      {/* react-native-web ignores adjustsFontSizeToFit, so the longest label ("Threw away") is
          fitted by type size and padding rather than by shrinking at runtime. */}
      <T size={14} weight="700" numberOfLines={1} color={disabled ? c.muted : c.ink}>
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
