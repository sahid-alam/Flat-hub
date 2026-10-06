// What's in the fridge and freezer, first-expired first-out. Every action appends a stock_move;
// nothing here ever updates or deletes a row. See docs/DATA_MODEL.md ("Stock & fridge").
// The body lives here so the Kitchen tab and the old /fridge path render the same screen.
import { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { istDate } from '@/domain/kitty';
import { formatINR } from '@/domain/money';
import { daysLeft, expiringSoon, fefo, isEmpty, onHand, staleWarning } from '@/domain/stock';
import { useHousehold } from '@/lib/books';
import { newId } from '@/lib/id';
import { insertOnce, supabase } from '@/lib/supabase';
import { dayLabel } from '@/lib/util';
import { WarnNote } from '@/ui/capture';
import { Block, Chip, ErrorText, Icon, Rule, T, usePalette } from '@/ui/kit';
import { ActionButton, GroupHead, SOON, WarnChip, daysLabel, fmtQty, useStock, type LotRow, type MoveRow, type StockProductRow } from '@/ui/stock';

const URGENT = 0; // expired or due today: pulled to the top of the list

type Act = (lot: LotRow, reason: 'consume' | 'discard', fraction: 1 | 0.5) => void;

export function FridgeBody() {
  const { me, household } = useHousehold();
  const { lots, moves, products, reload } = useStock();
  const [busy, setBusy] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null); // the lot whose detail sheet is open
  // One id per pending action, kept until a reload confirms it: a retry after a lost response then
  // hits insertOnce's 23505 path instead of minting a second move against a stale on-hand.
  const pending = useRef(new Map<string, string>());

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
    const key = `${lot.id}:${reason}:${fraction}`;
    const moveId = pending.current.get(key) ?? newId();
    pending.current.set(key, moveId);
    setBusy(lot.id);
    setSaveError(null);
    try {
      await insertOnce('stock_move', {
        id: moveId,
        household_id: household.id,
        lot_id: lot.id,
        delta_qty: -Math.min(qty, have),
        reason,
        member_id: me.id,
      });
      await reload();
      pending.current.delete(key); // only once the move is visible: before that, the id must stand
      if (fraction === 1) setDetail(null); // the lot is gone from the list; its sheet goes with it
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    }
    setBusy(null);
  }

  /** `lot` is not a ledger: opened is a plain flag, and the migration grants exactly this column. */
  async function markOpened(lot: LotRow) {
    setBusy(lot.id);
    setSaveError(null);
    const { error } = await supabase.from('lot').update({ opened: true }).eq('id', lot.id);
    if (error) setSaveError(error.message);
    else await reload();
    setBusy(null);
  }

  const group = (where: 'fridge' | 'freezer') => sorted.filter((l) => l.location === where);
  const open = sorted.find((l) => l.id === detail) ?? null;

  if (sorted.length === 0)
    return (
      <>
        <ErrorText error={saveError} />
        <Block>
          <T size={17} weight="700">
            Nothing in the fridge yet
          </T>
          <T soft>
            Lots come from a spend. Add one with a product you track, and the Put away step asks where it goes and
            when it expires — that&apos;s what fills this screen.
          </T>
        </Block>
      </>
    );

  return (
    <>
      <ErrorText error={saveError} />
      {(['fridge', 'freezer'] as const).map((where) =>
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
                  onOpen={markOpened}
                  onDetail={() => setDetail(lot.id)}
                />
              </View>
            ))}
          </Block>
        ),
      )}
      {open && (
        <LotDetail
          lot={open}
          product={byId.get(open.product_id)}
          days={daysLeft(open.expiry_date, now)}
          busy={busy === open.id}
          onAction={record}
          onClose={() => setDetail(null)}
        />
      )}
    </>
  );
}

/** How much is on hand and how big the pack was — the two numbers both the card and the sheet show. */
function amounts(lot: LotRow, product: StockProductRow | undefined, moves: MoveRow[]) {
  const unit = product?.base_unit ?? 'pc';
  const name = product?.name ?? 'Unknown product';
  const left = fmtQty(onHand(lot.id, moves), unit);
  const bought = moves.filter((m) => m.lot_id === lot.id && m.reason === 'purchase').reduce((a, m) => a + m.delta_qty, 0);
  const size = bought > 0 ? fmtQty(bought, unit) : null;
  return { name, left, size, what: size ? `${name} ${size}` : name };
}

function LotCard({
  lot,
  product,
  moves,
  days,
  stale,
  busy,
  onOpen,
  onDetail,
}: {
  lot: LotRow;
  product: StockProductRow | undefined;
  moves: MoveRow[];
  days: number | null;
  stale: boolean;
  busy: boolean;
  onOpen: (lot: LotRow) => void;
  onDetail: () => void;
}) {
  const c = usePalette();
  const { name, left, size, what } = amounts(lot, product, moves);

  return (
    <View style={{ gap: 10 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${what}, ${left} left · details`}
        onPress={onDetail}
        style={({ pressed }) => [
          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, minHeight: 48 },
          pressed && { opacity: 0.6 },
        ]}>
        <T size={20} weight="700" style={{ flex: 1 }} numberOfLines={2}>
          {name}
        </T>
        <T size={17} num>
          {left} left
        </T>
        {/* the disclosure every other navigable row in the app has: without it nobody guesses that
            tapping "Milk" leads anywhere, and the three actions now live only in the sheet */}
        <Icon name={{ ios: 'chevron.right', android: 'chevron_right' }} size={18} color={c.muted} />
      </Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        {days !== null && lot.expiry_date !== null ? (
          days <= SOON ? (
            <WarnChip label={daysLabel(days, lot.expiry_date)} bad={days < 0} />
          ) : (
            <Chip kind="pool" label={daysLabel(days, lot.expiry_date)} />
          )
        ) : null}
        {lot.opened ? (
          <Chip kind="pending" label="Opened" />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${what} · mark opened`}
            disabled={busy}
            onPress={() => onOpen(lot)}
            // 48pt target on a 24pt chip: the negative margin keeps the row's height unchanged.
            style={({ pressed }) => [{ minHeight: 48, justifyContent: 'center', marginVertical: -12 }, pressed && { opacity: 0.6 }]}>
            <View style={{ borderRadius: 9999, borderWidth: 1.5, borderColor: c.line, paddingHorizontal: 10, paddingVertical: 2 }}>
              <T size={12} weight="700" soft style={{ lineHeight: 16 }}>
                Mark opened
              </T>
            </View>
          </Pressable>
        )}
        {size && (
          <T size={13} soft>
            {size} pack
          </T>
        )}
      </View>
      {stale && (
        <WarnNote>
          <T size={13} weight="600" color={c.warnFg}>{`This unopened pack expires before the opened ${name.toLowerCase()} — finish this one first.`}</T>
        </WarnNote>
      )}
    </View>
  );
}

/** Finished · Half left · Threw away — the only three things a lot can be told, and only from the
 *  sheet: on every list row they made each lot ~250pt tall, so three and a half lots filled a phone.
 *  Finished is the sheet's one accent; Threw away wears clay, because it records a loss. */
function Actions({ lot, what, busy, onAction }: { lot: LotRow; what: string; busy: boolean; onAction: Act }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <ActionButton tone="brass" label="Finished" accessibilityLabel={`${what} · mark finished`} disabled={busy} onPress={() => onAction(lot, 'consume', 1)} />
      <ActionButton label="Half left" accessibilityLabel={`${what} · mark half left`} disabled={busy} onPress={() => onAction(lot, 'consume', 0.5)} />
      <ActionButton tone="negative" label="Threw away" accessibilityLabel={`${what} · threw away`} disabled={busy} onPress={() => onAction(lot, 'discard', 1)} />
    </View>
  );
}

/** One lot, read-only but for the same three actions: what it is, how much is left, when it goes
 *  off, and which spend it arrived on. Nothing else about a lot is editable anywhere. */
function LotDetail({
  lot,
  product,
  days,
  busy,
  onAction,
  onClose,
}: {
  lot: LotRow;
  product: StockProductRow | undefined;
  days: number | null;
  busy: boolean;
  onAction: Act;
  onClose: () => void;
}) {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const { moves, lines, spends, name: nameOf } = useHousehold();
  const { name, left, size, what } = amounts(lot, product, moves);

  const line = lines.find((l) => l.id === lot.spend_line_id) ?? null;
  const spend = line ? (spends.find((s) => s.id === line.spend_id) ?? null) : null;
  const store = spend ? (spend.store_name ?? (spend.source === 'zepto' ? 'Zepto' : 'Shop')) : null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: c.scrim, justifyContent: 'flex-end' }}>
        <View
          role="dialog"
          accessibilityLabel={`${what} · details`}
          style={{ maxHeight: '90%', backgroundColor: c.ground, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 8 }}>
          <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: c.line }} />
          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }}>
            <T size={22} weight="700">
              {name}
            </T>
            <Block tone="stone">
              <T size={13} weight="600">
                Left
              </T>
              <T num size={40} style={{ lineHeight: 42 }}>
                {left}
              </T>
              <T size={13} weight="600">
                {size ? `of a ${size} pack` : 'of what was bought'} · in the {lot.location}
              </T>
            </Block>
            <Block>
              <Fact label="Expires" value={days !== null && lot.expiry_date !== null ? daysLabel(days, lot.expiry_date) : 'No expiry recorded'} />
              <Rule />
              <Fact label="Opened" value={lot.opened ? 'Yes' : 'Not yet'} />
              <Rule />
              <Fact label="Put away" value={dayLabel(istDate(lot.received_at))} />
            </Block>
            <Block>
              <GroupHead title="Where it came from" />
              {spend && line ? (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                    <T size={17} weight="700" style={{ flex: 1 }} numberOfLines={2}>
                      {line.name}
                    </T>
                    <T num size={17}>
                      {formatINR(line.line_total_paise)}
                    </T>
                  </View>
                  <T size={13} soft>
                    {store} · {dayLabel(istDate(spend.occurred_at))} · paid by {nameOf(spend.paid_by)}{' '}
                    {spend.paid_from === 'pool' ? 'from the pool' : 'from their own pocket'}
                  </T>
                </>
              ) : (
                <T size={13} soft>
                  No spend is linked to this lot.
                </T>
              )}
            </Block>
            <Actions what={what} busy={busy} lot={lot} onAction={onAction} />
            <T size={13} soft>
              A mistake is corrected with the opposite action.
            </T>
          </ScrollView>
          <View style={{ padding: 16, paddingBottom: insets.bottom + 16, borderTopWidth: 1, borderTopColor: c.hair }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Close ${what}`}
              onPress={onClose}
              style={({ pressed }) => [{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }, pressed && { opacity: 0.6 }]}>
              <T size={15} weight="700" soft>
                Close
              </T>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, minHeight: 32 }}>
      <T size={15} soft>
        {label}
      </T>
      <T size={15} weight="700" style={{ flexShrink: 1, textAlign: 'right' }}>
        {value}
      </T>
    </View>
  );
}

/** What the Kitchen tab's Fridge segment counts: lots that go off within SOON days. */
export function fridgeSoonCount(lots: LotRow[], moves: MoveRow[], now: string): number {
  return expiringSoon(
    lots.filter((l) => l.location !== 'pantry' && !isEmpty(l.id, moves)),
    now,
    SOON,
  ).length;
}
