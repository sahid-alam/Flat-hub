// Bills maths: cook, electricity, Wi-Fi. One mate pays the vendor, the rest owe that mate their share.
// Pure TypeScript: no React, no Supabase.
//
// NOT the kitty. The kitty is pooled, with no per-expense splits and no mate-to-mate debt; a bill is a
// payer, per-person shares and a debt until settled. Nothing here reads or writes pool_entry, and no
// bill ever moves anyone's kitty position. The one thing shared with the kitty is allocate(): a second
// rounding rule would be a second way for money to go missing.
//
// Money is integer paise. The payment ledger is append-only, so a reversal carries the negated amount
// and every Σ is a plain sum.

import { allocate } from './kitty.ts';

export type Bill = { id: string; label: string; total_paise: number; paid_by: string; occurred_on: string };
export type BillShare = { bill_id: string; member_id: string; paise: number };
export type BillPayment = { bill_id: string; member_id: string; paise: number; reverses_id: string | null };
/** What the split needs of a member: when they joined, and when they left if they have. */
export type BillMember = { id: string; joined_on: string; left_on: string | null };

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

/** The mates a bill is split between: everyone in the flat on the day of the bill. Rent and Wi-Fi do
 *  not get cheaper because someone went home for the weekend, so absences are deliberately ignored. */
export const splitMembers = <M extends BillMember>(members: M[], on: string): M[] =>
  members.filter((m) => m.joined_on <= on && (!m.left_on || m.left_on >= on));

/** Equal shares in paise, largest remainder with ties to the lowest member id, so they sum to the
 *  total exactly: ₹1,000 between six is four of ₹166.67 and two of ₹166.66, never ₹999.96. */
export const splitBill = (totalPaise: number, memberIds: string[]): Record<string, number> =>
  allocate(totalPaise, Object.fromEntries(memberIds.map((id) => [id, 1])));

/** Net settled against one mate's share (a reversal cancels its payment). */
export const paidOnShare = (payments: BillPayment[], billId: string, memberId: string): number =>
  sum(payments.filter((p) => p.bill_id === billId && p.member_id === memberId).map((p) => p.paise));

/**
 * What each mate still has to hand the payer on this bill, by member id.
 * The payer's own share is already theirs — they paid the vendor — so it is always 0.
 */
export function owingOnBill(bill: Bill, shares: BillShare[], payments: BillPayment[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of shares.filter((s) => s.bill_id === bill.id)) {
    out[s.member_id] =
      s.member_id === bill.paid_by ? 0 : Math.max(0, s.paise - paidOnShare(payments, bill.id, s.member_id));
  }
  return out;
}

/** True once every share but the payer's own is settled. */
export const isSettled = (bill: Bill, shares: BillShare[], payments: BillPayment[]): boolean =>
  sum(Object.values(owingOnBill(bill, shares, payments))) === 0;

/** What a mate still has to pay out on other mates' bills. "Pay". */
export const toPay = (bills: Bill[], shares: BillShare[], payments: BillPayment[], memberId: string): number =>
  sum(bills.filter((b) => b.paid_by !== memberId).map((b) => owingOnBill(b, shares, payments)[memberId] ?? 0));

/** What a mate is still owed on the bills they paid. "Get back". */
export const toGetBack = (bills: Bill[], shares: BillShare[], payments: BillPayment[], memberId: string): number =>
  sum(
    bills
      .filter((b) => b.paid_by === memberId)
      .map((b) => sum(Object.values(owingOnBill(b, shares, payments)))),
  );
