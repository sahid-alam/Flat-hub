/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeExtraction, normalizeName, matchProduct, type ProductLike } from './extraction.ts';
import { linesBalance } from './kitty.ts';

// What the LLM might hand back for a Zepto order: sloppy kinds/signs, a ₹ string, an empty row.
const zepto = {
  source: 'zepto',
  store_name: ' Zepto ',
  total_paise: 56_900,
  occurred_on: '2026-10-03',
  lines: [
    { name: 'Amul Butter 500g', qty: 1, unit: 'pc', line_total_paise: 28_500, kind: 'item' },
    { name: 'Aashirvaad Atta 5kg', qty: '1', unit: null, line_total_paise: '₹289.00', kind: 'item' },
    { name: 'Coriander', qty: 0, unit: 'bunch', line_total_paise: 0, kind: 'item' }, // free gift
    { name: 'Delivery fee', qty: 1, unit: null, line_total_paise: 3_000, kind: 'fee' },
    { name: 'Handling charge', qty: 1, unit: null, line_total_paise: -1_500, kind: 'fee' }, // wrong sign
    { name: 'Coupon SAVE50', qty: 1, unit: null, line_total_paise: 5_000, kind: 'discount' }, // wrong sign
    { name: '', qty: 1, unit: null, line_total_paise: null, kind: 'item' }, // empty
    { name: 'Small cart fee', line_total_paise: 0, kind: 'fee' }, // ₹0 fee
  ],
};

test('a Zepto order with fees and a coupon normalizes and balances', () => {
  const { extraction: x, problems } = normalizeExtraction(zepto);
  assert.deepEqual(problems, []);
  assert.ok(x);
  assert.equal(x.store_name, 'Zepto');
  assert.equal(x.lines.length, 6);
  assert.deepEqual(
    x.lines.map((l) => [l.kind, l.line_total_paise]),
    [['item', 28_500], ['item', 28_900], ['item', 0], ['fee', 3_000], ['fee', 1_500], ['discount', -5_000]],
  );
  assert.equal(x.lines[1].qty, 1);
  assert.equal(x.lines[2].qty, 1); // qty 0 → 1 (DB requires qty > 0)
  assert.ok(x.lines.every((l) => Number.isInteger(l.line_total_paise)));
  assert.ok(linesBalance(x.total_paise, x.lines)); // the pool must still balance
});

test('a mismatched total is reported with both amounts', () => {
  const { extraction, problems } = normalizeExtraction({ ...zepto, total_paise: 70_000 });
  assert.equal(extraction?.total_paise, 70_000);
  assert.deepEqual(problems, ['lines add up to ₹569 but the total is ₹700']);
});

test('rupee floats become integer paise', () => {
  const { extraction, problems } = normalizeExtraction({
    source: 'local',
    total_paise: 339.5,
    lines: [
      { name: 'Paneer', qty: 0.2, unit: 'kg', line_total_paise: 289.5, kind: 'item' },
      { name: 'Dahi', qty: 1, unit: null, line_total_paise: 50.0, kind: 'item' }, // integer → already paise
      { name: 'Eggs', qty: 6, unit: 'pc', line_total_paise: 0.29 * 100 + 0.21, kind: 'item' },
    ],
  });
  assert.equal(extraction?.lines[0].line_total_paise, 28_950);
  assert.equal(extraction?.lines[0].qty, 0.2);
  assert.equal(extraction?.total_paise, 33_950);
  assert.equal(extraction?.lines[2].line_total_paise, 2_921);
  assert.equal(extraction?.source, 'local');
  assert.equal(problems.length, 1); // 50 paise for dahi doesn't add up; the confirm card shows it
});

test('garbage in: null extraction with a reason, bad fields fall back', () => {
  assert.equal(normalizeExtraction('nope').extraction, null);
  assert.equal(normalizeExtraction({ lines: [] }).extraction, null);
  const { extraction, problems } = normalizeExtraction({
    source: 'swiggy',
    occurred_on: 'yesterday',
    lines: [{ name: 'Bread', line_total_paise: 4_500 }],
  });
  assert.equal(extraction?.source, 'other');
  assert.equal(extraction?.occurred_on, null);
  assert.equal(extraction?.total_paise, 4_500);
  assert.match(problems[0], /No total found/);
});

const products: ProductLike[] = [
  { id: 'butter', name: 'Butter', aliases: ['amul butter'] },
  { id: 'atta', name: 'Wheat Atta', aliases: [] },
  { id: 'milk', name: 'Milk', aliases: [] },
  { id: 'bread', name: 'Bread', aliases: [] },
];

test('normalizeName drops case, punctuation and pack sizes', () => {
  assert.equal(normalizeName('  Amul Butter (500 g) x2 '), 'amul butter');
  assert.equal(normalizeName('Aashirvaad Atta - 5kg, Pack of 2'), 'aashirvaad atta');
});

test('matchProduct: alias, word overlap, and null when unsure', () => {
  assert.equal(matchProduct('Amul Butter 500g', products)?.id, 'butter'); // via alias "amul butter"
  assert.equal(matchProduct('Aashirvaad Wheat Atta 5 kg', products)?.id, 'atta'); // 2 of 3 words
  assert.equal(matchProduct('Surf Excel Detergent 1kg', products), null);
  assert.equal(matchProduct('Amul Taaza Toned Milk 500ml', products), null); // 1 of 4 words: unsure
  assert.equal(matchProduct('Milk Bread', products), null); // ties two products
  assert.equal(matchProduct('', products), null);
});
