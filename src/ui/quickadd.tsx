// Kitty home quick-add: tap a favourite, tap save. A local spend paid by me, from the kitty unless I say own pocket,
// with one line pointing at the product so stock (M3) can pick it up later. Undo on the toast writes a reversal.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { formatINR, parseRupees, upiAmount } from '@/domain/money';
import { useHousehold, type ProductRow } from '@/lib/books';
import { newId } from '@/lib/id';
import { landed, supabase } from '@/lib/supabase';
import { sayError } from '@/lib/util';
import { reverseSpend } from '@/ui/activity';
import { Strip } from '@/ui/home';
import { Block, Choice, ErrorText, Field, MagnetButton, Row, Rule, SectionLabel, T, Tile, Toast } from '@/ui/kit';

const rupees = (paise: number | null) => (paise ? upiAmount(paise).replace(/\.00$/, '') : '');

const STRIP_TILE = 136;
const Pinned = ({ children }: { children: React.ReactNode }) => (
  <View style={{ width: STRIP_TILE }}>{children}</View>
);

type Logged = { spend: Parameters<typeof reverseSpend>[0]; name: string; undone?: boolean };

/**
 * `compact` is Home's version: one horizontally scrolling row of tiles, no card around it and no
 * import row — the owner asked for Quick add to stay but stop taking the best space on the screen.
 * The kitty ledger keeps the full card.
 */
export function QuickAdd({ compact }: { compact?: boolean } = {}) {
  const { products, household, reload } = useHousehold();
  const [picked, setPicked] = useState<ProductRow | null>(null);
  const [logged, setLogged] = useState<Logged | null>(null);
  const [undoError, setUndoError] = useState<string | null>(null);
  const favourites = products.filter((p) => p.favourite);

  // The toast stays long enough to reach Undo, then goes; the entry stays reversible from Recent.
  useEffect(() => {
    if (!logged) return;
    const t = setTimeout(() => setLogged(null), logged.undone ? 4000 : 8000);
    return () => clearTimeout(t);
  }, [logged]);

  async function undo() {
    if (!logged || logged.undone) return;
    setUndoError(null);
    try {
      await reverseSpend(logged.spend, household.id);
      setLogged({ ...logged, undone: true });
      await reload();
    } catch (e) {
      setUndoError((e as Error).message);
    }
  }

  // The tiles are the same tiles; only the container differs. The confirm form and the toast sit
  // below the strip rather than inside it, so a horizontal scroller never swallows a text field.
  const tiles = favourites.map((p) => (
    <Tile
      key={p.id}
      title={p.name}
      detail={p.default_price_paise ? formatINR(p.default_price_paise) : 'set price'}
      on={picked?.id === p.id}
      onPress={() => {
        setLogged(null);
        setPicked(picked?.id === p.id ? null : p);
      }}
    />
  ));

  if (compact)
    return (
      <View style={{ gap: 12 }}>
        <Strip>
          {/* Tile is flexGrow:1, which fills a horizontal scroller end to end, so each one is pinned
              to a fixed width here. Two and a bit are visible at 390pt, which is the point of a strip. */}
          {favourites.length === 0 ? (
            <Pinned>
              <Tile title="Pick favourites" detail="milk, atta, eggs" onPress={() => router.push('/favourites')} />
            </Pinned>
          ) : (
            <>
              {tiles.map((t) => (
                <Pinned key={t.key}>{t}</Pinned>
              ))}
              <Pinned>
                <Tile title="More" detail="edit the list" onPress={() => router.push('/favourites')} />
              </Pinned>
            </>
          )}
        </Strip>
        {picked && (
          <Confirm
            key={picked.id}
            product={picked}
            onDone={(spend) => {
              setPicked(null);
              setUndoError(null);
              setLogged({ spend, name: picked.name });
            }}
          />
        )}
        {logged && (
          <Toast
            message={
              logged.undone
                ? `${logged.name} ${formatINR(logged.spend.total_paise)} reversed`
                : `${logged.name} ${formatINR(logged.spend.total_paise)} logged`
            }
            onUndo={logged.undone ? undefined : undo}
          />
        )}
        <ErrorText error={undoError} />
      </View>
    );

  return (
    <Block>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: -4 }}>
        <SectionLabel>Quick add</SectionLabel>
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push('/favourites')}
          style={{ minHeight: 48, minWidth: 48, justifyContent: 'center', alignItems: 'flex-end' }}>
          <T size={15} weight="700" style={{ textDecorationLine: 'underline' }}>
            {favourites.length ? 'Edit favourites' : 'Pick favourites'}
          </T>
        </Pressable>
      </View>
      {favourites.length === 0 ? (
        <T soft>Star the things you buy every week (milk, bread, eggs) and they show up here for a two-tap spend.</T>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{tiles}</View>
      )}
      {picked && (
        <Confirm
          key={picked.id}
          product={picked}
          onDone={(spend) => {
            setPicked(null);
            setUndoError(null);
            setLogged({ spend, name: picked.name });
          }}
        />
      )}
      <Rule />
      <Row
        label="Read a bill"
        icon={{ ios: 'doc.viewfinder', android: 'receipt_long' }}
        onPress={() => router.push('/import')}
      />
      {logged && (
        <Toast
          message={
            logged.undone
              ? `${logged.name} ${formatINR(logged.spend.total_paise)} reversed`
              : `${logged.name} ${formatINR(logged.spend.total_paise)} logged`
          }
          onUndo={logged.undone ? undefined : undo}
        />
      )}
      <ErrorText error={undoError} />
    </Block>
  );
}

function Confirm({ product, onDone }: { product: ProductRow; onDone: (spend: Logged['spend']) => void }) {
  const { me, household, holder, reload } = useHousehold();
  const [text, setText] = useState(rupees(product.default_price_paise));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paidFrom, setPaidFrom] = useState<'pool' | 'personal'>('pool');
  const [ids] = useState(() => ({ spend: newId(), line: newId() })); // a retried save is a no-op
  const paise = parseRupees(text);

  async function save() {
    if (!paise) return;
    setBusy(true);
    setError(null);
    const spend = {
      id: ids.spend,
      household_id: household.id,
      source: 'local' as const,
      store_name: null,
      paid_by: me.id,
      paid_from: paidFrom,
      total_paise: paise,
    };
    const { error } = await supabase.rpc('add_spend', {
      p_spend: spend,
      p_lines: [{ id: ids.line, name: product.name, product_id: product.id, line_total_paise: paise, kind: 'item' }],
    });
    if (error && !(await landed('spend', ids.spend))) {
      setBusy(false);
      return setError(sayError(error, holder?.display_name));
    }
    await reload();
    onDone(spend);
  }

  return (
    <View style={{ gap: 12 }}>
      <Field
        label={`${product.name} (₹)`}
        value={text}
        onChangeText={setText}
        keyboardType="decimal-pad"
        placeholder="0"
        autoFocus={!product.default_price_paise}
      />
      <Choice
        value={paidFrom}
        onChange={setPaidFrom}
        options={[
          { value: 'pool', label: 'The kitty' },
          { value: 'personal', label: 'Own pocket' },
        ]}
      />
      <T size={15} soft>
        {paidFrom === 'pool'
          ? 'Local shop · paid by you · from the kitty'
          : "Local shop · paid by you · goes on the treasurer's \"to reimburse\" list"}
      </T>
      <ErrorText error={error} />
      <MagnetButton
        label={busy ? 'Saving…' : paise ? `Save ${formatINR(paise)}` : 'Enter an amount'}
        disabled={busy || !paise}
        onPress={save}
      />
    </View>
  );
}
