/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  splitMembers,
  splitBill,
  paidOnShare,
  owingOnBill,
  isSettled,
  toPay,
  toGetBack,
  type Bill,
  type BillShare,
  type BillPayment,
  type BillMember,
} from './bills.ts';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const mates = ['adnan', 'anant', 'ansh', 'ayan', 'jatin', 'sahid'];
const member = (id: string, joined_on = '2026-01-01', left_on: string | null = null): BillMember => ({
  id,
  joined_on,
  left_on,
});

const wifi: Bill = { id: 'w', label: 'Wi-Fi', total_paise: 60_000, paid_by: 'sahid', occurred_on: '2026-10-05' };
const sharesOf = (bill: Bill, ids = mates): BillShare[] =>
  Object.entries(splitBill(bill.total_paise, ids)).map(([member_id, paise]) => ({ bill_id: bill.id, member_id, paise }));
const pay = (bill_id: string, member_id: string, paise: number, reverses_id: string | null = null): BillPayment => ({
  bill_id,
  member_id,
  paise,
  reverses_id,
});

test('splitBill: shares sum to the total, exactly, divisible or not', () => {
  assert.deepEqual(splitBill(60_000, mates), {
    adnan: 10_000,
    anant: 10_000,
    ansh: 10_000,
    ayan: 10_000,
    jatin: 10_000,
    sahid: 10_000,
  });
  // ₹1,000 / 6 = 166.666…: four shares of 16,667 paise and two of 16,666, ties to the lowest id.
  const odd = splitBill(100_000, mates);
  assert.equal(sum(Object.values(odd)), 100_000);
  assert.deepEqual(
    Object.values(odd).sort((a, b) => b - a),
    [16_667, 16_667, 16_667, 16_667, 16_666, 16_666],
  );
  // every total, every flat size: the shares always add back up
  for (const total of [1, 7, 99, 1_234_567, 450_025]) {
    for (const n of [1, 2, 3, 5, 6, 7]) {
      assert.equal(sum(Object.values(splitBill(total, mates.slice(0, n).concat(n > 6 ? ['guest'] : [])))), total);
    }
  }
});

test('splitMembers: a mate who left before the bill gets no share', () => {
  const six = [...mates.slice(0, 5).map((id) => member(id)), member('left', '2026-01-01', '2026-09-30')];
  const ids = splitMembers(six, wifi.occurred_on).map((m) => m.id);
  assert.deepEqual(ids, mates.slice(0, 5));
  const shares = sharesOf(wifi, ids);
  assert.equal(sum(shares.map((s) => s.paise)), wifi.total_paise);
  assert.equal(
    shares.find((s) => s.member_id === 'left'),
    undefined,
  );
  // and someone who moves in later is out too
  assert.deepEqual(
    splitMembers([member('old'), member('new', '2026-10-06')], wifi.occurred_on).map((m) => m.id),
    ['old'],
  );
});

test('owingOnBill: the payer owes nothing, everyone else owes their share', () => {
  const owing = owingOnBill(wifi, sharesOf(wifi), []);
  assert.equal(owing.sahid, 0);
  assert.equal(owing.ansh, 10_000);
  assert.equal(sum(Object.values(owing)), 50_000); // five mates at ₹100
});

test('a settled bill stops showing as owing', () => {
  const shares = sharesOf(wifi);
  const paid = mates.filter((m) => m !== 'sahid').map((m) => pay(wifi.id, m, 10_000));
  assert.equal(isSettled(wifi, shares, []), false);
  assert.equal(isSettled(wifi, shares, paid.slice(0, 4)), false); // one mate short
  assert.equal(isSettled(wifi, shares, paid), true);
  assert.deepEqual(Object.values(owingOnBill(wifi, shares, paid)), [0, 0, 0, 0, 0, 0]);
  assert.equal(toGetBack([wifi], shares, paid, 'sahid'), 0);
  assert.equal(toPay([wifi], shares, paid, 'ansh'), 0);
});

test('a reversal cancels its payment, and the share is owed again', () => {
  const shares = sharesOf(wifi);
  const one = [pay(wifi.id, 'ansh', 10_000)];
  assert.equal(paidOnShare(one, wifi.id, 'ansh'), 10_000);
  assert.equal(owingOnBill(wifi, shares, one).ansh, 0);
  const reversed = [...one, pay(wifi.id, 'ansh', -10_000, 'p1')];
  assert.equal(paidOnShare(reversed, wifi.id, 'ansh'), 0);
  assert.equal(owingOnBill(wifi, shares, reversed).ansh, 10_000);
  assert.equal(toPay([wifi], shares, reversed, 'ansh'), 10_000);
  assert.equal(toGetBack([wifi], shares, reversed, 'sahid'), 50_000); // all five shares owed again
  assert.equal(toGetBack([wifi], shares, one, 'sahid'), 40_000); // with the payment standing, four
});

test('Pay and Get back across two bills with different payers', () => {
  const cook: Bill = { id: 'c', label: 'Cook', total_paise: 90_000, paid_by: 'ansh', occurred_on: '2026-10-01' };
  const bills = [wifi, cook];
  const shares = [...sharesOf(wifi), ...sharesOf(cook)];
  // nothing settled: sahid is owed ₹500 on the Wi-Fi and owes ₹150 on the cook
  assert.equal(toGetBack(bills, shares, [], 'sahid'), 50_000);
  assert.equal(toPay(bills, shares, [], 'sahid'), 15_000);
  assert.equal(toGetBack(bills, shares, [], 'ansh'), 75_000);
  assert.equal(toPay(bills, shares, [], 'ansh'), 10_000);
  // sahid pays his cook share: his Pay empties, ansh's Get back drops by the same ₹150
  const paid = [pay(cook.id, 'sahid', 15_000)];
  assert.equal(toPay(bills, shares, paid, 'sahid'), 0);
  assert.equal(toGetBack(bills, shares, paid, 'ansh'), 60_000);
  // and what every payer is owed always equals what the others have left to pay
  assert.equal(
    sum(mates.map((m) => toGetBack(bills, shares, paid, m))),
    sum(mates.map((m) => toPay(bills, shares, paid, m))),
  );
});
