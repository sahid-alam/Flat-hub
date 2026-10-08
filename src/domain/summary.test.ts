/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { burnRate, kittyDaysLeft, morningSummary, type SummaryFacts } from './summary.ts';

const facts = (over: Partial<SummaryFacts> = {}): SummaryFacts => ({
  spentThisMonthPaise: 0,
  daysElapsed: 1,
  poolPaise: 0,
  yourDutiesToday: [],
  withYouToday: [],
  othersDutiesToday: [],
  youPlanMeals: false,
  expiring: [],
  othersNotToppedUp: 0,
  missedYesterday: 0,
  isTreasurer: false,
  alert: null,
  ...over,
});

// ---------------------------------------------------------------- the money in it

test('burn rate divides by the days that have happened, never by zero', () => {
  // The flat's own figures: ₹2,350 spent, 7 days in → ₹335.71 a day, quoted as ₹336. An average
  // over a week, used to guess a number of days, does not get to claim paise.
  assert.equal(burnRate(235_000, 7), 33_600);
  // Day one of a month: the month is one day old, not zero days old.
  assert.equal(burnRate(60_00, 1), 6000);
  assert.equal(burnRate(60_00, 0), 6000);
  assert.equal(burnRate(0, 9), 0);
});

test('days left is whole days of kitty at that rate, and silent when it cannot be known', () => {
  assert.equal(kittyDaysLeft(1_140_000, 33_600), 33); // ₹11,400 at ₹336 a day
  assert.equal(kittyDaysLeft(1_140_000, 0), null); // nothing spent yet: no rate, no estimate
  assert.equal(kittyDaysLeft(0, 33_600), null); // an empty kitty has nothing to run down
  assert.equal(kittyDaysLeft(-500, 33_600), null); // overdrawn: same answer, not a negative count
});

test('the burn line quotes the rate and the days, and both agree with the maths', () => {
  const [line] = morningSummary(facts({ spentThisMonthPaise: 235_000, daysElapsed: 7, poolPaise: 1_140_000 }));
  // No paise on the rate, and the two figures check out against each other: 11,400 / 336 = 33.9.
  assert.match(line, /^At ₹336 a day the kitty lasts about 33 more days\.$/);
  assert.equal(Math.floor(1_140_000 / 33_600), 33);
});

test('no spending means no burn line, rather than a made-up one', () => {
  assert.deepEqual(morningSummary(facts({ poolPaise: 1_140_000 })), []);
});

// ---------------------------------------------------------------- the four house rules

test('rule 4: nothing worth saying means nothing is said', () => {
  assert.deepEqual(morningSummary(facts()), []);
});

test('rule 3: the summary drops the line the alert card above it already carries', () => {
  const f = facts({ isTreasurer: true, othersNotToppedUp: 2, poolPaise: 1_140_000 });
  assert.match(morningSummary({ ...f, alert: null })[0], /still haven't topped up/);
  assert.ok(!morningSummary({ ...f, alert: 'topup' }).some((l) => /top up/.test(l)));
});

test("rule 1: another mate's miss is a count, never a name", () => {
  const lines = morningSummary(
    facts({ missedYesterday: 1, othersNotToppedUp: 2, isTreasurer: true, poolPaise: 1_140_000 }),
  ).join(' ');
  for (const name of ['Adnan', 'Anant', 'Ansh', 'Ayan', 'Jatin', 'Sahid']) assert.ok(!lines.includes(name));
  assert.match(lines, /one duty went undone/);
  assert.match(lines, /Two mates still haven't topped up/);
});

test('rule 2: no ranking words anywhere', () => {
  const lines = morningSummary(
    facts({
      yourDutiesToday: ['the dishes'],
      withYouToday: ['Adnan'],
      youPlanMeals: true,
      expiring: [{ name: 'Milk', daysLeft: 0 }],
      spentThisMonthPaise: 235_000,
      daysElapsed: 7,
      poolPaise: 1_140_000,
      missedYesterday: 2,
    }),
  ).join(' ');
  assert.ok(!/\b(most|least|best|worst|top|behind|ahead|leader)\b/i.test(lines));
});

test('at most three lines, however much is true', () => {
  const lines = morningSummary(
    facts({
      isTreasurer: true,
      othersNotToppedUp: 3,
      yourDutiesToday: ['the dishes'],
      expiring: [{ name: 'Milk', daysLeft: 0 }],
      spentThisMonthPaise: 235_000,
      daysElapsed: 7,
      poolPaise: 1_140_000,
      missedYesterday: 1,
    }),
  );
  assert.equal(lines.length, 3);
});

// ---------------------------------------------------------------- the wording

test("your duty today, with whoever shares it, and the cook when it's the meal duty", () => {
  assert.equal(
    morningSummary(facts({ yourDutiesToday: ['the dishes'], withYouToday: ['Adnan'], youPlanMeals: true }))[0],
    'You and Adnan are on the dishes today, so you also tell the cook what to make.',
  );
  assert.equal(
    morningSummary(facts({ yourDutiesToday: ['the dishes', 'the bins'] }))[0],
    'You are on the dishes and the bins today.',
  );
});

test("somebody else's turn is named, because an assignment is not a miss", () => {
  assert.equal(
    morningSummary(facts({ othersDutiesToday: [{ duty: 'the dishes', who: 'Sahid' }] }))[0],
    'Nothing of yours is due today — Sahid is on the dishes.',
  );
});

test('two mates on one duty and a third on another are not merged into one duty', () => {
  // The bug this locks: "Sahid, Anant and Jatin are on dishes rota" when Jatin is on the water can.
  const f = facts({
    othersDutiesToday: [
      { duty: 'dishes rota', who: 'Sahid' },
      { duty: 'dishes rota', who: 'Anant' },
      { duty: 'water can refill', who: 'Jatin' },
    ],
  });
  assert.equal(
    morningSummary(f)[0],
    'Nothing of yours is due today — Sahid and Anant are on dishes rota and Jatin on water can refill.',
  );
  // Past two duties it counts rather than listing, like the expiry line.
  const four = facts({
    othersDutiesToday: ['dishes rota', 'water can refill', 'bins out', 'kitchen floor'].map((duty, i) => ({
      duty,
      who: ['Sahid', 'Anant', 'Jatin', 'Ayan'][i],
    })),
  });
  assert.equal(
    morningSummary(four)[0],
    'Nothing of yours is due today — Sahid is on dishes rota, Anant on water can refill and two other duties are covered.',
  );
});

test('a duty named the way the flat names it still reads as English', () => {
  // The flat's duties are "Dishes rota", "Bins out", "Kitchen floor" — bare nouns with no article.
  // "Kabir has dishes rota" was shipped once; "is on" is the construction that survives all of them.
  for (const duty of ['dishes rota', 'bins out', 'kitchen floor', 'water filter change']) {
    assert.equal(
      morningSummary(facts({ othersDutiesToday: [{ duty, who: 'Ansh' }] }))[0],
      `Nothing of yours is due today — Ansh is on ${duty}.`,
    );
    assert.equal(morningSummary(facts({ yourDutiesToday: [duty] }))[0], `You are on ${duty} today.`);
  }
});

test('a plural miss does not get a singular pronoun', () => {
  assert.match(morningSummary(facts({ missedYesterday: 1 })).join(' '), /one duty went undone\. It is on the Duties tab if you want it\./);
  assert.match(morningSummary(facts({ missedYesterday: 3 })).join(' '), /three duties went undone\. They are on the Duties tab if you want them\./);
});

test('expiry says the day in words and totals the rest without listing them', () => {
  assert.equal(
    morningSummary(facts({ expiring: [{ name: 'Milk', daysLeft: 0 }] }))[0],
    'The milk needs using — today.',
  );
  assert.equal(
    morningSummary(facts({ expiring: [{ name: 'Dahi', daysLeft: 2 }, { name: 'Milk', daysLeft: 2 }] }))[0],
    'The dahi needs using — in two days. One other thing needs using too.',
  );
});

test('the word "owe" never appears — DESIGN.md rule 5', () => {
  const lines = morningSummary(
    facts({
      isTreasurer: true,
      othersNotToppedUp: 2,
      poolPaise: 1_140_000,
      spentThisMonthPaise: 235_000,
      daysElapsed: 7,
    }),
  ).join(' ');
  assert.ok(!/owe/i.test(lines));
});
