// Shared pieces of the capture sheets (/spend, /topup, /import): the big amount entry, the lines balance bar
// and the skeleton shown while an order is being read.
import { useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isApp, SOURCE_LABEL, SOURCES, type Source } from '@/domain/kitty';
import { formatINR } from '@/domain/money';
import { Block, DISPLAY, Field, Icon, MagnetButton, Row, Rule, SectionLabel, T, focusRing, usePalette, useInk } from '@/ui/kit';

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
          placeholderTextColor="rgba(46,44,40,0.42)" // a true placeholder on stone: an empty field must not read as a typed 0
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
            ...focusRing(ink.ink),
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

/**
 * Where a spend came from, as one line and not a grid of chips. There are seven sources now — five
 * apps, a shop, and other — and the owner's note on the chip grid was "here is what I didn't like
 * how we are showing the options of 'where from'", so the answer is removal. The extractor already
 * reads the store off the bill, so this states what it found and gets out of the way; the picker
 * sits behind a tap rather than on screen.
 * ponytail: the same scrim-and-lip shape as the Add sheet and the fridge's lot sheet. That is three
 * copies, so a shared <Sheet> is now worth extracting — in kit, which this branch doesn't own.
 */
export function SourceRow({
  source,
  store,
  onChange,
  onChangeStore,
  detected,
}: {
  source: Source;
  store: string;
  onChange: (s: Source) => void;
  onChangeStore: (s: string) => void;
  /** The reader picked this off the bill, so the row says so: it is a confirm line, not a question. */
  detected?: boolean;
}) {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  // An app order names its own store; only a shop bill has a name worth typing in.
  const title = [SOURCE_LABEL[source], isApp(source) ? null : store.trim()].filter(Boolean).join(' · ');
  return (
    <View style={{ gap: 8 }}>
      <SectionLabel>Where from</SectionLabel>
      <Block style={{ gap: 0, paddingVertical: 4 }}>
        <Row
          label={title}
          icon={{ ios: 'storefront', android: 'storefront' }}
          detail={detected ? 'read off the bill' : 'tap to change'}
          onPress={() => setOpen(true)}
        />
      </Block>
      {!isApp(source) && (
        <Field label="Store (optional)" value={store} onChangeText={onChangeStore} placeholder="Sharma Dairy" />
      )}

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          {/* The backdrop is the sheet's sibling, never its parent: as a wrapper it makes every row
              a <button> inside a <button>. Esc still closes through onRequestClose. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={() => setOpen(false)}
            style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]}
          />
          <View
            role="dialog"
            accessibilityLabel="Where from"
            style={{ backgroundColor: c.ground, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 8 }}>
            <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: c.line }} />
            <View style={{ padding: 16, paddingBottom: insets.bottom + 16, gap: 12 }}>
              <Block style={{ gap: 0, paddingVertical: 4 }}>
                {SOURCES.map((s, i) => (
                  <View key={s}>
                    {i > 0 && <Rule />}
                    <Row
                      label={SOURCE_LABEL[s]}
                      detail={
                        s === source ? (
                          <Icon name={{ ios: 'checkmark', android: 'check' }} size={18} color={c.accentText} />
                        ) : undefined
                      }
                      onPress={() => {
                        onChange(s);
                        setOpen(false);
                      }}
                    />
                  </View>
                ))}
              </Block>
            </View>
          </View>
        </View>
      </Modal>
    </View>
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
