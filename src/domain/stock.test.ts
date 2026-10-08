/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  lastPackSize,
  onHand,
  isEmpty,
  fefo,
  staleWarning,
  expiringSoon,
  daysLeft,
  toBase,
  minUnit,
  parseMinQty,
  showMinQty,
  shoppingList,
  type Lot,
  type Move,
  type StockProduct,
  type ManualItem,
} from './stock.ts';

const lot = (id: string, over: Partial<Lot> = {}): Lot => ({
  id,
  product_id: 'milk',
  location: 'fridge',
  expiry_date: null,
  opened: false,
  received_at: '2026-10-01T06:00:00Z',
  ...over,
});
const mv = (lot_id: string, delta_qty: number): Move => ({ lot_id, delta_qty });

test('onHand sums a purchase plus a partial consume; a lot is empty at exactly 0', () => {
  const moves = [mv('a', 400), mv('a', -150), mv('b', 1)];
  assert.equal(onHand('a', moves), 250);
  assert.equal(onHand('missing', moves), 0);
  assert.equal(isEmpty('a', moves), false);
  // float drift: 0.3 − 0.1 − 0.2 must land on exactly 0, not 2.7e-17
  const drift = [mv('c', 0.3), mv('c', -0.1), mv('c', -0.2)];
  assert.equal(onHand('c', drift), 0);
  assert.equal(isEmpty('c', drift), true);
  assert.equal(isEmpty('c', [...drift, mv('c', -0.5)]), true); // over-consumed is still empty
});

test('fefo: opened first, then expiry with nulls last, then oldest received', () => {
  const lots = [
    lot('no-expiry'),
    lot('late', { expiry_date: '2026-10-20' }),
    lot('soon', { expiry_date: '2026-10-05' }),
    lot('opened-late', { expiry_date: '2026-10-30', opened: true }),
  ];
  assert.deepEqual(
    fefo(lots).map((l) => l.id),
    ['opened-late', 'soon', 'late', 'no-expiry'],
  );
  // same expiry (both null): oldest received_at wins, and the input is not mutated
  const same = [lot('new', { received_at: '2026-10-02T06:00:00Z' }), lot('old', { received_at: '2026-09-02T06:00:00Z' })];
  assert.deepEqual(
    fefo(same).map((l) => l.id),
    ['old', 'new'],
  );
  assert.equal(same[0].id, 'new');
});

test('staleWarning: an unopened lot expiring before an opened one of the same product', () => {
  const lots = [
    lot('opened', { expiry_date: '2026-10-20', opened: true }),
    lot('stale', { expiry_date: '2026-10-10' }),
    lot('fine', { expiry_date: '2026-10-25' }),
    lot('other-product', { product_id: 'curd', expiry_date: '2026-10-01' }),
  ];
  assert.deepEqual(
    staleWarning(lots).map((l) => l.id),
    ['stale'],
  );
  assert.deepEqual(staleWarning([lot('a', { expiry_date: '2026-10-10' })]), []); // nothing opened
});

test('daysLeft and expiringSoon, expired included', () => {
  assert.equal(daysLeft(null, '2026-10-04'), null);
  assert.equal(daysLeft('2026-10-07', '2026-10-04'), 3);
  assert.equal(daysLeft('2026-10-01', '2026-10-04'), -3);
  assert.equal(daysLeft('2026-10-07', '2026-10-04T20:00:00Z'), 2); // 01:30 IST on the 5th, so two days left
  const lots = [lot('gone', { expiry_date: '2026-10-01' }), lot('d3', { expiry_date: '2026-10-07' }), lot('d4', { expiry_date: '2026-10-08' }), lot('never')];
  assert.deepEqual(
    expiringSoon(lots, '2026-10-04', 3).map((l) => l.id),
    ['gone', 'd3'],
  );
});

test('toBase: a packet maps to grams, an unknown unit is null', () => {
  const uoms = [{ product_id: 'atta', unit: 'packet', factor_to_base: 400 }];
  assert.equal(toBase(2, 'packet', 'atta', uoms), 800);
  assert.equal(toBase(1, 'box', 'atta', uoms), null);
  assert.equal(toBase(1, 'packet', 'rice', uoms), null); // right unit, wrong product
});

test('shoppingList: manual first, then low stock, a product in both appears once', () => {
  const products: StockProduct[] = [
    { id: 'atta', name: 'Atta', track_stock: true, min_qty: 1000 },
    { id: 'rice', name: 'Rice', track_stock: true, min_qty: 500 },
    { id: 'dahi', name: 'Dahi', track_stock: false, min_qty: 200 },
    { id: 'salt', name: 'Salt', track_stock: true, min_qty: null },
  ];
  const lots = [lot('l1', { product_id: 'atta' }), lot('l2', { product_id: 'rice' })];
  const moves = [mv('l1', 400), mv('l2', 500), mv('l2', -700)]; // rice over-consumed: empty, not −200
  const manual: ManualItem[] = [
    { product_id: null, name: 'Phenyl', done_at: null },
    { product_id: 'atta', name: 'Atta', done_at: null },
    { product_id: 'rice', name: 'Rice', done_at: '2026-10-03T06:00:00Z' }, // already bought
  ];
  assert.deepEqual(shoppingList(products, lots, moves, manual, {}), [
    { product_id: null, name: 'Phenyl', have: 0, min: null, source: 'manual' },
    { product_id: 'atta', name: 'Atta', have: 400, min: 1000, source: 'manual' },
    { product_id: 'rice', name: 'Rice', have: 0, min: 500, source: 'low' },
  ]);
  // nothing short: dahi isn't tracked, salt has no min, atta is topped up
  assert.deepEqual(shoppingList(products, lots, [mv('l1', 1000), mv('l2', 500)], []), []);
});

test('a minimum is typed in kg/L/pc and stored in the base unit', () => {
  assert.equal(minUnit('g'), 'kg');
  assert.equal(minUnit('ml'), 'L');
  assert.equal(minUnit('pc'), 'pc');

  // the editor's round trip: what a mate types, what the DB holds, what the field shows next time
  assert.equal(parseMinQty('2', 'g'), 2000);
  assert.equal(parseMinQty('1.5', 'ml'), 1500);
  assert.equal(parseMinQty('0.4', 'g'), 400); // 400 g of dahi
  assert.equal(parseMinQty('6', 'pc'), 6);
  assert.equal(showMinQty(2000, 'g'), '2');
  assert.equal(showMinQty(400, 'g'), '0.4');
  assert.equal(showMinQty(1000, 'ml'), '1');
  assert.equal(showMinQty(6, 'pc'), '6');
  assert.equal(showMinQty(null, 'g'), ''); // no minimum is an empty field, never a zero

  // not a minimum
  assert.equal(parseMinQty('', 'g'), null);
  assert.equal(parseMinQty('0', 'g'), null);
  assert.equal(parseMinQty('-1', 'g'), null);
  assert.equal(parseMinQty('half', 'g'), null);
  assert.equal(parseMinQty('2.5', 'pc'), null); // half a packet is not a count

  // and it is the unit the shopping list compares against: 1 kg asked for, 400 g on hand → short.
  // This is the assertion that fails if the editor ever writes kilos into a column counting grams.
  const products = [{ id: 'atta', name: 'Atta', track_stock: true, min_qty: parseMinQty('1', 'g') }];
  const lots: Lot[] = [
    { id: 'l1', product_id: 'atta', location: 'pantry', expiry_date: null, opened: true, received_at: '2026-10-01T06:00:00Z' },
  ];
  assert.deepEqual(shoppingList(products, lots, [{ lot_id: 'l1', delta_qty: 400 }], []), [
    { product_id: 'atta', name: 'Atta', have: 400, min: 1000, source: 'low' },
  ]);
});

test('lastPackSize remembers how the product was put away last time', () => {
  const lots: Lot[] = [
    { id: 'old', product_id: 'milk', location: 'fridge', expiry_date: null, opened: true, received_at: '2026-09-01T06:00:00Z' },
    { id: 'new', product_id: 'milk', location: 'fridge', expiry_date: null, opened: false, received_at: '2026-10-01T06:00:00Z' },
    { id: 'atta', product_id: 'atta', location: 'pantry', expiry_date: null, opened: false, received_at: '2026-10-02T06:00:00Z' },
  ];
  const moves: Move[] = [
    { lot_id: 'old', delta_qty: 500 },
    { lot_id: 'new', delta_qty: 1000 }, // a 1 L pack
    { lot_id: 'new', delta_qty: -250 }, // drunk since; the pack size is still 1000
  ];
  assert.equal(lastPackSize('milk', lots, moves), 1000);
  assert.equal(lastPackSize('atta', lots, moves), null); // a lot with no opening move
  assert.equal(lastPackSize('dahi', lots, moves), null); // never bought
});
