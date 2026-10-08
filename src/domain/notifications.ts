// The 22 notification triggers from docs/NOTIFICATIONS.md, as data. Pure TypeScript: no React,
// no Supabase. This is the single source of truth for the settings screen, and the Channel column
// in the doc is binding — a trigger that is in-app or digest never pushes, so "sound" is not one of
// its options.
//
// The database stores only departures from the defaults here (public.notification_pref). Absent row
// means `defaultMode(trigger)`. B9 reads the table and that rule; it does not read this file.

/** push: earns the interrupt. inApp: the in-app list. digest: the one 19:00 roll-up. */
export type Channel = 'push' | 'inApp' | 'digest';
export type Mode = 'sound' | 'silent' | 'off';
export type Group = 'duties' | 'money' | 'kitchen' | 'flat';

export type Trigger = {
  key: string;
  /** The row's label, in the words the flat uses. */
  label: string;
  /** What arriving actually means for this one. */
  detail: string;
  channel: Channel;
  group: Group;
  /** Money and the core chore: reachable always, so `off` is not offered. */
  locked?: true;
};

export const TRIGGERS: Trigger[] = [
  // ---- duties
  { key: 'duty_due_today', label: 'Your duty is due today', detail: '8:00 am, the day it is your turn', channel: 'push', group: 'duties', locked: true },
  { key: 'duty_not_ticked', label: 'Your duty is still not ticked', detail: '8:00 pm, and only if it is still open', channel: 'push', group: 'duties' },
  { key: 'duty_partner_pending', label: 'Your half of a shared duty is still open', detail: 'Your partner ticked theirs', channel: 'push', group: 'duties' },
  { key: 'duty_offered', label: 'A duty was offered — anyone can take it', detail: 'Once, to everyone who is here', channel: 'push', group: 'duties' },
  { key: 'duty_offer_claimed', label: 'The duty you offered has been claimed', detail: 'You were waiting on an answer', channel: 'push', group: 'duties' },
  { key: 'duty_offer_unclaimed', label: 'Nobody claimed your offer', detail: 'It is due today and still yours', channel: 'inApp', group: 'duties' },
  { key: 'duty_vouched', label: 'Someone vouched that you did it', detail: 'A flatmate confirmed your duty', channel: 'inApp', group: 'duties' },
  { key: 'meal_plan_due', label: "You're on dishes — what's for lunch and dinner?", detail: '10:30 am, if the plan is not in yet', channel: 'push', group: 'duties' },

  // ---- money
  { key: 'topup_not_in', label: "Your ₹2,000 top-up isn't in yet", detail: 'The 5th of the month', channel: 'push', group: 'money', locked: true },
  { key: 'reimbursed', label: 'You have been reimbursed', detail: 'Money arriving, from the treasurer', channel: 'push', group: 'money', locked: true },
  { key: 'month_ready_to_close', label: 'The month is ready to close', detail: 'The treasurer only, on the 1st', channel: 'push', group: 'money', locked: true },
  { key: 'topup_recorded', label: 'Your top-up was recorded', detail: 'A receipt for what you paid', channel: 'inApp', group: 'money' },
  { key: 'kitty_low', label: 'The kitty is running low', detail: 'The treasurer only', channel: 'inApp', group: 'money' },
  { key: 'spend_reversed', label: 'A spend was reversed', detail: 'The payer and the treasurer', channel: 'inApp', group: 'money' },
  { key: 'month_closed', label: 'The month was closed', detail: 'Your share is now frozen', channel: 'inApp', group: 'money' },

  // ---- kitchen
  { key: 'lot_expiring', label: 'Something expires tomorrow', detail: 'On the fridge screen and in the 7:00 pm digest', channel: 'digest', group: 'kitchen' },
  { key: 'lot_expired', label: 'Something expired and is still in the fridge', detail: 'With the expiring list', channel: 'digest', group: 'kitchen' },
  { key: 'stock_below_min', label: 'Below minimum — add it to the list', detail: 'On the shopping screen', channel: 'inApp', group: 'kitchen' },
  { key: 'import_needs_putaway', label: 'An order needs putting away', detail: 'Only the person who imported it', channel: 'inApp', group: 'kitchen' },
  { key: 'shopping_added', label: 'Someone added to the shopping list', detail: 'Rolled into the 7:00 pm digest', channel: 'digest', group: 'kitchen' },

  // ---- the flat
  { key: 'mate_joined', label: 'A new mate joined the flat', detail: 'Everyone', channel: 'inApp', group: 'flat' },
  { key: 'marked_away', label: 'You were marked away', detail: 'In case someone logged it for you', channel: 'inApp', group: 'flat' },
];

export const GROUP_LABEL: Record<Group, string> = {
  duties: 'Duties and meals',
  money: 'Money',
  kitchen: 'Fridge and shopping',
  flat: 'The flat',
};

/** Nothing is muted until a mate says so: push triggers arrive loudly, the rest arrive quietly. */
export const defaultMode = (t: Trigger): Mode => (t.channel === 'push' ? 'sound' : 'silent');

/** What a trigger can be set to. Only a push can make a sound; only an unlocked one can be off. */
export function modesFor(t: Trigger): Mode[] {
  const loud: Mode[] = t.channel === 'push' ? ['sound', 'silent'] : ['silent'];
  return t.locked ? loud : [...loud, 'off'];
}

/** The stored choice, or the default, and never a mode this trigger does not offer: a locked row
 *  that somehow holds 'off' (an old client, a hand-edited row) still arrives. */
export function modeFor(t: Trigger, stored: Mode | undefined): Mode {
  const allowed = modesFor(t);
  return stored && allowed.includes(stored) ? stored : defaultMode(t);
}

export const MODE_LABEL: Record<Mode, string> = {
  sound: 'Sound',
  silent: 'Silent',
  off: 'Off',
};
