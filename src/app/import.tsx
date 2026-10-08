// Read a bill (a screenshot of an app order, a photo of a paper bill, or typed text) → the LLM reads
// it → a confirm card → save. One door, not two: "import a Zepto order" and "photo of the bill" were
// the same reader wearing two hats, and the reader was never Zepto-specific.
// PDFs are not supported: it takes images only (supabase/functions/extract-spend/README.md).
// Nothing is saved until a mate has looked at the card and the lines add up.
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { flatShare, matchProduct, normalizeExtraction, normalizeName, type Extraction } from '@/domain/extraction';
import { isApp, linesBalance } from '@/domain/kitty';
import { formatINR, parseLineRupees, parseRupees } from '@/domain/money';
import { useHousehold, type SpendRow } from '@/lib/books';
import { extractSpend, type ExtractInput } from '@/lib/extract';
import { newId } from '@/lib/id';
import { landed, supabase } from '@/lib/supabase';
import { dateToTimestamp, sayError, today } from '@/lib/util';
import { AmountBlock, BalanceBar, ReadingSkeleton, roundingLine, SourceRow, WarnNote } from '@/ui/capture';
import { Block, Choice, DateField, ErrorText, Field, Icon, MagnetButton, Rule, Screen, SectionLabel, T, usePalette } from '@/ui/kit';
import { usePutAway } from '@/ui/putaway';

type Kind = 'item' | 'fee' | 'discount';
type Line = {
  id: string;
  name: string;
  amount: string;
  kind: Kind;
  qty: number;
  unit: string | null;
  product_id: string | null;
  confirmed: boolean; // exact name/alias match, or the mate tapped Yes; only these teach an alias
  mine: boolean; // the buyer's own, not the flat's: off the saved lines and off the total
};
type Draft = {
  id: string; // one spend id per extraction: a retried save is a no-op, a new import is a new spend
  raw: unknown; // what the reader returned, kept on the spend for audit
  source: SpendRow['source'];
  store: string;
  total: string;
  totalGuessed: boolean; // the bill had no total, so it's the lines' sum until the mate checks it
  date: string;
  lines: Line[];
};

const rupees = (paise: number) => String(Math.abs(paise) / 100); // display only; parsed back with parseRupees
const stripDataUrl = (s: string) => s.replace(/^data:[^,]*,/, '');
/** What the reader accepts. An unknown type is assumed JPEG; HEIC, GIF and the rest are refused here, before the upload. */
function imageType(mime?: string | null): 'image/jpeg' | 'image/png' | 'image/webp' {
  if (!mime || mime === 'image/jpeg' || mime === 'image/jpg') return 'image/jpeg';
  if (mime === 'image/png' || mime === 'image/webp') return mime;
  throw new Error('Use a JPEG, PNG or WebP image, or a screenshot.');
}

/** Base64 of a picked file: web hands us a data URL, native a file:// uri we read through fetch. */
async function readBase64(uri: string): Promise<string> {
  if (uri.startsWith('data:')) return stripDataUrl(uri);
  const blob = await (await fetch(uri)).blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(stripDataUrl(String(r.result)));
    r.onerror = () => reject(new Error("Couldn't read that file."));
    r.readAsDataURL(blob);
  });
}

export default function ImportOrder() {
  const c = usePalette();
  const { me, members, household, products, holder, reload } = useHousehold();
  const putAway = usePutAway(); // above the early returns below: hooks run in the same order every render
  const [text, setText] = useState('');
  const [reading, setReading] = useState<string | null>(null); // what is being read, for the skeleton
  const run = useRef(0); // bumped by Cancel: a reading that comes back late is dropped
  const [readError, setReadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [paidBy, setPaidBy] = useState(me.id);
  const [paidFrom, setPaidFrom] = useState<'pool' | 'personal'>('pool');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const match = (name: string, kind: Kind) => {
    const p = kind === 'item' ? matchProduct(name, products) : null;
    const n = normalizeName(name);
    return { product_id: p?.id ?? null, confirmed: !!p && [p.name, ...p.aliases].some((a) => normalizeName(a) === n) };
  };

  async function read(get: () => Promise<ExtractInput | null>) {
    setReadError(null);
    setError(null);
    const mine = ++run.current;
    try {
      const input = await get();
      if (!input) return; // picker cancelled
      setReading(input.type === 'image' ? 'the picture' : 'your list');
      const raw = await extractSpend(input);
      if (mine !== run.current) return; // cancelled while reading
      const { extraction: x, problems } = normalizeExtraction(raw);
      if (!x) throw new Error(problems.join(' ') || "Couldn't find an order in that.");
      setDraft({
        id: newId(),
        raw,
        source: x.source,
        store: x.store_name ?? '',
        total: rupees(x.total_paise),
        totalGuessed: problems.some((p) => p.startsWith('No total found')),
        date: x.occurred_on && x.occurred_on <= today() ? x.occurred_on : today(),
        lines: x.lines.map((l) => ({
          id: newId(),
          name: l.name,
          amount: rupees(l.line_total_paise),
          kind: l.kind,
          qty: l.qty,
          unit: l.unit,
          mine: false,
          ...match(l.name, l.kind),
        })),
      });
    } catch (e) {
      if (mine === run.current) setReadError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mine === run.current) setReading(null);
    }
  }

  // One picture button, not two. A screenshot of an app order and a photo of a paper bill are both
  // just images in the library, and both reached the same reader; the file picker was a second door
  // onto the same room.
  const pickPicture = () =>
    read(async () => {
      // native: quality < 1 re-encodes to JPEG (smaller, no HEIC); web ignores it, so imageType still checks
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.7 });
      const a = res.assets?.[0];
      if (res.canceled || !a) return null;
      const media_type = imageType(a.mimeType);
      const data = a.base64 ? stripDataUrl(a.base64) : await readBase64(a.uri);
      return { type: 'image', media_type, data };
    });

  // ---------------------------------------------------------------- input stage

  if (reading) {
    return (
      <Screen>
        <ReadingSkeleton what={reading} />
        <MagnetButton
          label="Cancel"
          outline
          onPress={() => {
            run.current++; // ponytail: the request still runs to the end; its answer is just ignored
            setReading(null);
          }}
        />
      </Screen>
    );
  }

  if (!draft) {
    return (
      <Screen>
        <T soft>
          A screenshot of the order — Zepto, Blinkit, Instamart, BigBasket, JioMart — or a photo of a shop bill.
          You&apos;ll check every line before anything is saved.
        </T>
        <MagnetButton label="Screenshot or photo of the bill" icon={{ ios: 'photo', android: 'image' }} onPress={pickPicture} />
        <Block>
          <Field
            label="Or type it"
            value={text}
            onChangeText={setText}
            placeholder="dahi 30, bread 45"
            multiline
            style={{ minHeight: 88, paddingTop: 14, textAlignVertical: 'top' }}
          />
          <MagnetButton
            label="Read it"
            outline
            disabled={!text.trim()}
            onPress={() => read(async () => ({ type: 'text', text: text.trim() }))}
          />
        </Block>

        {readError && (
          <Block>
            <T weight="700">Couldn't read that</T>
            <ErrorText error={readError} />
            <T size={15} soft>
              Reading orders may not be set up yet. You can still add the spend by hand.
            </T>
            <MagnetButton label="Add it by hand" outline onPress={() => router.replace('/spend')} />
          </Block>
        )}
      </Screen>
    );
  }

  // ---------------------------------------------------------------- confirm card

  const total = parseRupees(draft.total);
  const parsed = draft.lines.map((l) => {
    const p = parseLineRupees(l.amount);
    return { ...l, paise: p === null ? null : l.kind === 'discount' ? -p : p };
  });
  const linesValid = parsed.every((l) => l.paise !== null && l.name.trim()); // no lines is fine, as on /spend
  const linesTotal = parsed.reduce((a, l) => a + (l.paise ?? 0), 0);
  // The whole bill has to balance first — that is the reader's work being checked, and every line on
  // the bill was paid for, mine or not.
  const balanced =
    total !== null && linesValid && linesBalance(total, parsed.map((l) => ({ line_total_paise: l.paise!, kind: l.kind })));
  // Then the buyer's own lines come off both sides, and what is left is what the flat is charged.
  const flat = flatShare(total ?? 0, parsed.map((l) => ({ ...l, line_total_paise: l.paise ?? 0 })));
  const mineTotal = (total ?? 0) - flat.total_paise;
  // Re-run the domain checks on what's on screen, so the problems list follows every edit.
  const ready = balanced && !draft.totalGuessed && flat.total_paise > 0;
  const problems: string[] =
    total === null
      ? ['Enter the amount paid.']
      : !linesValid
        ? ['Every line needs a name and an amount.']
        : normalizeExtraction({
            source: draft.source,
            store_name: draft.store || null,
            total_paise: total,
            occurred_on: draft.date,
            lines: parsed.map((l) => ({ name: l.name, qty: l.qty, unit: l.unit, line_total_paise: l.paise!, kind: l.kind })),
          } satisfies Extraction).problems;

  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const update = (i: number, patch: Partial<Line>) =>
    set({ lines: draft.lines.map((l, j) => (i === j ? { ...l, ...patch } : l)) });

  async function save() {
    if (!draft || total === null) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('add_spend', {
      p_spend: {
        id: draft.id,
        household_id: household.id,
        source: draft.source,
        store_name: isApp(draft.source) ? null : draft.store.trim() || null,
        paid_by: paidBy,
        paid_from: paidFrom,
        // the flat's share, not the card's: the buyer's own lines are off it. The whole bill is
        // still on `extraction` below, so the record of what was actually paid is not lost.
        total_paise: flat.total_paise,
        occurred_at: draft.date === today() ? null : dateToTimestamp(draft.date),
        extraction: draft.raw,
      },
      // a ₹0 fee or discount means nothing, and the DB rejects a ₹0 discount
      p_lines: flat.lines.filter((l) => l.kind === 'item' || l.paise !== 0).map((l) => ({
        id: l.id,
        name: l.name.trim(),
        qty: l.qty,
        unit: l.unit,
        line_total_paise: l.paise,
        kind: l.kind,
        product_id: l.product_id,
      })),
    });
    if (error && !(await landed('spend', draft.id))) {
      setBusy(false);
      return setError(sayError(error, holder?.display_name));
    }
    // Teach the catalogue the names Zepto uses, so the next import matches straight away.
    // ponytail: best-effort, the spend is already saved; a missed alias only costs a re-match later
    await Promise.all(
      flat.lines.map((l) => {
        const p = products.find((x) => x.id === l.product_id);
        const n = normalizeName(l.name);
        if (!p || !l.confirmed || n === normalizeName(p.name) || p.aliases.some((a) => normalizeName(a) === n)) return null;
        return supabase.rpc('learn_alias', { p_product_id: p.id, p_alias: l.name.trim() });
      }),
    );
    // Tracked items become lots. Resolves at once when nothing on the bill is tracked; awaited
    // before router.back(), which unmounts the sheet.
    // flat.lines, not parsed: the buyer's own chips are not the flat's stock.
    await putAway.ask(
      flat.lines
        .filter((l) => l.kind === 'item')
        .map((l) => ({ id: l.id, name: l.name.trim(), product_id: l.product_id, qty: l.qty, unit: l.unit, kind: l.kind })),
    );
    await reload();
    router.back();
  }

  const blankLine = (): Line => ({ id: newId(), name: '', amount: '', kind: 'item', qty: 1, unit: null, product_id: null, confirmed: false, mine: false });

  return (
    <Screen>
      <AmountBlock label="Amount paid" value={draft.total} onChangeText={(t) => set({ total: t, totalGuessed: false })} />

      {/* The V1 graft: payer and source sit at the top, so the card says who paid before it lists what. */}
      <View style={{ gap: 8 }}>
        <SectionLabel>Paid by</SectionLabel>
        <Choice
          value={paidBy}
          onChange={setPaidBy}
          options={members.map((m) => ({ value: m.id, label: m.id === me.id ? `${m.display_name} (me)` : m.display_name }))}
        />
      </View>

      <View style={{ gap: 8 }}>
        <SectionLabel>Paid from</SectionLabel>
        <Choice
          value={paidFrom}
          onChange={(v) => {
            setPaidFrom(v);
            // "Mine" only makes sense on an own-pocket bill: if the kitty paid the whole ₹1,180,
            // dropping ₹480 of it would leave the pool ₹480 lighter than the books say. Switching
            // to the pool therefore gives those lines back to the flat rather than hiding them.
            if (v === 'pool') set({ lines: draft.lines.map((l) => ({ ...l, mine: false })) });
          }}
          options={[
            { value: 'pool', label: 'From pool' },
            { value: 'personal', label: 'Own pocket' },
          ]}
        />
        {paidFrom === 'personal' && (
          <T size={15} soft>
            It goes on the treasurer's "to reimburse" list until it's paid back.
          </T>
        )}
      </View>

      <SourceRow
        source={draft.source}
        store={draft.store}
        onChange={(source) => set({ source })}
        onChangeStore={(store) => set({ store })}
        detected
      />
      <DateField label="Bought on" value={draft.date} onChange={(date) => date <= today() && set({ date })} />

      <Block>
        <SectionLabel>Check the lines</SectionLabel>
        {draft.lines.map((l, i) => {
          const product = products.find((p) => p.id === l.product_id);
          return (
            <View key={l.id} style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
                <View style={{ flex: 2 }}>
                  <Field
                    label={l.qty !== 1 || l.unit ? `Line ${i + 1} · ${l.qty}${l.unit ? ` × ${l.unit}` : ''}` : `Line ${i + 1}`}
                    value={l.name}
                    onChangeText={(name) => update(i, { name, ...match(name, l.kind) })}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="₹" value={l.amount} onChangeText={(amount) => update(i, { amount })} keyboardType="decimal-pad" />
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove line ${i + 1}`}
                  onPress={() => set({ lines: draft.lines.filter((_, j) => j !== i) })}
                  style={{ width: 48, height: 56, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={{ ios: 'xmark', android: 'close' }} size={18} color={c.muted} />
                </Pressable>
              </View>
              {/* ponytail: "Mine" rides in the kind radiogroup rather than getting a toggle of its
                  own — it is exclusive with the other three in practice, and reusing the control
                  costs no new visual language. `kind` is kept underneath, because a mine line is
                  still on the bill and still has to balance. Own-pocket only: see "Paid from". */}
              <Choice
                value={l.mine ? 'mine' : l.kind}
                onChange={(v) =>
                  v === 'mine'
                    ? update(i, { mine: true })
                    : update(i, { mine: false, kind: v as Kind, ...match(l.name, v as Kind) })
                }
                options={[
                  { value: 'item', label: 'Item' },
                  { value: 'fee', label: 'Fee' },
                  { value: 'discount', label: 'Discount' },
                  ...(paidFrom === 'personal' || l.mine ? [{ value: 'mine' as const, label: 'Mine' }] : []),
                ]}
              />
              {l.kind === 'item' &&
                !l.mine && // a line that isn't the flat's doesn't need matching to the catalogue
                (product ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <T size={15} weight="600" color={c.positive} style={{ flex: 1 }}>
                      {l.confirmed ? `Matched: ${product.name}` : `Is it ${product.name}?`}
                    </T>
                    {!l.confirmed && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Yes, line ${i + 1} is ${product.name}`}
                        onPress={() => update(i, { confirmed: true })}
                        style={{ minHeight: 48, minWidth: 48, paddingHorizontal: 12, justifyContent: 'center' }}>
                        <T size={15} weight="700" color={c.accentText}>
                          Yes
                        </T>
                      </Pressable>
                    )}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Line ${i + 1} is not ${product.name}`}
                      onPress={() => update(i, { product_id: null, confirmed: false })}
                      style={{ minHeight: 48, minWidth: 48, paddingHorizontal: 12, justifyContent: 'center' }}>
                      <T size={15} weight="700" color={c.accentText}>
                        Not it
                      </T>
                    </Pressable>
                  </View>
                ) : (
                  <T size={15} soft>
                    New product: pick or create
                  </T>
                ))}
            </View>
          );
        })}
        <MagnetButton
          label="Add a line"
          outline
          icon={{ ios: 'plus', android: 'add' }}
          onPress={() => set({ lines: [...draft.lines, blankLine()] })}
        />

        {/* The double rule: a bill's own way of saying "and that is the total". */}
        <View style={{ gap: 3, marginTop: 4 }}>
          <Rule />
          <Rule />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <T weight="700">Lines</T>
          <T num size={22}>
            {linesValid ? formatINR(linesTotal) : '—'}
          </T>
        </View>
      </Block>

      {/* The bill carried no total, so this is the lines' sum: a mate has to agree to it before Save wakes up. */}
      {draft.totalGuessed ? (
        <WarnNote>
          <T size={15} weight="700" color={c.warnFg}>
            The total wasn't on the bill
          </T>
          <T size={15} color={c.warnFg}>
            This is the lines' sum. Check what was actually paid (fees, coupons).
          </T>
          {total !== null && (
            <Pressable
              accessibilityRole="button"
              onPress={() => set({ totalGuessed: false })}
              style={{ minHeight: 48, justifyContent: 'center' }}>
              <T size={15} weight="700" color={c.warnFg}>
                Yes, {formatINR(total)} is what we paid
              </T>
            </Pressable>
          )}
        </WarnNote>
      ) : (
        draft.lines.length > 0 &&
        total !== null &&
        linesValid && (
          <BalanceBar
            total={total}
            lines={linesTotal}
            onFix={() => set({ lines: [...draft.lines, { ...blankLine(), ...roundingLine(total - linesTotal) }] })}
          />
        )
      )}

      {problems.map((p, i) => (
        <T key={i} size={15} soft>
          {p}
        </T>
      ))}

      {/* What the flat is actually charged, once the buyer's own lines are off the bill. */}
      {mineTotal !== 0 && total !== null && linesValid && (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <T weight="700">The flat&apos;s share</T>
          <T num size={22}>
            {formatINR(flat.total_paise)}
          </T>
        </View>
      )}
      {mineTotal !== 0 && (
        <T size={15} soft>
          {formatINR(mineTotal)} of this bill is yours, so it comes off the lines and off the total. The whole bill is
          still kept with the spend.
        </T>
      )}

      <ErrorText error={error} />
      <MagnetButton
        label={
          busy
            ? 'Saving…'
            : total === null
              ? 'Enter the amount paid'
              : !balanced
                ? 'Save once lines add up'
                : draft.totalGuessed
                  ? 'Check the total'
                  : flat.total_paise <= 0
                    ? 'Nothing here is the flat’s'
                    : `Save ${formatINR(flat.total_paise)}`
        }
        color="brass"
        disabled={busy || !ready}
        onPress={save}
      />
      <MagnetButton label="Start over" outline disabled={busy} onPress={() => setDraft(null)} />
      {putAway.sheet}
    </Screen>
  );
}
