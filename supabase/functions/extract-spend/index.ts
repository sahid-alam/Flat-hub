// Reads a Zepto/Blinkit order PDF, a bill photo or pasted text and returns an
// Extraction-shaped JSON (see src/domain/extraction.ts). The app always shows a
// confirm card and runs normalizeExtraction() before anything is saved.
import Anthropic from 'npm:@anthropic-ai/sdk@0.131.0';

const MAX_BODY_CHARS = 6_000_000; // ~4.5 MB of file once base64 is decoded
const MODEL = Deno.env.get('FLATHUB_EXTRACT_MODEL') ?? 'claude-opus-5-5';
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

class BadInput extends Error {}

const nullable = (type: string) => ({ anyOf: [{ type }, { type: 'null' }] });

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['source', 'store_name', 'total_paise', 'occurred_on', 'lines'],
  properties: {
    source: { type: 'string', enum: ['zepto', 'local', 'other'] },
    store_name: nullable('string'),
    total_paise: { type: 'integer' },
    occurred_on: { anyOf: [{ type: 'string', format: 'date' }, { type: 'null' }] },
    lines: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'qty', 'unit', 'line_total_paise', 'kind'],
        properties: {
          name: { type: 'string' },
          qty: { type: 'number' },
          unit: nullable('string'),
          line_total_paise: { type: 'integer' },
          kind: { type: 'string', enum: ['item', 'fee', 'discount'] },
        },
      },
    },
  },
};

const INSTRUCTIONS = `This is an Indian grocery order or bill (Zepto, Blinkit, Instamart, or a local kirana/supermarket bill). Extract it for a shared-flat expense app.

- Amounts are in rupees; convert every amount to integer paise (₹1 = 100 paise, ₹45.50 = 4550).
- One line per product actually bought. name = the product as printed, without pack size; qty = number of packs; unit = the pack size as printed (e.g. "500 g", "1 L", "6 pc") or null. line_total_paise = what was charged for that line after any item-level discount (qty × selling price, not MRP).
- Delivery, handling, small cart, surge, late-night, platform and packaging fees, and tips, are separate lines with kind "fee" and a positive amount. Leave out fees shown as free or struck through.
- Coupons, offers, cashback applied to this bill and other bill-level discounts are lines with kind "discount" and a NEGATIVE amount.
- total_paise = the amount actually paid (grand total / "To pay" / "Bill total" after all fees and discounts).
- source: "zepto" for Zepto orders, "local" for a shop's paper or printed bill, otherwise "other". store_name as printed, or null.
- occurred_on = the order or bill date as YYYY-MM-DD, or null if none is shown.
- Copy amounts exactly as printed; do not invent lines to make the total match. If something is unreadable, leave it out.`;

type Input =
  | { type: 'image'; media_type: (typeof IMAGE_TYPES)[number]; data: string }
  | { type: 'pdf'; data: string }
  | { type: 'text'; text: string };

/** Validates the body and builds the user content blocks. Throws BadInput. */
function buildContent(body: unknown): Anthropic.Beta.BetaContentBlockParam[] {
  const input = (body as { input?: Input } | null)?.input;
  // Web FileReader hands over data URLs; the API rejects the prefix and any whitespace.
  const b64 = (d: unknown) => {
    if (typeof d !== 'string' || !d) throw new BadInput('The file is empty.');
    return d.replace(/^data:[^,]*,/, '').replace(/\s/g, '');
  };
  switch (input?.type) {
    case 'image':
      if (!IMAGE_TYPES.includes(input.media_type)) throw new BadInput('Use a JPEG, PNG or WebP image.');
      return [
        { type: 'image', source: { type: 'base64', media_type: input.media_type, data: b64(input.data) } },
        { type: 'text', text: INSTRUCTIONS },
      ];
    case 'pdf':
      return [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64(input.data) } },
        { type: 'text', text: INSTRUCTIONS },
      ];
    case 'text':
      if (typeof input.text !== 'string' || !input.text.trim()) throw new BadInput('Paste the order text first.');
      return [{ type: 'text', text: `${INSTRUCTIONS}\n\n<order>\n${input.text}\n</order>` }];
    default:
      throw new BadInput('Send an image, a PDF or some text.');
  }
}

/** Gateway verify_jwt also accepts the public anon key, so require a signed-in user. */
async function isSignedIn(auth: string | null) {
  if (!auth?.startsWith('Bearer ')) return false;
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, {
    headers: { apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '', Authorization: auth },
  });
  return res.ok;
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
const FIXTURE = {
  source: 'zepto',
  store_name: 'Zepto',
  total_paise: fixtureLines.reduce((s, l) => s + l.line_total_paise, 0),
  occurred_on: '2026-10-03',
  lines: fixtureLines,
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'Use POST.' });
  if (!(await isSignedIn(req.headers.get('Authorization')))) return reply(401, { error: 'Sign in first.' });

  const raw = await req.text();
  if (raw.length > MAX_BODY_CHARS) return reply(413, { error: 'That file is too big. Keep it under about 4 MB.' });

  let content;
  try {
    content = buildContent(JSON.parse(raw));
  } catch (e) {
    return reply(400, { error: e instanceof BadInput ? e.message : 'The request was not valid JSON.' });
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    if (Deno.env.get('FLATHUB_EXTRACT_MOCK') === '1') return reply(200, { extraction: FIXTURE });
    return reply(503, { error: 'Order reading is not set up yet.' });
  }

  try {
    const msg = await new Anthropic({ apiKey }).beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content }],
    });
    if (msg.stop_reason === 'refusal') return reply(422, { error: "Couldn't read that order. Try a clearer photo or type it in." });
    if (msg.stop_reason === 'max_tokens') return reply(502, { error: 'That order is too long to read in one go.' });
    const text = msg.content.find((b) => b.type === 'text');
    if (!text) return reply(502, { error: 'No answer came back. Try again.' });
    return reply(200, { extraction: JSON.parse(text.text) });
  } catch (e) {
    console.error('extract-spend', e);
    if (e instanceof Anthropic.BadRequestError) return reply(400, { error: "Couldn't read that file. Try a PDF, a screenshot or typed text." });
    if (e instanceof Anthropic.RateLimitError) return reply(429, { error: 'Too many requests right now. Try again in a minute.' });
    return reply(502, { error: 'Reading the order failed. Try again.' });
  }
});
