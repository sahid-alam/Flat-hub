// Generates docs/design/directions.html — four visual directions, two screens each, dark + light.
// Run: node gen.js
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------- contrast
const lum = (hex) => {
  const v = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const r2 = (a, b) => Math.round(ratio(a, b) * 100) / 100;

// ---------------------------------------------------------------- directions
const dirs = [
  {
    id: 'paper',
    motion:
      '<b>Switch: 280&nbsp;ms, <code>cubic-bezier(.32,.72,0,1)</code>.</b> Measured label widths at 14/700 Inter: Kitty 32, Kitchen 52, Duties 43, Spending 64&nbsp;pt. The leaving pill loses its label width and the group capsule gains exactly that much, both on the one curve for the full 280&nbsp;ms, so the 7&nbsp;pt gap never changes. The outgoing label fades to 0 over the first 80&nbsp;ms with a &minus;6&nbsp;pt x-shift; the incoming one fades in from 120&rarr;280&nbsp;ms with a +6&nbsp;pt x-shift, so the two never overlap. The 40&nbsp;pt badge keeps its indigo fill and crossfades glyphs over 140&nbsp;ms centred on 140&nbsp;ms, scaling 0.90&rarr;1. The entering icon leaves the group and the leaving icon re-enters it on the same curve and duration, so no glyph jumps. Press: scale 0.96 over 100&nbsp;ms, release over 180&nbsp;ms. <b>Reduced motion:</b> widths snap, only label and glyph crossfade, 120&nbsp;ms. <b>Measured geometry:</b> at the 362&nbsp;pt bar width the three group icons are 48&nbsp;pt tall and 51&ndash;62&nbsp;pt wide; the narrowest case is Spending active at 51&nbsp;pt, which clears the 44&nbsp;pt floor.',
    glyphs:
      'SF-weight 1.8&nbsp;pt strokes at 24&nbsp;pt, and four silhouettes that share no outline: the wallet keeps its card slot and stud, the fridge its door split and two handles, the checklist two ticks against two rules, the chart an arrowhead. None of them is a plain rounded rectangle.',
    name: 'Paper',
    one: 'For the flatmate who wants it to feel like Apple shipped it — cool grey canvas, inset grouped lists, nothing shouting.',
    notes:
      'iOS grouped-list DNA. Cool grey canvas, white inset groups with 12px corners and hairline separators, sentence-case headers sitting outside the group, chevrons on anything that opens. Indigo is the only accent and it only ever marks what you can tap. Inter throughout, tabular figures.',
    fonts: { ui: "'Inter'", num: "'Inter'", mark: "'Inter'" },
    mark: { weight: 800, size: 19, spacing: '-.035em', transform: 'uppercase', accent: false },
    light: {
      canvas: '#F2F2F7', surface: '#FFFFFF', raised: '#FFFFFF', ink: '#11111A', muted: '#64646E',
      accent: '#2F4FD0', onAccent: '#FFFFFF', hair: '#D7D7DE', border: '#7E7E8A',
      pos: '#0D6E3C', posBg: '#E3F3EA', warn: '#7D5500', warnBg: '#FBF0DA', neg: '#B22217', negBg: '#FBE4E1',
      podAct: '#FFFFFF', podGrp: '#E2E2E9',
    },
    dark: {
      canvas: '#000000', surface: '#1B1B1E', raised: '#1B1B1E', ink: '#FFFFFF', muted: '#9B9BA4',
      accent: '#9AAEFF', onAccent: '#0A0A14', hair: '#333338', border: '#75757F',
      pos: '#56D28A', posBg: '#132A1E', warn: '#E8BA68', warnBg: '#2B2314', neg: '#FF8A7B', negBg: '#2E1714',
      podAct: '#2C2C31', podGrp: '#19191C',
    },
  },
  {
    id: 'masala',
    motion:
      '<b>Switch: 340&nbsp;ms, <code>cubic-bezier(.2,.9,.25,1)</code></b> &mdash; the softest of the four, with a 2&nbsp;pt settle at the end of the width change. Measured label widths at 14/700 Inter are Kitty 32, Kitchen 52, Duties 43, Spending 64&nbsp;pt; the pill and the group capsule trade exactly that width across the full 340&nbsp;ms. The outgoing label fades over the first 100&nbsp;ms (&minus;8&nbsp;pt x), the incoming from 150&rarr;340&nbsp;ms (+8&nbsp;pt x). The petrol badge crossfades glyphs over 170&nbsp;ms at the midpoint with a 0.88&rarr;1.03&rarr;1 scale &mdash; the only overshoot in any of the four, and it belongs to this direction, not the others. Press: 0.97 over 120&nbsp;ms, release 220&nbsp;ms. <b>Reduced motion:</b> widths snap, crossfades only, 140&nbsp;ms, no overshoot. <b>Measured geometry:</b> at the 362&nbsp;pt bar width the three group icons are 48&nbsp;pt tall and 50&ndash;60&nbsp;pt wide; the narrowest case is Spending active at 50&nbsp;pt, which clears the 44&nbsp;pt floor.',
    glyphs:
      '1.8&nbsp;pt strokes with rounded joins at 24&nbsp;pt so they sit with the serif. The fridge keeps its door split and both handles &mdash; that split is the one thing stopping it reading as the wallet at arm\'s length, so it never gets simplified away.',
    name: 'Masala',
    one: 'For the flat that cooks together — warm cream, a serif voice on every heading, petrol blue as the single accent.',
    notes:
      'The warm one, and the only one with a serif in it. Instrument Serif carries the wordmark and every heading, Inter carries the figures. Quick add stops being a grid of boxes and becomes a row of tappable 46pt chips; each fridge lot is its own soft card with an 18px radius, so the list breathes. The accent is a petrol blue, chosen so it cannot be read as the green of money coming back or the red of a loss.',
    fonts: { ui: "'Inter'", num: "'Inter'", mark: "'Instrument Serif'" },
    mark: { weight: 400, size: 30, spacing: '-.005em', transform: 'none', accent: true },
    light: {
      canvas: '#FBF4E8', surface: '#FFFCF6', raised: '#F2E7D3', ink: '#231B11', muted: '#6B5C47',
      accent: '#0C5A70', onAccent: '#FFFCF6', hair: '#E6D9C2', border: '#8C7C63',
      pos: '#1B6436', posBg: '#E2F0E4', warn: '#7F5407', warnBg: '#F7E9CE', neg: '#AE2C1C', negBg: '#F8E0DA',
      podAct: '#FFFCF6', podGrp: '#EEE0C7',
    },
    dark: {
      canvas: '#15110B', surface: '#201A12', raised: '#2B241A', ink: '#F4EADA', muted: '#AC9A80',
      accent: '#5EC1DB', onAccent: '#0E1E24', hair: '#332A1E', border: '#80705A',
      pos: '#7BD49E', posBg: '#152719', warn: '#E6BA6E', warnBg: '#2C2314', neg: '#F3907C', negBg: '#301A14',
      podAct: '#2E261B', podGrp: '#1E1810',
    },
  },
  {
    id: 'graphite',
    motion:
      '<b>Switch: 200&nbsp;ms, <code>cubic-bezier(.2,0,0,1)</code></b> &mdash; the tightest of the four, no overshoot anywhere. Measured label widths at 14/700 Geist are Kitty 33, Kitchen 52, Duties 44, Spending 64&nbsp;pt; pill and group trade that width over the full 200&nbsp;ms on one curve. The outgoing label cuts to 0 over 60&nbsp;ms (&minus;4&nbsp;pt x), the incoming arrives 90&rarr;200&nbsp;ms (+4&nbsp;pt x). The periwinkle badge crossfades glyphs over 110&nbsp;ms at the midpoint, scale 0.94&rarr;1. The 20&nbsp;pt capsule corners are constant; nothing about the shape animates except width. Press: 0.97 over 80&nbsp;ms, release 140&nbsp;ms. <b>Reduced motion:</b> widths snap, crossfade 100&nbsp;ms. <b>Measured geometry:</b> at the 362&nbsp;pt bar width the three group icons are 48&nbsp;pt tall and 51&ndash;62&nbsp;pt wide; the narrowest case is Spending active at 51&nbsp;pt, which clears the 44&nbsp;pt floor.',
    glyphs:
      '2&nbsp;pt strokes at 24&nbsp;pt, and the muted ink is held at 3:1 against the group capsule rather than allowed to fade &mdash; on the darkest canvas of the four, an inactive glyph that dims below that stops being an affordance and starts being decoration.',
    name: 'Graphite',
    one: 'For reading the kitty at 1am — cool near-black, no cards at all, the tightest rhythm of the four.',
    notes:
      'The dark-first one. The balance sits straight on the canvas with a spend bar under it instead of inside a card; quick add is three compact columns; the fridge is plain rows divided by hairlines. Underline tabs rather than pills. Periwinkle is the accent and it is the only colour that is not a state.',
    fonts: { ui: "'Geist'", num: "'Geist'", mark: "'Geist'" },
    mark: { weight: 800, size: 18, spacing: '-.05em', transform: 'uppercase', accent: false },
    dark: {
      canvas: '#0D0E12', surface: '#171A20', raised: '#1F232B', ink: '#EFF1F6', muted: '#949BAB',
      accent: '#93A9FF', onAccent: '#0B0E1A', hair: '#252A33', border: '#6B7284',
      pos: '#5CD39A', posBg: '#122520', warn: '#E2B664', warnBg: '#262013', neg: '#FF8878', negBg: '#2B1715',
      podAct: '#20242D', podGrp: '#14171C',
    },
    light: {
      canvas: '#F3F4F7', surface: '#FFFFFF', raised: '#E8EAEF', ink: '#10121A', muted: '#5A6072',
      accent: '#2F43B8', onAccent: '#FFFFFF', hair: '#DCDFE6', border: '#7B8294',
      pos: '#0E6B40', posBg: '#E2F1E8', warn: '#7A5300', warnBg: '#F7EDD8', neg: '#B0271A', negBg: '#FAE3E0',
      podAct: '#FFFFFF', podGrp: '#E3E6ED',
    },
  },
  {
    id: 'ledger',
    motion:
      '<b>Switch: 160&nbsp;ms, <code>cubic-bezier(.4,0,.2,1)</code></b> &mdash; mechanical, no scale and no overshoot, because nothing else in this direction bounces. Measured label widths at 12/700 Inter with 0.08&nbsp;em tracking are KITTY 42, KITCHEN 61, DUTIES 50, SPENDING 70&nbsp;pt; pill and group trade that width over the full 160&nbsp;ms. The outgoing label fades over the first 50&nbsp;ms with no x-shift, the incoming from 80&rarr;160&nbsp;ms, also with none &mdash; letters appear in place. The ink badge crossfades glyphs over 90&nbsp;ms at the midpoint at a flat scale of 1. The 8&nbsp;pt corners and the 1.5&nbsp;pt rules never move. Press: background shifts to the raised tone over 80&nbsp;ms, no transform. <b>Reduced motion:</b> an instant swap &mdash; at 160&nbsp;ms there is almost nothing to remove. <b>Measured geometry:</b> at the 362&nbsp;pt bar width the three group icons are 48&nbsp;pt tall and 47&ndash;56&nbsp;pt wide; the narrowest case is Spending active at 47&nbsp;pt, which clears the 44&nbsp;pt floor.',
    glyphs:
      '2&nbsp;pt strokes at 24&nbsp;pt and no fills anywhere, so silhouette alone carries it: the chart keeps its arrowhead, the checklist two ticks rather than one, the wallet its stud, the fridge its handles. In a direction with no colour to lean on, a vague glyph has nothing to fall back on.',
    name: 'Ledger',
    one: 'For the treasurer — stark black on white, ruled like an account book, monospaced figures that line up to the paisa.',
    notes:
      'The monochrome one. Ink itself is the accent, which leaves colour free to mean exactly one thing each: green is money coming back, amber is soon, red is a loss. Rules instead of cards, 6px corners, dotted leaders between a name and its amount, and JetBrains Mono on every figure so the columns line up.',
    fonts: { ui: "'Inter'", num: "'JetBrains Mono'", mark: "'Inter'" },
    mark: { weight: 800, size: 18, spacing: '-.045em', transform: 'uppercase', accent: false },
    light: {
      canvas: '#FFFFFF', surface: '#FFFFFF', raised: '#F4F4F4', ink: '#0A0A0A', muted: '#5C5C5C',
      accent: '#0A0A0A', onAccent: '#FFFFFF', hair: '#D9D9D9', border: '#7A7A7A',
      pos: '#0B6E3C', posBg: '#E6F2EA', warn: '#7A5300', warnBg: '#F7EED9', neg: '#BA1C10', negBg: '#FBE3E1',
      podAct: '#FFFFFF', podGrp: '#EFEFEF',
    },
    dark: {
      canvas: '#0A0A0A', surface: '#0A0A0A', raised: '#191919', ink: '#FAFAFA', muted: '#9C9C9C',
      accent: '#FAFAFA', onAccent: '#0A0A0A', hair: '#2A2A2A', border: '#7E7E7E',
      pos: '#51CE84', posBg: '#102218', warn: '#E6B85E', warnBg: '#241E12', neg: '#FF7D6C', negBg: '#2A1512',
      podAct: '#1C1C1C', podGrp: '#111111',
    },
  },
];

// ---------------------------------------------------------------- icons
const ic = {
  wallet:
    '<path d="M3 8.5A2.5 2.5 0 0 1 5.5 6H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5.5A2.5 2.5 0 0 1 3 16.5Z"/><path d="M3 8.5V7a2 2 0 0 1 2-2h10"/><circle cx="16" cy="12.5" r="1.2"/>',
  fridge: '<rect x="6" y="3" width="12" height="18" rx="2.5"/><path d="M6 10h12"/><path d="M9 6.5v2"/><path d="M9 12.5v2.5"/>',
  plus: '<path d="M12 6v12"/><path d="M6 12h12"/>',
  duties: '<path d="M4 7l2 2 3.5-3.5"/><path d="M4 17l2 2 3.5-3.5"/><path d="M13 7.5h7"/><path d="M13 17.5h7"/>',
  spend: '<path d="M4 16.5 9 11l3.5 3.5L20 6.5"/><path d="M15 6.5h5v5"/>',
  people: '<circle cx="9" cy="9" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M16 7.2a3 3 0 0 1 0 5.6"/><path d="M17.3 15.4A5.5 5.5 0 0 1 20.5 19"/>',
  chev: '<path d="M9 5l6 6-6 6"/>',
  alert: '<path d="M12 4.5 21 19.5H3Z"/><path d="M12 10v4"/><path d="M12 16.6v.1"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
};
const svg = (n, size = 22, sw = 1.7) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ic[n]}</svg>`;

const RS = '<span class="rs">₹</span>';
const amt = (s, cls = '', sign = '') => `<span class="n ${cls}">${sign}${RS}${s}</span>`;

const statusbar = `<div class="sb"><span class="sb-t">9:41</span><span class="sb-r">
<svg viewBox="0 0 17 12" width="16" height="11" fill="currentColor" aria-hidden="true"><rect x="0" y="7" width="2.6" height="5" rx=".9"/><rect x="4" y="5" width="2.6" height="7" rx=".9"/><rect x="8" y="2.5" width="2.6" height="9.5" rx=".9"/><rect x="12" y="0" width="2.6" height="12" rx=".9"/></svg>
<svg viewBox="0 0 26 13" width="23" height="12" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true"><rect x=".5" y=".5" width="21" height="12" rx="3.5"/><rect x="2" y="2" width="16" height="9" rx="2" fill="currentColor" stroke="none"/><path d="M23.6 4.6v3.8" stroke-linecap="round" stroke-width="1.7"/></svg>
</span></div>`;

/** Four destinations. Add is an action, never a destination, so it lives outside both capsules. */
const DEST = [['wallet', 'Kitty'], ['fridge', 'Kitchen'], ['duties', 'Duties'], ['spend', 'Spending']];
const navbar = (active) => {
  const act = DEST.find((d) => d[1] === active);
  const rest = DEST.filter((d) => d[1] !== active);
  return `<nav class="tabs" aria-label="Main">
  <span class="pod act" aria-current="page"><span class="bdg">${svg(act[0], 21, 1.9)}</span><span class="tl">${act[1]}</span></span>
  <span class="pod grp">${rest.map((d) => `<span class="gi" aria-label="${d[1]}">${svg(d[0], 24, 1.8)}</span>`).join('')}</span>
  <span class="fab" aria-label="Add a spend">${svg('plus', 24, 2.2)}</span>
</nav>`;
};

const QA = [['Atta', '320'], ['Milk', '60'], ['Onions', '50'], ['Rice', '330'], ['Tomatoes', '40']];

const LOTS = [
  { n: 'Milk', q: '200 ml left', s: 'Use today', k: 'warn', open: 'Opened', pack: '1 L pack' },
  { n: 'Paneer', q: '400 g left', s: 'Expired 3 days ago', k: 'neg', open: 'Mark opened', pack: '400 g pack' },
  { n: 'Tomatoes', q: '1.1 kg left', s: '1 day left', k: 'warn', open: 'Opened', pack: '2 kg pack' },
  { n: 'Green chillies', q: '60 g left', s: '3 days left', k: 'ok', open: 'Opened', pack: '100 g pack' },
  { n: 'Curd', q: '350 g left', s: '4 days left', k: 'ok', open: 'Opened', pack: '400 g pack' },
  { n: 'Coriander', q: '1 bunch left', s: '6 days left', k: 'ok', open: 'Unopened', pack: '1 bunch' },
  { n: 'Lemons', q: '4 left', s: '8 days left', k: 'ok', open: 'Unopened', pack: 'Pack of 6' },
  { n: 'Eggs', q: '7 left', s: '9 days left', k: 'ok', open: 'Unopened', pack: 'Tray of 12' },
  { n: 'Butter', q: '100 g left', s: '11 days left', k: 'ok', open: 'Unopened', pack: '500 g pack' },
];

const head = (d) => `<span class="mark">${d.id === 'masala' ? 'FlatHub' : 'FlatHub'}</span>`;

// ---------------------------------------------------------------- screen parts
const hdrKitty = (d) => `<header class="hdr">
  ${head(d)}
  <span class="hdr-r"><span class="month">Oct 2026</span><span class="iconbtn">${svg('people', 19, 1.7)}</span></span>
</header>`;

const hdrFridge = () => `<header class="hdr hdr2">
  <span class="h1">Kitchen</span>
  <span class="hdr-r"><span class="iconbtn">${svg('people', 19, 1.7)}</span></span>
</header>`;

const seg = () => `<div class="seg" role="tablist"><span class="sg on">Fridge</span><span class="sg">Shopping</span><span class="sg">Stock</span></div>`;

const badge = (l) =>
  l.k === 'neg'
    ? `<span class="badge neg">${svg('alert', 12, 2)}${l.s}</span>`
    : l.k === 'warn'
    ? `<span class="badge warn">${svg('clock', 12, 2)}${l.s}</span>`
    : `<span class="badge plain">${l.s}</span>`;

const lotRow = (l) => `<div class="lot">
  <div class="lot-t"><span class="ln">${l.n}</span><span class="lq">${l.q}</span>${svg('chev', 14, 2.2)}</div>
  <div class="lot-m">${badge(l)}<span class="badge ghost">${l.open}</span><span class="lp">${l.pack}</span></div>
</div>`;

const kittyHero = () => `<div class="hero">${RS}23,650</div>
<div class="sub">You <b class="pos">+${RS}4,861.59</b> <span class="dot">·</span> the kitty owes you</div>`;

// ---------------------------------------------------------------- per-direction screens
const screens = {
  // ---- PAPER: iOS grouped lists -------------------------------------------
  paper: {
    kitty: () => `${hdrKitty(dirs[0])}
<section class="grp kcard">
  <div class="caprow"><span class="cap">In the kitty</span><span class="cap">Held by Ansh</span></div>
  ${kittyHero()}
</section>
<div class="ghd"><span class="hd">Quick add</span><span class="link">Edit</span></div>
<div class="grid">${QA.map(([n, a]) => `<span class="cell"><span class="cn">${n}</span>${amt(a, 'ca')}</span>`).join('')}</div>
<div class="ghd"><span class="hd">Recent</span><span class="link">See all</span></div>
<section class="grp">
  <div class="rrow"><span class="rn">Zepto<span class="rm">Ansh · today</span></span>${amt('1,284', 'ra')}${svg('chev', 14, 2.2)}</div>
  <div class="rrow"><span class="rn">Top-up<span class="rm">Adnan · 2 Oct</span></span>${amt('2,000', 'ra pos', '+')}${svg('chev', 14, 2.2)}</div>
  <div class="rrow"><span class="rn">Local kirana<span class="rm">Jatin · 1 Oct</span></span>${amt('465', 'ra')}${svg('chev', 14, 2.2)}</div>
</section>
<div class="tailpad"></div>`,
    fridge: () => `${hdrFridge()}
${seg()}
<p class="foot"><b class="negt">Loss ·</b> Paneer ${RS}120 written off this month.</p>
<div class="ghd"><span class="hd">In the fridge</span><span class="hdm">First expired, first out</span></div>
<section class="grp list">${LOTS.map(lotRow).join('')}</section>`,
  },

  // ---- MASALA: warm serif, chips, separate soft cards ----------------------
  masala: {
    kitty: () => `${hdrKitty(dirs[1])}
<section class="kcard">
  <div class="caprow"><span class="cap">In the kitty</span><span class="cap">Held by Ansh</span></div>
  ${kittyHero()}
  <div class="kfoot"><span>6 mates</span><span class="sep"></span><span>${RS}2,000 each</span><span class="sep"></span><span class="posq">4 topped up</span></div>
</section>
<div class="ghd"><span class="hd">Quick add</span><span class="link">Edit</span></div>
<div class="chips">${QA.map(([n, a]) => `<span class="qchip"><span class="cn">${n}</span>${amt(a, 'ca')}</span>`).join('')}</div>
<div class="ghd"><span class="hd">Recent</span><span class="link">See all</span></div>
<section class="softlist">
  <div class="rrow"><span class="rn">Zepto<span class="rm">Ansh · today</span></span>${amt('1,284', 'ra')}</div>
  <div class="rrow"><span class="rn">Top-up<span class="rm">Ayan · 2 Oct</span></span>${amt('2,000', 'ra pos', '+')}</div>
  <div class="rrow"><span class="rn">Local kirana<span class="rm">Sahid · 1 Oct</span></span>${amt('465', 'ra')}</div>
  <div class="rrow"><span class="rn">Gas cylinder<span class="rm">Ansh · 30 Sep</span></span>${amt('1,105', 'ra')}</div>
</section>
<div class="tailpad"></div>`,
    fridge: () => `${hdrFridge()}
${seg()}
<div class="lossnote"><span class="badge neg">${svg('alert', 12, 2)}Loss</span><span class="lnm">Paneer ${RS}120 written off this month</span></div>
<div class="ghd"><span class="hd">In the fridge</span><span class="hdm">First expired, first out</span></div>
<section class="cards">${LOTS.slice(0, 7).map(lotRow).join('')}</section>`,
  },

  // ---- GRAPHITE: no cards, dense, hairlines --------------------------------
  graphite: {
    kitty: () => `${hdrKitty(dirs[2])}
<section class="kcard">
  <span class="cap">In the kitty <span class="capm">· held by Ansh</span></span>
  ${kittyHero()}
  <div class="bar"><span class="bar-f"></span></div>
  <div class="barlab"><span>Spent ${RS}12,350</span><span>Left ${RS}23,650</span></div>
</section>
<div class="ghd"><span class="hd">Quick add</span><span class="link">Edit</span></div>
<div class="grid g3">${QA.map(([n, a]) => `<span class="cell"><span class="cn">${n}</span>${amt(a, 'ca')}</span>`).join('')}</div>
<div class="ghd"><span class="hd">Recent</span><span class="link">See all</span></div>
<section class="denselist">
  <div class="rrow"><span class="rn">Zepto<span class="rm">Ansh · today</span></span>${amt('1,284', 'ra')}</div>
  <div class="rrow"><span class="rn">Top-up<span class="rm">Adnan · 2 Oct</span></span>${amt('2,000', 'ra pos', '+')}</div>
  <div class="rrow"><span class="rn">Local kirana<span class="rm">Jatin · 1 Oct</span></span>${amt('465', 'ra')}</div>
  <div class="rrow"><span class="rn">Gas cylinder<span class="rm">Anant · 30 Sep</span></span>${amt('1,105', 'ra')}</div>
</section>
<div class="tailpad"></div>`,
    fridge: () => `${hdrFridge()}
${seg()}
<div class="lossnote"><span class="badge neg">${svg('alert', 12, 2)}Loss</span><span class="lnm">Paneer ${RS}120 written off this month</span></div>
<div class="ghd"><span class="hd">In the fridge</span><span class="hdm">First expired, first out</span></div>
<section class="list">${LOTS.map(lotRow).join('')}</section>`,
  },

  // ---- LEDGER: rules, dotted leaders, mono --------------------------------
  ledger: {
    kitty: () => `${hdrKitty(dirs[3])}
<section class="kcard">
  <div class="caprow"><span class="cap">In the kitty</span><span class="cap">Held by Ansh</span></div>
  ${kittyHero()}
</section>
<div class="ghd"><span class="hd">Quick add</span><span class="link">Edit</span></div>
<div class="tgrid">${QA.map(([n, a]) => `<span class="cell"><span class="cn">${n}</span>${amt(a, 'ca')}</span>`).join('')}<span class="cell blank"><span class="cn">+ Add one</span></span></div>
<div class="ghd"><span class="hd">Recent</span><span class="link">See all</span></div>
<section class="ruled">
  <div class="rrow"><span class="rn">Zepto</span><span class="lead"></span>${amt('1,284', 'ra')}</div>
  <div class="rrow"><span class="rn">Top-up <em>Adnan</em></span><span class="lead"></span>${amt('2,000', 'ra pos', '+')}</div>
  <div class="rrow"><span class="rn">Local kirana</span><span class="lead"></span>${amt('465', 'ra')}</div>
  <div class="rrow tot"><span class="rn">Total out, October</span><span class="lead"></span>${amt('12,350', 'ra')}</div>
</section>
<div class="tailpad"></div>`,
    fridge: () => `${hdrFridge()}
${seg()}
<div class="ghd"><span class="hd">Written off</span></div>
<section class="ruled">
  <div class="rrow"><span class="rn negt">Paneer · expired</span><span class="lead"></span>${amt('120', 'ra negt')}</div>
</section>
<div class="ghd"><span class="hd">In the fridge</span><span class="hdm">First expired, first out</span></div>
<section class="ruled list">${LOTS.map(lotRow).join('')}</section>`,
  },
};

const screen = (d, which, mode) =>
  `<div class="frame ph ${d.id} ${mode}">${statusbar}<div class="scr">${screens[d.id][which]()}</div>${navbar(
    which === 'kitty' ? 'Kitty' : 'Kitchen'
  )}</div>`;

/** The bar on its own, for the two-state motion strip. */
const plate = (d, mode, active) => `<div class="plate ph ${d.id} ${mode}">${navbar(active)}</div>`;

// ---------------------------------------------------------------- css
const modeVars = (id, m, t) => `.${id}.${m}{
--canvas:${t.canvas};--surface:${t.surface};--raised:${t.raised};--ink:${t.ink};--muted:${t.muted};
--accent:${t.accent};--onAccent:${t.onAccent};--hair:${t.hair};--border:${t.border};
--pos:${t.pos};--posBg:${t.posBg};--warn:${t.warn};--warnBg:${t.warnBg};--neg:${t.neg};--negBg:${t.negBg};
--podAct:${t.podAct};--podGrp:${t.podGrp};}`;

const base = (d) => `${modeVars(d.id, 'dark', d.dark)}
${modeVars(d.id, 'light', d.light)}
.${d.id}{--fui:${d.fonts.ui},system-ui,sans-serif;--fnum:${d.fonts.num},${d.fonts.ui},system-ui,sans-serif;--fmark:${d.fonts.mark},serif;
background:var(--canvas);color:var(--ink);font-family:var(--fui)}
.${d.id} .mark{font-family:var(--fmark);font-weight:${d.mark.weight};font-size:${d.mark.size}px;letter-spacing:${d.mark.spacing};text-transform:${d.mark.transform};color:${d.mark.accent ? 'var(--accent)' : 'var(--ink)'};line-height:1}`;

const perDir = {
  paper: `
.paper .scr{gap:12px}
.paper section.grp{background:var(--surface);border-radius:12px;margin:0 16px;overflow:hidden}
.paper .kcard{padding:13px 16px 15px}
.paper .ghd{padding:0 28px;margin:-6px 0 -10px}
.paper .hd{font-weight:600}
.paper .cap{font:500 12.5px/1.2 var(--fui);letter-spacing:0;text-transform:none}
.paper .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 16px}
.paper .cell{background:var(--surface);border-radius:12px;padding:9px 12px;display:flex;flex-direction:column;gap:1px;min-height:54px;justify-content:center}
.paper .rrow{display:flex;align-items:center;gap:10px;min-height:52px;padding:0 14px}
.paper .rrow + .rrow{box-shadow:inset 0 1px 0 var(--hair)}
.paper .lot{padding:9px 14px}
.paper .lot + .lot{box-shadow:inset 0 1px 0 var(--hair)}
.paper .seg{background:var(--raised);border:1px solid var(--hair);border-radius:9px;padding:2px;margin:0 16px}
.paper .sg{border-radius:7px;font-weight:500;color:var(--ink);min-height:44px}
.paper .sg.on{background:var(--canvas);font-weight:600}
.paper.light .seg{background:#E4E4EA;border-color:transparent}
.paper.light .sg.on{background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.16)}
.paper.dark .seg{background:#2A2A2E;border-color:transparent}
.paper.dark .sg.on{background:#4A4A50}
.paper .foot{padding:0 28px;margin-top:-2px;font:500 12.5px/1.45 var(--fui);color:var(--muted)}
.paper .negt{color:var(--neg);font-weight:700}
.paper .gi{color:var(--muted)}
`,
  masala: `
.masala .scr{gap:13px}
.masala .hd,.masala .h1,.masala .cap{font-family:var(--fmark);letter-spacing:0;text-transform:none}
.masala .h1{font-weight:400;font-size:28px}
.masala .hd{font-weight:400;font-size:17px;color:var(--ink)}
.masala .cap{font-weight:400;font-size:14px;color:var(--muted)}
.masala .kcard{background:var(--surface);border:1px solid var(--hair);border-radius:18px;margin:0 16px;padding:13px 16px 11px}
.masala .kfoot{display:flex;align-items:center;gap:8px;margin-top:11px;padding-top:9px;border-top:1px solid var(--hair);font:500 12.5px/1 var(--fui);color:var(--muted)}
.masala .sep{width:3px;height:3px;border-radius:2px;background:var(--border)}
.masala .posq{color:var(--pos);font-weight:600}
.masala .ghd{padding:0 18px;margin:-6px 0 -8px}
.masala .chips{display:flex;flex-wrap:wrap;gap:7px;margin:0 16px}
.masala .qchip{display:inline-flex;align-items:center;gap:7px;min-height:46px;padding:0 15px;border-radius:999px;background:var(--raised)}
.masala .qchip .cn{font-weight:600;font-size:15px}
.masala .qchip .ca{font-size:15px;font-weight:700;color:var(--ink)}
.masala .cards{display:flex;flex-direction:column;gap:8px;margin:0 16px}
.masala .cards .lot{background:var(--surface);border:1px solid var(--hair);border-radius:18px;padding:11px 15px}
.masala .softlist{margin:0 16px;background:var(--surface);border:1px solid var(--hair);border-radius:18px;padding:0 15px}
.masala .rrow{display:flex;align-items:center;gap:10px;min-height:52px}
.masala .rrow + .rrow{border-top:1px solid var(--hair)}
.masala .seg{margin:0 16px;gap:7px}
.masala .sg{border-radius:999px;border:1px solid var(--border);color:var(--ink);font-weight:500;min-height:46px}
.masala .sg.on{background:var(--accent);color:var(--onAccent);border-color:var(--accent);font-weight:600}
.masala .lossnote{display:flex;align-items:center;gap:9px;margin:0 16px;padding:11px 14px;border-radius:14px;background:var(--negBg)}
.masala .pod{border:1px solid var(--hair)}
.masala .pod.act{border-color:transparent}
`,
  graphite: `
.graphite .scr{gap:11px}
.graphite .kcard{padding:2px 16px 0}
.graphite .cap{font-size:11.5px}
.graphite .capm{color:var(--muted);font-weight:500;letter-spacing:0;text-transform:none}
.graphite .hero{margin-top:5px}
.graphite .bar{height:5px;border-radius:3px;background:var(--raised);overflow:hidden;margin-top:12px}
.graphite .bar-f{display:block;width:34%;height:100%;background:var(--accent);border-radius:3px}
.graphite .barlab{display:flex;justify-content:space-between;margin-top:6px;font:500 12px/1 var(--fui);color:var(--muted)}
.graphite .ghd{padding:0 16px;margin:-5px 0 -9px}
.graphite .grid{display:grid;gap:7px;margin:0 16px}
.graphite .g3{grid-template-columns:1fr 1fr 1fr}
.graphite .cell{background:var(--surface);border-radius:12px;padding:8px 10px;display:flex;flex-direction:column;gap:1px;min-height:50px;justify-content:center}
.graphite .cell .cn{font-size:13px;color:var(--muted);font-weight:500}
.graphite .cell .ca{font-size:16px}
.graphite .denselist{margin:0 16px}
.graphite .rrow{display:flex;align-items:center;gap:10px;min-height:46px}
.graphite .rrow + .rrow{border-top:1px solid var(--hair)}
.graphite .list{margin:0 16px}
.graphite .lot{padding:9px 0}
.graphite .lot + .lot{border-top:1px solid var(--hair)}
.graphite .seg{margin:0 16px;border-bottom:1px solid var(--hair)}
.graphite .sg{color:var(--muted);font-weight:500;min-height:44px;box-shadow:inset 0 -2px 0 transparent}
.graphite .sg.on{color:var(--ink);font-weight:600;box-shadow:inset 0 -2px 0 var(--accent)}
.graphite .lossnote{display:flex;align-items:center;gap:9px;margin:0 16px;padding:10px 12px;border-radius:12px;background:var(--negBg)}
.graphite .pod{border-radius:20px}
.graphite .pod.act{border-radius:20px}
.graphite .fab{border-radius:18px}
`,
  ledger: `
.ledger .scr{gap:12px}
.ledger .cap,.ledger .hd{font-family:var(--fnum);font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:700}
.ledger .hd{color:var(--muted)}
.ledger .hdm{font-family:var(--fnum);font-size:11px;letter-spacing:.04em}
.ledger .h1{font-weight:800;letter-spacing:-.03em}
.ledger .kcard{margin:0 16px;padding:11px 0 13px;border-top:2px solid var(--ink);border-bottom:1px solid var(--hair)}
.ledger .ghd{padding:0 16px;margin:-6px 0 -10px}
.ledger .tgrid{display:grid;grid-template-columns:1fr 1fr;margin:0 16px;border:1px solid var(--hair);border-radius:6px;overflow:hidden}
.ledger .tgrid .cell{padding:9px 12px;min-height:54px;display:flex;flex-direction:column;justify-content:center;gap:1px;box-shadow:inset 1px 1px 0 var(--hair)}
.ledger .tgrid .cell:nth-child(odd){box-shadow:inset 0 1px 0 var(--hair)}
.ledger .tgrid .cell:nth-child(1){box-shadow:none}
.ledger .tgrid .cell:nth-child(2){box-shadow:inset 1px 0 0 var(--hair)}
.ledger .tgrid .blank{min-height:54px}
.ledger .tgrid .blank .cn{color:var(--muted);font-weight:500}
.ledger .ruled{margin:0 16px;border-top:1px solid var(--ink)}
.ledger .rrow{display:flex;align-items:baseline;gap:8px;min-height:46px;padding:0;border-bottom:1px solid var(--hair)}
.ledger .rrow .rn{flex:0 0 auto;font-size:15px;font-weight:600}
.ledger .rrow .rn em{font-style:normal;font-weight:500;color:var(--muted)}
.ledger .lead{flex:1;border-bottom:1px dotted var(--border);transform:translateY(-3px);min-width:12px}
.ledger .rrow.tot{border-bottom:2px solid var(--ink)}
.ledger .rrow.tot .rn{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-weight:700}
.ledger .list .lot{padding:9px 0;border-bottom:1px solid var(--hair)}
.ledger .negt{color:var(--neg)}
.ledger .seg{margin:0 16px;border-bottom:2px solid var(--ink)}
.ledger .sg{color:var(--muted);font-weight:600;min-height:44px;font-size:13px;letter-spacing:.03em;box-shadow:inset 0 -3px 0 transparent}
.ledger .sg.on{color:var(--ink);box-shadow:inset 0 -3px 0 var(--ink)}
.ledger .badge{border-radius:3px;text-transform:uppercase;letter-spacing:.05em;font-size:10.5px}
.ledger .link{text-transform:uppercase;letter-spacing:.1em;font-size:11px;font-weight:700}
.ledger .pod,.ledger .fab{box-shadow:none;border:1.5px solid var(--hair);border-radius:8px}
.ledger .pod.act{border-color:var(--ink)}
.ledger .bdg{border-radius:6px}
.ledger .fab{border-color:var(--ink);border-width:2px;background:var(--canvas);color:var(--ink)}
.ledger .tl{text-transform:uppercase;letter-spacing:.08em;font-size:12px}
`,
};

// ---------------------------------------------------------------- contrast table
const pairs = (t) => [
  ['Body text on canvas', t.ink, t.canvas, 4.5],
  ['Secondary text on canvas', t.muted, t.canvas, 4.5],
  ['Accent text on canvas', t.accent, t.canvas, 4.5],
  ['Label on accent fill', t.onAccent, t.accent, 4.5],
  ['Positive on canvas', t.pos, t.canvas, 4.5],
  ['Warning on its chip', t.warn, t.warnBg, 4.5],
  ['Loss on its chip', t.neg, t.negBg, 4.5],
  ['Interactive border on canvas', t.border, t.canvas, 3],
  ['Secondary text on surface', t.muted, t.surface, 4.5],
  ['Interactive border on surface', t.border, t.surface, 3],
  ['Active tab label on its capsule', t.ink, t.podAct, 4.5],
  ['Inactive tab icon on its capsule', t.muted, t.podGrp, 3],
  ['Add glyph on the Add circle', t.canvas, t.ink, 3],
];
const ctable = (d) =>
  `<table class="ct"><thead><tr><th>Pair</th><th>Light</th><th>Dark</th><th>Min</th></tr></thead><tbody>${pairs(d.light)
    .map((p, i) => {
      const q = pairs(d.dark)[i];
      const cell = (v, min) => `<b class="${v >= min ? 'ok' : 'bad'}">${v.toFixed(2)}</b>`;
      return `<tr><td>${p[0]}</td><td>${cell(r2(p[1], p[2]), p[3])}</td><td>${cell(r2(q[1], q[2]), q[3])}</td><td class="min">${p[3].toFixed(1)}</td></tr>`;
    })
    .join('')}</tbody></table>`;

const swatches = (t, label) =>
  `<div class="sw"><span class="swl">${label}</span><div class="swr">${[
    ['canvas', t.canvas], ['surface', t.surface], ['ink', t.ink], ['muted', t.muted],
    ['accent', t.accent], ['positive', t.pos], ['warning', t.warn], ['loss', t.neg],
  ]
    .map(([n, h]) => `<span class="chip"><i style="background:${h}"></i><em>${n}</em><code>${h.toUpperCase()}</code></span>`)
    .join('')}</div></div>`;

const fig = (d, mode, which) =>
  `<figure class="fw">${screen(d, which, mode)}<figcaption>${mode === 'dark' ? 'Dark' : 'Light'} · ${
    which === 'kitty' ? 'Kitty' : 'Fridge'
  }</figcaption></figure>`;

const section = (d, i) => `
<section class="dir" id="${d.id}">
  <div class="wrap">
    <p class="num">Direction ${i + 1}${d.id === 'graphite' ? ' · dark-first' : ' · light-first'}</p>
    <h2>${d.name}</h2>
    <p class="one">${d.one}</p>
    <p class="notes">${d.notes}</p>
    ${swatches(d.light, 'Light')}
    ${swatches(d.dark, 'Dark')}
    ${ctable(d)}
    <h3 class="sub3">The floating bar, two states</h3>
    <div class="plates">
      <div class="pcol"><span class="pcap">Kitty active</span>${plate(d, 'light', 'Kitty')}${plate(d, 'dark', 'Kitty')}</div>
      <div class="pcol"><span class="pcap">Kitchen active</span>${plate(d, 'light', 'Kitchen')}${plate(d, 'dark', 'Kitchen')}</div>
    </div>
    <p class="mspec">${d.motion}</p>
    <p class="mspec glyph"><b>Four icon-only destinations.</b> ${d.glyphs}</p>
  </div>
  <div class="frames">${fig(d, 'light', 'kitty')}${fig(d, 'light', 'fridge')}${fig(d, 'dark', 'kitty')}${fig(d, 'dark', 'fridge')}</div>
</section>`;

const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>FlatHub — four directions</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Geist:wght@400;500;600;700;800&family=Instrument+Serif&family=JetBrains+Mono:wght@400;500;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--pg:#0E0E10;--pgi:#EAEAEE;--pgm:#9A9AA3;--pgl:#27272C}
@media (prefers-color-scheme:light){:root{--pg:#FAFAFA;--pgi:#15151A;--pgm:#5F5F68;--pgl:#E2E2E6}}
html{-webkit-text-size-adjust:100%}
body{background:var(--pg);color:var(--pgi);font:400 15px/1.5 'Inter',system-ui,sans-serif;padding-bottom:56px}
.wrap{max-width:1180px;margin:0 auto;padding:0 20px}
header.top{padding:26px 0 14px}
header.top h1{font-size:25px;font-weight:800;letter-spacing:-.025em}
header.top p{color:var(--pgm);max-width:68ch;margin-top:8px;font-size:13.5px}
.cost{border-left:2px solid var(--pgl);padding-left:14px}
.cost b{color:var(--pgi)}
nav.idx{position:sticky;top:0;z-index:9;background:var(--pg);border-bottom:1px solid var(--pgl)}
nav.idx .wrap{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;padding-top:9px;padding-bottom:9px}
nav.idx .wrap::-webkit-scrollbar{display:none}
nav.idx a{flex:0 0 auto;text-decoration:none;color:var(--pgi);border:1px solid var(--pgl);border-radius:999px;padding:0 15px;font-size:13px;font-weight:600;min-height:36px;display:flex;align-items:center}
nav.idx a.on{background:var(--pgi);color:var(--pg);border-color:var(--pgi)}
section.dir{padding:34px 0 6px;border-top:1px solid var(--pgl)}
section.dir:first-of-type{border-top:0}
.num{font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--pgm);font-weight:700}
section.dir h2{font-size:27px;font-weight:800;letter-spacing:-.025em;margin-top:5px}
.one{font-size:15px;margin-top:6px;max-width:70ch}
.notes{font-size:13.5px;color:var(--pgm);margin-top:8px;max-width:76ch}
.sw{display:flex;gap:10px;align-items:flex-start;margin-top:13px;flex-wrap:nowrap}
.swl{font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--pgm);width:40px;flex:0 0 40px;padding-top:7px}
.swr{display:flex;gap:6px;flex-wrap:wrap;min-width:0}
.chip{display:flex;align-items:center;gap:6px;border:1px solid var(--pgl);border-radius:8px;padding:4px 8px}
.chip i{width:13px;height:13px;border-radius:4px;box-shadow:inset 0 0 0 1px rgba(128,128,128,.4);display:block;flex:0 0 13px}
.chip em{font-style:normal;font-size:11.5px;color:var(--pgm)}
.chip code{font:500 11px/1 'JetBrains Mono',monospace;color:var(--pgi)}
.ct{margin-top:16px;border-collapse:collapse;font-size:12.5px;width:100%;max-width:520px}
.ct th,.ct td{text-align:left;padding:5px 12px 5px 0;border-bottom:1px solid var(--pgl)}
.ct th{font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--pgm)}
.ct b{font:600 12.5px/1 'JetBrains Mono',monospace}
.ct .ok{color:#38B472}.ct .bad{color:#E0523F}
.ct .min{color:var(--pgm);font:500 11.5px/1 'JetBrains Mono',monospace}
h3.sub3{font-size:13px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--pgm);margin-top:26px}
.plates{display:flex;flex-wrap:wrap;gap:18px;margin-top:12px}
.pcol{flex:1 1 390px;min-width:0;display:flex;flex-direction:column;gap:8px}
.pcap{font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--pgm);font-weight:700}
.plate{width:100%;max-width:420px;padding:14px;border-radius:18px;background:var(--canvas);box-shadow:0 0 0 1px rgba(130,130,140,.28)}
.plate .tabs{position:static}
.mspec{font-size:13px;line-height:1.6;color:var(--pgm);margin-top:14px;max-width:80ch}
.mspec b{color:var(--pgi);font-weight:600}
.mspec code{font:500 12px/1 'JetBrains Mono',monospace;color:var(--pgi)}
.mspec.glyph{margin-top:8px}
.frames{display:flex;flex-wrap:wrap;gap:20px;justify-content:center;margin-top:24px;max-width:820px;margin-left:auto;margin-right:auto}
.fw{flex:0 0 auto}
.fw figcaption{text-align:center;font-size:11.5px;color:var(--pgm);margin-top:7px;letter-spacing:.03em}
.frame{width:390px;height:844px;border-radius:38px;overflow:hidden;position:relative;display:flex;flex-direction:column;
box-shadow:0 0 0 1px rgba(130,130,140,.3),0 16px 36px rgba(0,0,0,.26)}
@media (max-width:440px){
 .wrap{padding:0 16px}
 .frames{gap:16px;margin-left:-16px;margin-right:-16px;max-width:none}
 .plates{margin-left:-16px;margin-right:-16px}
 .plate{border-radius:0;max-width:none}
 .frame{width:min(390px,100vw);border-radius:0;box-shadow:0 0 0 1px rgba(130,130,140,.28)}
 .ct td:first-child{white-space:normal}
}

/* ---------------- shared screen chrome ---------------- */
.frame .sb{height:44px;flex:0 0 44px;display:flex;align-items:center;justify-content:space-between;padding:0 20px 0 26px;color:var(--ink)}
.frame .sb-t{font:600 14px/1 var(--fui);letter-spacing:-.01em}
.frame .sb-r{display:flex;align-items:center;gap:5px}
.frame{position:relative}
/* The bar floats, so the list has to pass behind it and stop — not strand a half row in the gap
   beneath it. A short scrim dissolves the content into the canvas just before the bar's top edge. */
.frame::after{content:'';position:absolute;left:0;right:0;bottom:0;height:94px;z-index:1;pointer-events:none;
background:linear-gradient(to bottom,transparent,var(--canvas) 46%)}
.frame .scr{flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;padding-top:2px}
.frame .hdr{display:flex;align-items:center;justify-content:space-between;padding:0 16px 6px;min-height:48px}
.frame .hdr2{padding-bottom:10px}
.frame .hdr-r{display:flex;align-items:center;gap:10px}
.frame .month{font:600 11.5px/1 var(--fui);letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.frame .iconbtn{width:44px;height:44px;border-radius:999px;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:var(--ink);flex:0 0 44px}
.frame .h1{font:700 24px/1.1 var(--fui);letter-spacing:-.02em;color:var(--ink)}

.frame .caprow{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.frame .cap{font:700 11.5px/1.2 var(--fui);letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.frame .hero{font:800 68px/1.0 var(--fnum);font-variant-numeric:lining-nums tabular-nums;letter-spacing:-.04em;color:var(--ink);margin-top:9px;display:flex;align-items:flex-start}
.frame .hero .rs{font-size:.55em;line-height:1;margin:.12em .13em 0 0;letter-spacing:0}
.frame .sub{font:500 13.5px/1.35 var(--fui);color:var(--muted);margin-top:9px}
.frame .sub b{font-family:var(--fnum);font-weight:700;font-variant-numeric:lining-nums tabular-nums;letter-spacing:-.01em}
.frame .pos{color:var(--pos)}
.frame .dot{opacity:.65;padding:0 1px}
.frame .n{font-family:var(--fnum);font-variant-numeric:lining-nums tabular-nums;font-weight:700;letter-spacing:-.01em}
.frame .n .rs{font-size:.88em}

.frame .ghd{display:flex;justify-content:space-between;align-items:center;min-height:44px;gap:10px}
.frame .hd{font:600 12.5px/1.2 var(--fui);color:var(--muted)}
.frame .hdm{font:500 11.5px/1.2 var(--fui);color:var(--muted)}
.frame .link{font:600 12.5px/1.2 var(--fui);color:var(--accent);min-height:44px;display:inline-flex;align-items:center;padding-left:14px}
.frame .cn{font:600 15px/1.25 var(--fui);color:var(--ink)}
.frame .ca{font-size:17px;color:var(--ink)}

.frame .rn{font:600 15px/1.25 var(--fui);color:var(--ink);flex:1;display:flex;flex-direction:column;gap:1px;min-width:0}
.frame .rm{font:500 12px/1.2 var(--fui);color:var(--muted)}
.frame .ra{font-size:16px;color:var(--ink);flex:0 0 auto}
.frame .n.pos{color:var(--pos)}
.frame .n.negt{color:var(--neg)}
.frame .rrow svg{color:var(--muted);flex:0 0 auto}

.frame .seg{display:flex}
.frame .sg{flex:1;display:flex;align-items:center;justify-content:center;font-size:14px;font-family:var(--fui)}
.frame .lot-t{display:flex;align-items:center;gap:8px;min-height:24px}
.frame .ln{font:600 16px/1.25 var(--fui);color:var(--ink);flex:1}
.frame .lq{font-family:var(--fnum);font-variant-numeric:lining-nums tabular-nums;font-weight:700;font-size:15px;color:var(--ink);letter-spacing:-.01em}
.frame .lot-t svg{color:var(--muted);flex:0 0 auto}
.frame .lot-m{display:flex;align-items:center;gap:6px;margin-top:5px;flex-wrap:wrap}
.frame .badge{display:inline-flex;align-items:center;gap:4px;border-radius:7px;padding:2.5px 7px;font:600 11.5px/1.3 var(--fui)}
.frame .badge svg{flex:0 0 auto}
.frame .badge.warn{background:var(--warnBg);color:var(--warn)}
.frame .badge.neg{background:var(--negBg);color:var(--neg);box-shadow:inset 0 0 0 1px var(--neg)}
.frame .badge.ghost{color:var(--muted);box-shadow:inset 0 0 0 1px var(--border);background:transparent}
.frame .badge.plain{color:var(--muted);background:transparent;padding-left:0}
.frame .lp{font:500 12px/1.3 var(--fui);color:var(--muted)}
.frame .lnm{font:500 12px/1.35 var(--fui);color:var(--ink)}
/* The last row of a screen that ends naturally must clear the floating bar: 26 bottom + 56 bar + 14 breathing room. */
.frame .tailpad{flex:0 0 100px}
/* Nothing in a screen may shrink to fit: a squeezed row clips its own figures. Overflow runs
   under the floating bar instead, where the scrim absorbs it. */
.frame .scr > *{flex-shrink:0}

/* Floating two-capsule nav. Active tab is its own pill with the one label; the other three are
   icons in a second, darker capsule; Add is a separate circle outside both, so it can never look selected. */
.ph .tabs{display:flex;align-items:center;gap:6px;height:56px}
.frame .tabs{position:absolute;left:14px;right:14px;bottom:26px;z-index:2}
.ph .pod{height:56px;border-radius:28px;display:flex;align-items:center}
.ph .pod.act{flex:0 0 auto;gap:9px;padding:0 14px 0 8px;background:var(--podAct)}
.ph .bdg{width:40px;height:40px;flex:0 0 40px;border-radius:999px;background:var(--accent);color:var(--onAccent);display:flex;align-items:center;justify-content:center}
.ph .tl{font:700 14px/1 var(--fui);color:var(--ink);letter-spacing:-.01em;white-space:nowrap}
.ph .pod.grp{flex:1;min-width:0;padding:0 6px;background:var(--podGrp)}
.ph .gi{flex:1;min-width:0;height:48px;display:flex;align-items:center;justify-content:center;color:var(--muted)}
.ph .fab{width:50px;height:50px;flex:0 0 50px;border-radius:999px;display:flex;align-items:center;justify-content:center;background:var(--ink);color:var(--canvas)}
.ph.light .pod,.ph.light .fab{box-shadow:0 6px 18px rgba(0,0,0,.13)}
.ph.dark .pod,.ph.dark .fab{box-shadow:0 6px 20px rgba(0,0,0,.55)}

${dirs.map(base).join('\n')}
${Object.values(perDir).join('\n')}
</style></head>
<body>
<header class="top"><div class="wrap">
<h1>FlatHub — four visual directions</h1>
<p>The same two screens in each direction, light and dark, drawn at true phone size (390×844). The type scale is a notch below V2: hero 68 (was 80), figures 15–17, row titles 15–16, labels 12.5, captions 11.5. One accent per screen; every coloured state also carries a word, so it survives a colourblind reader and a black-and-white print. Contrast ratios below are computed, not eyeballed.</p>
<p class="cost"><b>The sample data is this flat's.</b> Six mates &mdash; Sahid, Ansh, Adnan, Anant, Ayan and Jatin &mdash; at &#8377;2,000 each a month, with Ansh Rastogi holding the kitty. No invented flatmates, no invented shops: Zepto and the local kirana are the two places this flat actually buys from.</p>
<p class="cost"><b>The cost of the floating bar, stated plainly.</b> Only the active tab carries a label, so four of the five things in the bar are glyphs with no words &mdash; six flatmates have to learn a wallet, a fridge, a checklist and a chart. Add is the exception: it sits outside both capsules as its own circle, because it opens the spend sheet and must never look selected. Each direction says below how it keeps its four glyphs apart at 24&nbsp;pt.</p>
</div></header>
<nav class="idx"><div class="wrap">${dirs.map((d) => `<a href="#${d.id}">${d.name}</a>`).join('')}</div></nav>
${dirs.map(section).join('')}
<script>
var links=[].slice.call(document.querySelectorAll('nav.idx a'));
var obs=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){links.forEach(function(a){a.classList.toggle('on',a.getAttribute('href')==='#'+e.target.id)})}})},{rootMargin:'-15% 0px -75% 0px'});
document.querySelectorAll('section.dir').forEach(function(s){obs.observe(s)});
</script>
</body></html>`;

const target = '/Users/sahidalam/Developer/Personal/POS/FlatHub/docs/design/directions.html';
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, html);
console.log('wrote', target, html.length, 'bytes');
let bad = 0;
dirs.forEach((d) =>
  ['light', 'dark'].forEach((m) =>
    pairs(d[m]).forEach((p) => {
      const v = r2(p[1], p[2]);
      if (v < p[3]) (bad++, console.log('FAIL', d.name, m, p[0], v, '<', p[3]));
    })
  )
);
console.log(bad ? bad + ' contrast failures' : 'all contrast pairs pass');
