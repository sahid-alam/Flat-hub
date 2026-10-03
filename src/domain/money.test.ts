/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatINR, parseLineRupees, parseRupees, upiAmount } from './money.ts';
import { uuidv7 } from './id.ts';

test('formatINR uses Indian digit grouping', () => {
  assert.equal(formatINR(12_345_600), '₹1,23,456');
  assert.equal(formatINR(201_177), '₹2,011.77');
  assert.equal(formatINR(1_234_567_890), '₹1,23,45,678.90');
  assert.equal(formatINR(3_000), '₹30');
  assert.equal(formatINR(3_000, { paise: true }), '₹30.00');
  assert.equal(formatINR(-65_882), '−₹658.82');
  assert.equal(formatINR(65_882, { sign: true }), '+₹658.82');
  assert.equal(formatINR(0), '₹0');
});

test('parseRupees → paise', () => {
  assert.equal(parseRupees('2,011.77'), 201_177);
  assert.equal(parseRupees('₹ 45.5'), 4_550);
  assert.equal(parseRupees('30'), 3_000);
  for (const bad of ['', '0', '-5', '1.234', 'abc', '1e3']) assert.equal(parseRupees(bad), null);
});

test('parseLineRupees allows an explicit ₹0, nothing else new', () => {
  for (const zero of ['0', '0.00', '₹ 0']) assert.equal(parseLineRupees(zero), 0);
  assert.equal(parseLineRupees('45.5'), 4550);
  for (const bad of ['', ' ', '-0', 'abc']) assert.equal(parseLineRupees(bad), null);
});

test('upiAmount has two decimals', () => {
  assert.equal(upiAmount(201_177), '2011.77');
  assert.equal(upiAmount(200_000), '2000.00');
});

test('uuidv7 is version 7 and time-ordered', () => {
  const r = new Uint8Array(16).fill(0xff);
  const a = uuidv7(r, 1_700_000_000_000);
  const b = uuidv7(new Uint8Array(16), 1_700_000_000_001);
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.ok(a < b);
});
