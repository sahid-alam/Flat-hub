// Import a Zepto order (invoice PDF, screenshot or typed text) → the LLM reads it → a confirm card → save.
// Nothing is saved until a mate has looked at the card and the lines add up.
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { matchProduct, normalizeExtraction, normalizeName, type Extraction } from '@/domain/extraction';
import { linesBalance } from '@/domain/kitty';
import { formatINR, parseLineRupees, parseRupees } from '@/domain/money';
import { useHousehold, type SpendRow } from '@/lib/books';
import { extractSpend, type ExtractInput } from '@/lib/extract';
import { newId } from '@/lib/id';
import { landed, supabase } from '@/lib/supabase';
import { dateToTimestamp, today } from '@/lib/util';
import { AmountBlock, BalanceBar, ReadingSkeleton, roundingLine, WarnNote } from '@/ui/capture';
import { Block, Choice, DateField, ErrorText, Field, Icon, MagnetButton, Rule, Screen, SectionLabel, T, usePalette } from '@/ui/kit';

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
  const { me, members, household, products, reload } = useHousehold();
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
      setReading(input.type === 'pdf' ? 'the invoice' : input.type === 'image' ? 'the screenshot' : 'your list');
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
          ...match(l.name, l.kind),
        })),
      });
    } catch (e) {
      if (mine === run.current) setReadError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mine === run.current) setReading(null);
    }
  }

  const pickFile = () =>
    read(async () => {
      const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
      const a = res.assets?.[0];
      if (res.canceled || !a) return null;
      const isPdf = a.mimeType === 'application/pdf' || a.name.toLowerCase().endsWith('.pdf');
      const media_type = isPdf ? null : imageType(a.mimeType);
      const data = await readBase64(a.base64 ?? a.uri);
      return media_type ? { type: 'image', media_type, data } : { type: 'pdf', data };
    });

  const pickScreenshot = () =>
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
        <T soft>Pick the Zepto invoice or a screenshot of the order. You'll check every line before anything is saved.</T>
        <MagnetButton label="Invoice PDF or image" icon={{ ios: 'doc', android: 'description' }} onPress={pickFile} />
        <MagnetButton
          label="Screenshot from photos"
          outline
          icon={{ ios: 'photo', android: 'image' }}
          onPress={pickScreenshot}
        />
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
  const balanced =
    total !== null && linesValid && linesBalance(total, parsed.map((l) => ({ line_total_paise: l.paise!, kind: l.kind })));
  // Re-run the domain checks on what's on screen, so the problems list follows every edit.
  const ready = balanced && !draft.totalGuessed;
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
        store_name: draft.source === 'zepto' ? null : draft.store.trim() || null,
        paid_by: paidBy,
        paid_from: paidFrom,
        total_paise: total,
        occurred_at: draft.date === today() ? null : dateToTimestamp(draft.date),
        extraction: draft.raw,
      },
      // a ₹0 fee or discount means nothing, and the DB rejects a ₹0 discount
      p_lines: parsed.filter((l) => l.kind === 'item' || l.paise !== 0).map((l) => ({
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
      return setError(error.message);
    }
    // Teach the catalogue the names Zepto uses, so the next import matches straight away.
    // ponytail: best-effort, the spend is already saved; a missed alias only costs a re-match later
    await Promise.all(
      parsed.map((l) => {
        const p = products.find((x) => x.id === l.product_id);
        const n = normalizeName(l.name);
        if (!p || !l.confirmed || n === normalizeName(p.name) || p.aliases.some((a) => normalizeName(a) === n)) return null;
        return supabase.rpc('learn_alias', { p_product_id: p.id, p_alias: l.name.trim() });
      }),
    );
    await reload();
    router.back();
  }

  return (
    <Screen>
      <Field
        label="Amount paid (₹)"
        big
        value={draft.total}
        onChangeText={(t) => set({ total: t, totalGuessed: false })}
        keyboardType="decimal-pad"
        placeholder="0"
      />

      {draft.totalGuessed && (
        <View style={{ gap: 4 }}>
          <T size={15} weight="600" color={c.tomato}>
            The total wasn't on the bill, so this is the lines' sum. Check what was actually paid (fees, coupons).
          </T>
          {total !== null && (
            <Pressable
              accessibilityRole="button"
              onPress={() => set({ totalGuessed: false })}
              style={{ minHeight: 48, justifyContent: 'center' }}>
              <T size={15} weight="600" color={c.blue}>
                Yes, {formatINR(total)} is what we paid
              </T>
            </Pressable>
          )}
        </View>
      )}

      <View style={{ gap: 8 }}>
        <T size={15} weight="600" soft>
          Where from
        </T>
        <Choice
          value={draft.source}
          onChange={(source) => set({ source })}
          options={[
            { value: 'zepto', label: 'Zepto' },
            { value: 'local', label: 'Local' },
            { value: 'other', label: 'Other' },
          ]}
        />
      </View>
      {draft.source !== 'zepto' && (
        <Field label="Store (optional)" value={draft.store} onChangeText={(store) => set({ store })} placeholder="Sharma Dairy" />
      )}
      <DateField label="Bought on" value={draft.date} onChange={(date) => date <= today() && set({ date })} />

      <View style={{ gap: 8 }}>
        <T size={15} weight="600" soft>
          Paid by
        </T>
        <Choice
          value={paidBy}
          onChange={setPaidBy}
          options={members.map((m) => ({ value: m.id, label: m.id === me.id ? `${m.display_name} (me)` : m.display_name }))}
        />
      </View>

      <View style={{ gap: 8 }}>
        <T size={15} weight="600" soft>
          Paid from
        </T>
        <Choice
          value={paidFrom}
          onChange={setPaidFrom}
          options={[
            { value: 'pool', label: 'The kitty' },
            { value: 'personal', label: 'Own pocket' },
          ]}
        />
        {paidFrom === 'personal' && (
          <T size={15} soft>
            It goes on the treasurer's "to reimburse" list until it's paid back.
          </T>
        )}
      </View>

      <Slip magnet={ready ? 'green' : 'tomato'}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <T weight="600">Check the lines</T>
          {total !== null && (
            <T size={15} weight="600" color={ready ? c.green : c.tomato}>
              {ready ? 'Adds up' : balanced ? 'Check the total' : `${formatINR(linesTotal)} of ${formatINR(total)}`}
            </T>
          )}
        </View>
        {draft.lines.map((l, i) => {
          const product = products.find((p) => p.id === l.product_id);
          return (
            <View key={l.id} style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
                <View style={{ flex: 2 }}>
                  <Field
                    label={l.qty !== 1 || l.unit ? `Line ${i + 1} · ${l.qty}${l.unit ? ` ${l.unit}` : ''}` : `Line ${i + 1}`}
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
                  <Icon name={{ ios: 'xmark', android: 'close' }} size={18} color={c.inkSoft} />
                </Pressable>
              </View>
              <Choice
                value={l.kind}
                onChange={(kind) => update(i, { kind, ...match(l.name, kind) })}
                options={[
                  { value: 'item', label: 'Item' },
                  { value: 'fee', label: 'Fee' },
                  { value: 'discount', label: 'Discount' },
                ]}
              />
              {l.kind === 'item' &&
                (product ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <T size={15} weight="600" color={c.green} style={{ flex: 1 }}>
                      {l.confirmed ? product.name : `Is it ${product.name}?`}
                    </T>
                    {!l.confirmed && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Yes, line ${i + 1} is ${product.name}`}
                        onPress={() => update(i, { confirmed: true })}
                        style={{ minHeight: 48, minWidth: 48, paddingHorizontal: 12, justifyContent: 'center' }}>
                        <T size={15} weight="600" color={c.blue}>
                          Yes
                        </T>
                      </Pressable>
                    )}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Line ${i + 1} is not ${product.name}`}
                      onPress={() => update(i, { product_id: null, confirmed: false })}
                      style={{ minHeight: 48, minWidth: 48, paddingHorizontal: 12, justifyContent: 'center' }}>
                      <T size={15} weight="600" color={c.blue}>
                        Not it
                      </T>
                    </Pressable>
                  </View>
                ) : (
                  <T size={15} soft>
                    New, not in your products yet
                  </T>
                ))}
            </View>
          );
        })}
        <MagnetButton
          label="Add a line"
          outline
          icon={{ ios: 'plus', android: 'add' }}
          onPress={() =>
            set({ lines: [...draft.lines, { id: newId(), name: '', amount: '', kind: 'item', qty: 1, unit: null, product_id: null, confirmed: false }] })
          }
        />
        {problems.map((p, i) => (
          <T key={i} size={15} weight="500" color={balanced ? c.inkSoft : c.tomato}>
            {p}
          </T>
        ))}
      </Slip>

      <ErrorText error={error} />
      <MagnetButton
        label={busy ? 'Saving…' : total ? `Save ${formatINR(total)}` : 'Save'}
        color="tomato"
        disabled={busy || !ready}
        onPress={save}
      />
      <MagnetButton label="Start over" outline disabled={busy} onPress={() => setDraft(null)} />
    </Screen>
  );
}
