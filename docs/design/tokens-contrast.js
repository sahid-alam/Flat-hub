// Measures every colour pair the app actually renders, in both modes, and prints DESIGN.md's table.
// The hexes below are a copy of `tokens` in src/ui/kit.tsx — keep the two in step. Change a token,
// run `node docs/design/tokens-contrast.js`, and paste the table it prints back into DESIGN.md.
// It exits non-zero if any pair misses its WCAG AA minimum, so it answers "did you measure it?" with
// a number rather than a claim. Contrast maths copied from concept-gen.js.
// Run: node docs/design/tokens-contrast.js

const lum = (hex) => {
  const v = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
};

const dark = {
  ground: '#15130F', surface: '#221F19', raised: '#2C2821', sunk: '#38332B',
  line: '#857C6C', hair: '#302C25',
  ink: '#F2EDE3', muted: '#ACA394',
  accent: '#C9A45C', accentText: '#DCBE80', onAccent: '#15130F',
  positive: '#7FCB9F', positiveBg: '#17291E',
  negative: '#F0998A', negativeBg: '#2F1B16', onNegative: '#15130F',
  warnBg: '#2D2616', warnFg: '#E6C184',
  solid: '#F2EDE3', onSolid: '#15130F',
  navActive: '#302C25', navRest: '#1E1B16',
};
const light = {
  ground: '#F6F3EE', surface: '#FFFFFF', raised: '#EDE8DF', sunk: '#E3DCCF',
  line: '#8A8275', hair: '#E4DED2',
  ink: '#1A1714', muted: '#5E574C',
  accent: '#C9A45C', accentText: '#7A5C22', onAccent: '#1A1714',
  positive: '#196740', positiveBg: '#E4F1E8',
  negative: '#A83421', negativeBg: '#F8E3DE', onNegative: '#F6F3EE',
  warnBg: '#F6EBD6', warnFg: '#6B4E12',
  solid: '#1A1714', onSolid: '#F6F3EE',
  navActive: '#FFFFFF', navRest: '#EAE4D9',
};
// Block fills are the same in both modes and always carry onyx ink.
// `positive` here is the light green: `filledInk` in kit.tsx puts it on a stone block in BOTH modes,
// because the fill does not follow the mode.
const block = { stone: '#E3DCCF', brass: '#C9A45C', sage: '#7FCB9F', onyx: '#1A1714', onyxMuted: '#3A342B',
  positive: '#196740' };

// min 4.5 = body text, 3 = large text and interactive borders. Dividers (`hair`) carry no text and
// have no AA minimum, so they are reported but never asserted.
const PAIRS = [
  ['Body text on the canvas', 'ink', 'ground', 4.5],
  ['Body text on a card', 'ink', 'surface', 4.5],
  ['Body text on a chip or tile', 'ink', 'raised', 4.5],
  ['Body text on a sunk field', 'ink', 'sunk', 4.5],
  ['Secondary text on the canvas', 'muted', 'ground', 4.5],
  ['Secondary text on a card', 'muted', 'surface', 4.5],
  ['Secondary text on a chip or tile', 'muted', 'raised', 4.5],
  ['Secondary text on a sunk field', 'muted', 'sunk', 4.5],
  ['Brass as text on the canvas', 'accentText', 'ground', 4.5],
  ['Brass as text on a card', 'accentText', 'surface', 4.5],
  ['Brass as text on a chip or tile', 'accentText', 'raised', 4.5],
  ['Ink on the brass pill', 'onAccent', 'accent', 4.5],
  ['Ink on the default pill', 'onSolid', 'solid', 4.5],
  ['Ink on the destructive pill', 'onNegative', 'negative', 4.5],
  ['"Get back" green on the canvas', 'positive', 'ground', 4.5],
  ['"Get back" green on a card', 'positive', 'surface', 4.5],
  ['"Get back" green on a chip or tile', 'positive', 'raised', 4.5],
  ['"Get back" green on its own badge', 'positive', 'positiveBg', 4.5],
  ['Clay on a card', 'negative', 'surface', 4.5],
  ['Clay on a chip or tile', 'negative', 'raised', 4.5],
  ['Clay on its own badge', 'negative', 'negativeBg', 4.5],
  ['"Off by" text on its warm bar', 'warnFg', 'warnBg', 4.5],
  ['Active tab label on its capsule', 'ink', 'navActive', 4.5],
  ['Resting tab icon on its capsule', 'muted', 'navRest', 3],
  ['Interactive border on the canvas', 'line', 'ground', 3],
  ['Interactive border on a card', 'line', 'surface', 3],
  ['Interactive border on a chip or tile', 'line', 'raised', 3],
  ['Divider on a card (no AA minimum)', 'hair', 'surface', 0],
];
// Stone, brass and sage blocks switch their children to onyx ink in both modes.
const BLOCKS = [
  ['Onyx ink on a stone block', 'onyx', 'stone', 4.5],
  ['Onyx muted on a stone block', 'onyxMuted', 'stone', 4.5],
  ['Onyx ink on a brass block', 'onyx', 'brass', 4.5],
  ['Onyx muted on a brass block', 'onyxMuted', 'brass', 4.5],
  ['Onyx ink on a sage block', 'onyx', 'sage', 4.5],
  ['Onyx muted on a sage block', 'onyxMuted', 'sage', 4.5],
  ['"Get back" green on a stone block', 'positive', 'stone', 4.5],
];

let failed = 0;
const cell = (v, min) => {
  if (min && v < min) failed++;
  return min && v < min ? '**' + v.toFixed(2) + ' FAIL**' : v.toFixed(2);
};

console.log('| Pair | Light | Dark | Min |');
console.log('|---|---|---|---|');
for (const [name, a, b, min] of PAIRS) {
  const m = min ? min.toFixed(1) : '—';
  console.log(`| ${name} | ${cell(ratio(light[a], light[b]), min)} | ${cell(ratio(dark[a], dark[b]), min)} | ${m} |`);
}
console.log('\n| Pair (both modes) | Ratio | Min |');
console.log('|---|---|---|');
for (const [name, a, b, min] of BLOCKS) {
  console.log(`| ${name} | ${cell(ratio(block[a], block[b]), min)} | ${min.toFixed(1)} |`);
}

const n = PAIRS.filter((p) => p[3]).length * 2 + BLOCKS.length;
console.log(failed ? `\n${failed} of ${n} pairs FAIL` : `\nall ${n} asserted pairs pass`);
process.exit(failed ? 1 : 0);
