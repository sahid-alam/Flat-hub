// Import a Zepto order (invoice PDF, screenshot or typed text) → the LLM reads it → a confirm card → save.
// Nothing is saved until a mate has looked at the card and the lines add up.
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { matchProduct, normalizeExtraction, normalizeName, type Extraction } from '@/domain/extraction';
import { linesBalance } from '@/domain/kitty';
import { formatINR, parseRupees } from '@/domain/money';
import { useHousehold, type SpendRow } from '@/lib/books';
import { extractSpend } from '@/lib/extract';
import { newId } from '@/lib/id';
import { supabase } from '@/lib/supabase';
import { dateToTimestamp, today } from '@/lib/util';
import { Choice, DateField, ErrorText, Field, Icon, MagnetButton, Screen, Slip, T, usePalette } from '@/ui/kit';

type Kind = 'item' | 'fee' | 'discount';
type Line = { id: string; name: string; amount: string; kind: Kind; qty: number; unit: string | null; product_id: string | null };
type Draft = {
  id: string; // one spend id per extraction: a retried save is a no-op, a new import is a new spend
  raw: unknown; // what the reader returned, kept on the spend for audit
  source: SpendRow['source'];
  store: string;
  total: string;
  date: string;
  lines: Line[];
};
type Input =
  | { type: 'image'; media_type: 'image/jpeg' | 'image/png' | 'image/webp'; data: string }
  | { type: 'pdf'; data: string }
  | { type: 'text'; text: string };

const rupees = (paise: number) => String(Math.abs(paise) / 100); // display only; parsed back with parseRupees
const stripDataUrl = (s: string) => s.replace(/^data:[^,]*,/, '');
const imageType = (mime?: string | null) =>
  mime === 'image/png' || mime === 'image/webp' ? mime : ('image/jpeg' as const);

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
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [paidBy, setPaidBy] = useState(me.id);
  const [paidFrom, setPaidFrom] = useState<'pool' | 'personal'>('pool');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const match = (name: string, kind: Kind) => (kind === 'item' ? (matchProduct(name, products)?.id ?? null) : null);

  async function read(get: () => Promise<Input | null>) {
    setReadError(null);
    setError(null);
    try {
      const input = await get();
      if (!input) return; // picker cancelled
      setReading(true);
      const raw = await extractSpend(input);
      const { extraction: x, problems } = normalizeExtraction(raw);
      if (!x) throw new Error(problems.join(' ') || "Couldn't find an order in that.");
      setDraft({
        id: newId(),
        raw,
        source: x.source,
        store: x.store_name ?? '',
        total: rupees(x.total_paise),
        date: x.occurred_on && x.occurred_on <= today() ? x.occurred_on : today(),
        lines: x.lines.map((l) => ({
          id: newId(),
          name: l.name,
          amount: rupees(l.line_total_paise),
          kind: l.kind,
          qty: l.qty,
          unit: l.unit,
          product_id: match(l.name, l.kind),
        })),
      });
    } catch (e) {
      setReadError(e instanceof Error ? e.message : String(e));
    } finally {
      setReading(false);
    }
  }

  const pickFile = () =>
    read(async () => {
      const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
      const a = res.assets?.[0];
      if (res.canceled || !a) return null;
      const data = await readBase64(a.base64 ?? a.uri);
      const isPdf = a.mimeType === 'application/pdf' || a.name.toLowerCase().endsWith('.pdf');
      return isPdf ? { type: 'pdf', data } : { type: 'image', media_type: imageType(a.mimeType), data };
    });

  const pickScreenshot = () =>
    read(async () => {
      // quality < 1 re-encodes to JPEG: smaller upload, and no HEIC
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.7 });
      const a = res.assets?.[0];
      if (res.canceled || !a) return null;
      const data = a.base64 ? stripDataUrl(a.base64) : await readBase64(a.uri);
      return { type: 'image', media_type: imageType(a.mimeType), data };
    });

  // ---------------------------------------------------------------- input stage

  if (!draft) {
    return (
      <Screen>
        <T soft>Pick the Zepto invoice or a screenshot of the order. You'll check every line before anything is saved.</T>
        <MagnetButton
          label="Invoice PDF or image"
          icon={{ ios: 'doc', android: 'description' }}
          disabled={reading}
          onPress={pickFile}
        />
        <MagnetButton
          label="Screenshot from photos"
          outline
          icon={{ ios: 'photo', android: 'image' }}
          disabled={reading}
          onPress={pickScreenshot}
        />
        <Slip>
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
            disabled={reading || !text.trim()}
            onPress={() => read(async () => ({ type: 'text', text: text.trim() }))}
          />
        </Slip>

        {reading && (
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <ActivityIndicator color={c.ink} />
            <T soft>Reading the order…</T>
          </View>
        )}
        {readError && (
          <Slip magnet="tomato">
            <T weight="600">Couldn't read that</T>
            <ErrorText error={readError} />
            <T size={15} soft>
              Reading orders may not be set up yet. You can still add the spend by hand.
            </T>
            <MagnetButton label="Add it by hand" outline onPress={() => router.replace('/spend')} />
          </Slip>
        )}
      </Screen>
    );
  }

  // ---------------------------------------------------------------- confirm card

  const total = parseRupees(draft.total);
  const parsed = draft.lines.map((l) => {
    const p = parseRupees(l.amount);
    return { ...l, paise: p === null ? null : l.kind === 'discount' ? -p : p };
  });
  const linesValid = parsed.length > 0 && parsed.every((l) => l.paise !== null && l.name.trim());
  const linesTotal = parsed.reduce((a, l) => a + (l.paise ?? 0), 0);
  const balanced =
    total !== null && linesValid && linesBalance(total, parsed.map((l) => ({ line_total_paise: l.paise!, kind: l.kind })));
  // Re-run the domain checks on what's on screen, so the problems list follows every edit.
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
      p_lines: parsed.map((l) => ({
        id: l.id,
        name: l.name.trim(),
        qty: l.qty,
        unit: l.unit,
        line_total_paise: l.paise,
        kind: l.kind,
        product_id: l.product_id,
      })),
    });
    if (error) {
      setBusy(false);
      return setError(error.message);
    }
    // Teach the catalogue the names Zepto uses, so the next import matches straight away.
    // ponytail: best-effort, the spend is already saved; a missed alias only costs a re-match later
    await Promise.all(
      parsed.map((l) => {
        const p = products.find((x) => x.id === l.product_id);
        const n = normalizeName(l.name);
        if (!p || n === normalizeName(p.name) || p.aliases.some((a) => normalizeName(a) === n)) return null;
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
        onChangeText={(t) => set({ total: t })}
        keyboardType="decimal-pad"
        placeholder="0"
      />

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

      <Slip magnet={balanced ? 'green' : 'tomato'}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <T weight="600">Check the lines</T>
          {total !== null && (
            <T size={15} weight="600" color={balanced ? c.green : c.tomato}>
              {balanced ? 'Adds up' : `${formatINR(linesTotal)} of ${formatINR(total)}`}
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
                    onChangeText={(name) => update(i, { name, product_id: match(name, l.kind) })}
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
                onChange={(kind) => update(i, { kind, product_id: match(l.name, kind) })}
                options={[
                  { value: 'item', label: 'Item' },
                  { value: 'fee', label: 'Fee' },
                  { value: 'discount', label: 'Discount' },
                ]}
              />
              {l.kind === 'item' &&
                (product ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Matched to ${product.name}. Tap to unlink.`}
                    onPress={() => update(i, { product_id: null })}
                    style={{ minHeight: 44, justifyContent: 'center' }}>
                    <T size={15} weight="600" color={c.green}>
                      Is {product.name} · tap if not
                    </T>
                  </Pressable>
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
            set({ lines: [...draft.lines, { id: newId(), name: '', amount: '', kind: 'item', qty: 1, unit: null, product_id: null }] })
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
        disabled={busy || !balanced}
        onPress={save}
      />
      <MagnetButton label="Start over" outline disabled={busy} onPress={() => setDraft(null)} />
    </Screen>
  );
}
