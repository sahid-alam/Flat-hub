// Reads a quick-commerce order screenshot (Zepto, Blinkit, Instamart, BigBasket, JioMart), a bill photo or pasted text and returns an
// Extraction-shaped JSON (see src/domain/extraction.ts). The app always shows a
// confirm card and runs normalizeExtraction() before anything is saved.
//
// Backend: Ollama Cloud (https://ollama.com), on the FREE plan. gemma4:31b is the free
// model that reads images; the other free text models (gpt-oss:20b/120b, nemotron-3-*)
// handle the typed-text path. Ollama ignores a JSON Schema passed as `format`, so the
// shape is pinned with format:"json" plus the literal shape in the prompt — verified to
// return balanced lines on a real Zepto bill.

const MAX_BODY_CHARS = 6_000_000; // ~4.5 MB of file once base64 is decoded
const MODEL = Deno.env.get('FLATHUB_EXTRACT_MODEL') ?? 'gemma4:31b';
const OLLAMA_URL = Deno.env.get('FLATHUB_OLLAMA_URL') ?? 'https://ollama.com/api/chat';
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

class BadInput extends Error {}

const SHAPE = `{"source":"zepto"|"blinkit"|"instamart"|"bigbasket"|"jiomart"|"local"|"other","store_name":string|null,"total_paise":integer,"occurred_on":"YYYY-MM-DD"|null,"lines":[{"name":string,"qty":number,"unit":string|null,"line_total_paise":integer,"kind":"item"|"fee"|"discount"}]}`;

const INSTRUCTIONS = `This is an Indian grocery order or bill (Zepto, Blinkit, Swiggy Instamart, BigBasket, JioMart, or a local kirana/supermarket bill). Extract it for a shared-flat expense app.

Return ONLY a JSON object in exactly this shape, with no prose and no markdown fence:
${SHAPE}

- Amounts are in rupees; convert every amount to integer paise (₹1 = 100 paise, ₹45.50 = 4550).
- One line per product actually bought. name = the product as printed, without pack size; qty = number of packs; unit = the pack size as printed (e.g. "500 g", "1 L", "6 pc") or null. line_total_paise = what was charged for that line after any item-level discount (qty × selling price, not MRP).
- Delivery, handling, small cart, surge, late-night, platform and packaging fees, and tips, are separate lines with kind "fee" and a positive amount. Leave out fees shown as free or struck through.
- Coupons, offers, cashback applied to this bill and other bill-level discounts are lines with kind "discount" and a NEGATIVE amount.
- total_paise = the amount actually paid (grand total / "To pay" / "Bill total" after all fees and discounts).
- Every line_total_paise must add up to exactly total_paise.
- source: the app the order was placed in — "zepto", "blinkit", "instamart" (Swiggy Instamart), "bigbasket" or "jiomart". Use "local" for a shop's paper or printed bill, and "other" when you cannot tell. Judge it by the logo, the app chrome or the merchant name on the bill. store_name as printed, or null.
- occurred_on = the order or bill date as YYYY-MM-DD, or null if none is shown.
- Copy amounts exactly as printed; do not invent lines to make the total match. If something is unreadable, leave it out.`;

type Input =
  | { type: 'image'; media_type: (typeof IMAGE_TYPES)[number]; data: string }
  | { type: 'pdf'; data: string }
  | { type: 'text'; text: string };

type Message = { role: 'user'; content: string; images?: string[] };

/** Validates the body and builds the Ollama message. Throws BadInput. */
function buildMessage(body: unknown): Message {
  const input = (body as { input?: Input } | null)?.input;
  // Web FileReader hands over data URLs; the API rejects the prefix and any whitespace.
  const b64 = (d: unknown) => {
    if (typeof d !== 'string' || !d) throw new BadInput('The file is empty.');
    return d.replace(/^data:[^,]*,/, '').replace(/\s/g, '');
  };
  switch (input?.type) {
    case 'image':
      if (!IMAGE_TYPES.includes(input.media_type)) throw new BadInput('Use a JPEG, PNG or WebP image.');
      return { role: 'user', content: INSTRUCTIONS, images: [b64(input.data)] };
    case 'pdf':
      // Ollama takes images only. A phone screenshot of the order works and is the faster path anyway.
      throw new BadInput('PDFs cannot be read yet — take a screenshot of the order instead, or type it in.');
    case 'text':
      if (typeof input.text !== 'string' || !input.text.trim()) throw new BadInput('Paste the order text first.');
      return { role: 'user', content: `${INSTRUCTIONS}\n\n<order>\n${input.text}\n</order>` };
    default:
      throw new BadInput('Send an image or some text.');
  }
}

/** Gateway verify_jwt also accepts the public anon key, so require a household member:
 * RLS on member only returns rows from the caller's own households.
 * ponytail: no rate limit; sign-ups are off, so callers are the flat. */
async function isMember(auth: string | null) {
  if (!auth?.startsWith('Bearer ')) return false;
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/member?select=id&limit=1`, {
    headers: { apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '', Authorization: auth },
  });
  return res.ok && ((await res.json()) as unknown[]).length > 0;
}

/** The model is not schema-constrained, so check the shape before the app trusts it. */
function looksLikeExtraction(v: unknown): boolean {
  const e = v as { lines?: unknown; total_paise?: unknown } | null;
  return !!e && typeof e === 'object' && Array.isArray(e.lines) && typeof e.total_paise === 'number';
}

const fixtureLines = [
  { name: 'Amul Taaza Toned Milk', qty: 2, unit: '500 ml', line_total_paise: 5400, kind: 'item' },
  { name: 'Aashirvaad Whole Wheat Atta', qty: 1, unit: '5 kg', line_total_paise: 24500, kind: 'item' },
  { name: 'Onion', qty: 1, unit: '1 kg', line_total_paise: 3900, kind: 'item' },
  { name: 'Tomato Hybrid', qty: 1, unit: '500 g', line_total_paise: 2200, kind: 'item' },
  { name: 'Mother Dairy Paneer', qty: 1, unit: '200 g', line_total_paise: 9000, kind: 'item' },
  { name: 'Surf Excel Easy Wash Detergent', qty: 1, unit: '1 kg', line_total_paise: 13500, kind: 'item' },
  { name: 'Handling Fee', qty: 1, unit: null, line_total_paise: 1199, kind: 'fee' },
  { name: 'Delivery Fee', qty: 1, unit: null, line_total_paise: 3000, kind: 'fee' },
  { name: 'Coupon SAVE50', qty: 1, unit: null, line_total_paise: -5000, kind: 'discount' },
];
// A Blinkit order on purpose: the mock is the only thing that exercises a widened enum value
// end to end without a real key.
const FIXTURE = {
  source: 'blinkit',
  store_name: 'Blinkit',
  total_paise: fixtureLines.reduce((s, l) => s + l.line_total_paise, 0),
  occurred_on: '2026-10-03',
  lines: fixtureLines,
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'Use POST.' });
  if (!(await isMember(req.headers.get('Authorization')))) return reply(401, { error: 'Sign in to your flat first.' });

  const raw = await req.text();
  if (raw.length > MAX_BODY_CHARS) return reply(413, { error: 'That file is too big. Keep it under about 4 MB.' });

  let message: Message;
  try {
    message = buildMessage(JSON.parse(raw));
  } catch (e) {
    return reply(400, { error: e instanceof BadInput ? e.message : 'The request was not valid JSON.' });
  }

  const apiKey = Deno.env.get('OLLAMA_API_KEY');
  if (!apiKey) {
    if (Deno.env.get('FLATHUB_EXTRACT_MOCK') === '1') return reply(200, { extraction: FIXTURE });
    return reply(503, { error: 'Order reading is not set up yet.' });
  }

  try {
    const res = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, stream: false, format: 'json', options: { temperature: 0 }, messages: [message] }),
    });

    if (res.status === 402) {
      // The flat is on Ollama's free plan; a paid model is a config mistake, not a user error.
      console.error('extract-spend: paid model configured', MODEL);
      return reply(503, { error: `Order reading is set to a model that needs a paid Ollama plan (${MODEL}).` });
    }
    if (res.status === 429) return reply(429, { error: 'Too many requests right now. Try again in a minute.' });
    if (!res.ok) {
      console.error('extract-spend: ollama', res.status, (await res.text()).slice(0, 500));
      return reply(502, { error: 'Reading the order failed. Try again.' });
    }

    const body = (await res.json()) as { message?: { content?: string } };
    const content = body.message?.content;
    if (!content) return reply(502, { error: 'No answer came back. Try again.' });

    let extraction: unknown;
    try {
      extraction = JSON.parse(content);
    } catch {
      // format:"json" normally prevents this; a fenced block is the one shape worth rescuing.
      const fenced = content.match(/\{[\s\S]*\}/);
      if (!fenced) return reply(422, { error: "Couldn't read that order. Try a clearer photo or type it in." });
      try {
        extraction = JSON.parse(fenced[0]);
      } catch {
        return reply(422, { error: "Couldn't read that order. Try a clearer photo or type it in." });
      }
    }
    if (!looksLikeExtraction(extraction))
      return reply(422, { error: "Couldn't read that order. Try a clearer photo or type it in." });

    return reply(200, { extraction });
  } catch (e) {
    console.error('extract-spend', e);
    return reply(502, { error: 'Reading the order failed. Try again.' });
  }
});
