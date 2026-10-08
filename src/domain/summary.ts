// The morning summary on Home. Templated from facts the app already holds — no LLM, so it is free,
// instant, works offline, and cannot invent a rupee figure. Pure TypeScript: no React, no Supabase.
//
// Four house rules, each enforced below and each with a test:
//   1. Never name another mate's miss. Misses are counts; whose turn it is today is an assignment,
//      not a miss, so names are fine there.
//   2. Never rank the six. No "most", "least", "best" or ordering by score.
//   3. Never repeat the alert card sitting directly above it — `alert` says which one is showing.
//   4. Say nothing rather than pad. No facts worth stating → an empty list, and Home draws no card.

import { formatINR } from './money.ts';

/** Which alert card Home is showing above the summary, so the summary can drop that line. */
export type Alert = 'payback' | 'getback' | 'topup' | null;

export type SummaryFacts = {
  /** Spends charged to this IST month, and how many days of it have happened (1 on the 1st). */
  spentThisMonthPaise: number;
  daysElapsed: number;
  /** What the kitty holds right now. */
  poolPaise: number;
  /** Duties due today that are yours, and the first names sharing one with you. */
  yourDutiesToday: string[];
  withYouToday: string[];
  /** Duties due today that are somebody else's: the duty and whose turn it is. */
  othersDutiesToday: { duty: string; who: string }[];
  /** You hold a duty flagged plans_meals today, so you are the one the cook waits on. */
  youPlanMeals: boolean;
  /** Lots at or past their last usable day: name and days left (0 = today, negative = past). */
  expiring: { name: string; daysLeft: number }[];
  /** How many OTHER mates have not topped up this month. A count, never a name — rule 1. */
  othersNotToppedUp: number;
  /** Duties that fell due yesterday with nothing recorded. A count, never a name — rule 1. */
  missedYesterday: number;
  isTreasurer: boolean;
  alert: Alert;
};

/**
 * Paise a day, over the days of this month that have actually happened. The divisor is never 0:
 * on the 1st the month is one day old, not zero days old, or the first spend of a month would
 * divide by zero and the kitty would read as lasting forever.
 *
 * Rounded to the whole RUPEE. This is an average over a handful of days used to guess at a number
 * of days — "₹232.11 a day" claims a precision the estimate does not have, and the paise are noise
 * on a figure nobody can act on to the paise. kittyDaysLeft() divides by this same rounded rate, so
 * the two numbers in the line always agree with each other when a mate checks them.
 */
export const burnRate = (spentThisMonthPaise: number, daysElapsed: number): number =>
  Math.round(spentThisMonthPaise / Math.max(1, daysElapsed) / 100) * 100;

/**
 * Whole days the kitty lasts at that rate. null when nothing is being spent (no rate, so no
 * estimate) or when the kitty is empty or overdrawn (there is nothing to run down).
 */
export function kittyDaysLeft(poolPaise: number, perDayPaise: number): number | null {
  if (perDayPaise <= 0 || poolPaise <= 0) return null;
  return Math.floor(poolPaise / perDayPaise);
}

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
/** 'two mates' reads better than '2 mates'. Figures stay figures; only small counts spell out. */
const count = (n: number): string => (n < WORDS.length ? WORDS[n] : String(n));
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
/** A line is prose, so a sentence inside it starts with a capital. */
const cap = (word: string): string => word[0].toUpperCase() + word.slice(1);

/** 'the dishes and the bins', without an Oxford comma argument. */
const list = (xs: string[]): string =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

/** Your duties today, and the meal-planning consequence if you hold that duty. */
function dutyLine(f: SummaryFacts): string | null {
  // "on <duty>" throughout, because a duty's name is whatever the flat typed — "dishes rota",
  // "bins out", "kitchen floor". "You have dishes rota" and "Kabir has dishes rota" are not
  // English; "you are on dishes rota" and "Kabir is on dishes rota" take a bare name and stay
  // English for every one of them, without the template having to guess at an article.
  if (f.yourDutiesToday.length) {
    const who = f.withYouToday.length ? `You and ${list(f.withYouToday)} are` : 'You are';
    const what = `${who} on ${list(f.yourDutiesToday)} today`;
    return f.youPlanMeals ? `${what}, so you also tell the cook what to make.` : `${what}.`;
  }
  if (f.othersDutiesToday.length === 0) return null;
  // Naming whose turn it is is an assignment, not a miss — rule 1 is about misses.
  const first = f.othersDutiesToday[0];
  const others = [...new Set(f.othersDutiesToday.map((d) => d.who))];
  const who = others.length === 1 ? first.who : list(others);
  return `Nothing of yours is due today — ${who} ${plural(others.length, 'is', 'are')} on ${first.duty}.`;
}

function expiryLine(f: SummaryFacts): string | null {
  if (f.expiring.length === 0) return null;
  const [first] = f.expiring;
  const when = first.daysLeft <= 0 ? 'today' : `in ${count(first.daysLeft)} ${plural(first.daysLeft, 'day', 'days')}`;
  const rest = f.expiring.length - 1;
  const more = rest > 0 ? ` ${cap(count(rest))} other ${plural(rest, 'thing', 'things')} ${plural(rest, 'needs', 'need')} using too.` : '';
  return `The ${first.name.toLowerCase()} needs using — ${when}.${more}`;
}

function burnLine(f: SummaryFacts): string | null {
  const perDay = burnRate(f.spentThisMonthPaise, f.daysElapsed);
  const days = kittyDaysLeft(f.poolPaise, perDay);
  if (days === null) return null;
  return `At ${formatINR(perDay)} a day the kitty lasts about ${days} more ${plural(days, 'day', 'days')}.`;
}

/** The treasurer's own line: he is the one who can chase it, and it is a count, never a name. */
function topUpLine(f: SummaryFacts): string | null {
  if (!f.isTreasurer || f.othersNotToppedUp === 0) return null;
  const n = f.othersNotToppedUp;
  return `${cap(count(n))} ${plural(n, 'mate', 'mates')} still ${plural(n, "hasn't", "haven't")} topped up this month, and you are holding ${formatINR(f.poolPaise)}.`;
}

function missedLine(f: SummaryFacts): string | null {
  if (f.missedYesterday === 0) return null;
  const n = f.missedYesterday;
  const it = plural(n, 'It is', 'They are');
  return `Yesterday ${count(n)} ${plural(n, 'duty', 'duties')} went undone. ${it} on the Duties tab if you want ${plural(n, 'it', 'them')}.`;
}

const LINES = 3; // three lines is a glance; a fourth is a paragraph nobody reads

/**
 * Up to three lines, most actionable first. The treasurer's top-up line leads because he is the
 * only one who can do anything about it; for everyone else the day starts with their own duty.
 */
export function morningSummary(f: SummaryFacts): string[] {
  // rule 3: the alert card above already says this, so the summary drops it rather than echoing it.
  const dropTopUp = f.alert === 'topup';
  return [dropTopUp ? null : topUpLine(f), dutyLine(f), expiryLine(f), burnLine(f), missedLine(f)]
    .filter((l): l is string => l !== null)
    .slice(0, LINES);
}
