// DESIGN.md rule 5, enforced against the SCREENS rather than against one function's return value.
//
// summary.test.ts already asserts the rule for morningSummary(), and that test passed for weeks
// while "nothing is owed for it" sat at the foot of the Duties tab, because it never saw a screen.
// A rule about the words six people read has to be checked where those words are.
//
// This reads the source rather than importing it: every screen is a React component that needs a
// household, a palette and a navigator before it will render a single string, and standing all
// that up to grep for a word is far more machinery than the word is worth.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

/** The screens and the shared UI. domain/ and lib/ hold no copy. */
const ROOTS = ['../app', '../ui'];

const files = (rel: string): string[] => {
  const dir = new URL(`${rel}/`, import.meta.url);
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))
    .map((f) => `${rel}/${f}`);
};

/** Comments are notes to us, not copy: "the kitty owes you" is fine in a comment and banned on screen. */
const stripComments = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

/**
 * Every string literal and every run of JSX text, with `${…}` holes blanked out so an interpolated
 * variable called `owed` is not mistaken for the word on screen. Scanning only these is what keeps
 * identifiers (`owingOnBill`, `const owed = …`) out of the result, which is the whole trick.
 */
function blankHoles(s: string): string {
  // Innermost first, so a nested hole like ${a ? `${b}` : c} goes too rather than leaving half an
  // expression behind to be read as copy.
  for (let out = s; ; ) {
    const next = out.replace(/\$\{[^{}]*\}/g, ' ');
    if (next === out) return out;
    out = next;
  }
}

function copyOf(src: string): string[] {
  const body = stripComments(src);
  const out: string[] = [];
  for (const m of body.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g))
    out.push(blankHoles(m[1] ?? m[2] ?? m[3] ?? ''));
  // JSX text: the run between two tags. The delimiters are crude — `=>` also ends in `>` — so the
  // run must look like prose and not like code: no braces, no brackets, no semicolons, no equals,
  // and at least one letter. A line of copy containing a bracket is the price, and it is cheap.
  for (const m of body.matchAll(/>([^<>{}()[\];=]+)</g)) if (/[a-z]/i.test(m[1])) out.push(m[1]);
  return out;
}

/** Rule 5: 'Pay' / 'Get back', never 'owe'; 'Not yet', never 'Overdue'. */
const BANNED = /\b(owe|owes|owed|owing|overdue)\b/i;

test('DESIGN.md rule 5: no "owe" and no "Overdue" in anything a flatmate reads', () => {
  const hits: string[] = [];
  for (const rel of ROOTS)
    for (const f of files(rel)) {
      const src = readFileSync(new URL(f, import.meta.url), 'utf8');
      for (const line of copyOf(src)) {
        // Last gate: copy is prose. Anything still carrying a brace, a bracket or a semicolon is
        // code the crude delimiters above mis-paired — a stray backtick, a regex literal — and a
        // lint that cries wolf gets switched off, which is worse than the lint not existing.
        if (/[{}()[\];]/.test(line)) continue;
        const bad = line.match(BANNED);
        if (bad) hits.push(`${f}: ${bad[0]} — ${line.trim().slice(0, 90)}`);
      }
    }
  assert.deepEqual(hits, [], `rule 5 says "Pay"/"Get back" and "Not yet":\n${hits.join('\n')}`);
});

test('the rule-5 scanner reads copy and ignores code', () => {
  // Without this the test above could pass by scanning nothing at all, which is how the original
  // one stayed green.
  assert.ok(files('../app').length > 15, 'the screens were not found');
  // an identifier is not copy, a comment is not copy, and an interpolated hole is not copy
  assert.deepEqual(copyOf('const owed = 1; // he owes me'), []);
  assert.deepEqual(copyOf('const s = `Pay ${owed}`;'), ['Pay  ']);
  // …but the words between two tags are
  assert.deepEqual(copyOf('<T>nothing is owed</T>'), ['nothing is owed']);
  assert.match(copyOf('const s = `you are overdue`;')[0], BANNED);
  assert.deepEqual(copyOf('const f = (a) => a + 1;\n<T>fine</T>'), ['fine']);
});
