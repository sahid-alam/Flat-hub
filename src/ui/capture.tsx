// Shared pieces of the capture sheets (/spend, /topup, /import): the big amount entry, the lines balance bar
// and the skeleton shown while an order is being read.
import type { ReactNode } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

import { formatINR } from '@/domain/money';
import { Block, DISPLAY, Icon, MagnetButton, SectionLabel, T, tokens, usePalette, useInk } from '@/ui/kit';

/** The amount as a giant Bricolage entry on a stone block: small top-aligned ₹, onyx underline so it reads as a field. */
export function HeroInput({ label, ...props }: TextInputProps & { label: string }) {
  const ink = useInk();
  return (
    <View style={{ gap: 4 }}>
      <SectionLabel>{label}</SectionLabel>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', borderBottomWidth: 2, borderColor: ink.ink }}>
        <T num size={34} style={{ lineHeight: 40, marginTop: 6, marginRight: 4 }}>
          ₹
        </T>
        <TextInput
          accessibilityLabel={label}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={tokens.block.onyxMuted}
          selectionColor={ink.ink}
          {...props}
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: DISPLAY,
            fontSize: 60,
            height: 76,
            paddingVertical: 0,
            letterSpacing: -1.5,
            color: ink.ink,
            fontVariant: ['lining-nums', 'tabular-nums'],
          }}
        />
      </View>
    </View>
  );
}

/** A stone header block holding the amount. Only the label and the HeroInput go inside (controls don't follow block ink). */
export function AmountBlock(props: TextInputProps & { label: string }) {
  return (
    <Block tone="stone" style={{ paddingTop: 18, paddingBottom: 18 }}>
      <HeroInput {...props} />
    </Block>
  );
}

/** The line that closes the gap between the lines and the amount paid: a fee for a shortfall, a discount for an excess. */
export function roundingLine(diff: number): { name: string; amount: string; kind: 'fee' | 'discount' } {
  return { name: 'Unlisted / rounding', amount: String(Math.abs(diff) / 100), kind: diff > 0 ? 'fee' : 'discount' };
}

/** "Lines ₹723 = Paid ₹723 · Adds up", or the warm neutral "Off by ₹14" bar with a fix. Never clay. */
export function BalanceBar({ total, lines, onFix }: { total: number; lines: number; onFix: () => void }) {
  const c = usePalette();
  if (lines === total)
    return (
      <View accessibilityRole="text" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 }}>
        <Icon name={{ ios: 'checkmark.circle.fill', android: 'check_circle' }} size={20} color={c.positive} />
        <T size={15} weight="700" style={{ flex: 1 }}>
          Lines {formatINR(lines)} = Paid {formatINR(total)} · Adds up
        </T>
      </View>
    );
  const diff = total - lines;
  return (
    <View role="status" style={{ backgroundColor: c.warnBg, borderRadius: 20, padding: 14, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name={{ ios: 'exclamationmark.circle', android: 'error_outline' }} size={20} color={c.warnFg} />
        <T size={15} weight="600" color={c.warnFg} style={{ flex: 1 }}>
          Lines {formatINR(lines)} · Paid {formatINR(total)}
        </T>
        <T size={15} weight="700" color={c.warnFg}>
          Off by {formatINR(Math.abs(diff))}
        </T>
      </View>
      <MagnetButton
        label={`Add unlisted / rounding line ${formatINR(diff, { sign: true })}`}
        icon={{ ios: 'plus', android: 'add' }}
        onPress={onFix}
      />
    </View>
  );
}

/** A warm neutral note: something to check, not an error. */
export function WarnNote({ children }: { children: ReactNode }) {
  const c = usePalette();
  return (
    <View style={{ backgroundColor: c.warnBg, borderRadius: 20, padding: 14, gap: 4 }}>
      {children}
    </View>
  );
}

/** "Reading…" placeholder while the order is extracted. Bars are decorative; the live label speaks. */
export function ReadingSkeleton({ what }: { what: string }) {
  const c = usePalette();
  return (
    <View style={{ gap: 16 }}>
      <Block style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View
          style={{ width: 48, height: 56, borderRadius: 12, borderWidth: 1.5, borderColor: c.line, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={{ ios: 'doc.text', android: 'description' }} size={22} color={c.muted} />
        </View>
        <View style={{ flex: 1, gap: 2 }} accessibilityLiveRegion="polite" role="status">
          <T weight="700">Zepto order</T>
          <T size={15} soft>
            Reading {what}…
          </T>
        </View>
      </Block>
      <Block style={{ gap: 0 }}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
          {[96, 64, 80, 56, 72, 60].map((w, i) => (
            <View
              key={i}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                minHeight: 56,
                borderTopWidth: i ? 1 : 0,
                borderColor: c.hair,
              }}>
              <View style={{ gap: 8 }}>
                <View style={{ width: w, height: 14, borderRadius: 7, backgroundColor: c.raised }} />
                <View style={{ width: 150, height: 8, borderRadius: 4, backgroundColor: c.raised }} />
              </View>
              <View style={{ width: 52, height: 14, borderRadius: 7, backgroundColor: c.raised }} />
            </View>
          ))}
        </View>
      </Block>
    </View>
  );
}
