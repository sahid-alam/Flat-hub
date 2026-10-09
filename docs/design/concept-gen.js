// Generates docs/design/concept.html — the V3 concept screens, drawn to be corrected.
// Round 2: the thirteen corrections in docs/V3_BRIEF.md "Round 2 — after reviewing the concept".
// Architecture copied from gen.js (true-size 390×844 frames, floating capsule nav, computed
// contrast table). gen.js and directions.html are not touched.
// Run: node concept-gen.js
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------- contrast (from gen.js)
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

// ---------------------------------------------------------------- the placeholder palettes
// Derived from ref-4: light, warm, soft cards — plus the dark twin he asked for in round 2.
// NOT a chosen palette. DESIGN.md's rules still apply: one accent per screen, every state
// carries a word. Every hex below is measured in the contrast table at the top of the page.
const L = {
  canvas: '#F6F3EE', surface: '#FFFFFF', raised: '#EDE8DF', sunk: '#E3DCCF',
  ink: '#1A1714', muted: '#5E574C',
  accent: '#C9A45C', onAccent: '#1A1714', accentText: '#7A5C22',
  hair: '#E4DED2', border: '#8A8275',
  pos: '#1F7A4D', posBg: '#E4F1E8',
  warn: '#6B4E12', warnBg: '#F6EBD6',
  neg: '#A83421', negBg: '#F8E3DE',
  podAct: '#FFFFFF', podGrp: '#EAE4D9',
  // derived, not measured as text pairs
  alertEdge: '#E3D2AE', foldLine: '#B9AF9B', foldText: '#7E7360', foldBg: 'rgba(246,243,238,.62)',
  coverA: '#E8D8B4', coverB: '#CBB789',
  grid0: 'rgba(26,23,20,.13)', grid1: 'rgba(26,23,20,.5)', grid2: '#1A1714',
  bar2: 'rgba(26,23,20,.45)', bar3: 'rgba(26,23,20,.2)',
  hatch: 'rgba(138,130,117,.07)', mineBg: 'rgba(138,130,117,.08)',
  scrim: 'rgba(26,23,20,.5)', lift: 'rgba(70,58,38,.16)',
  // page chrome
  pg: '#FAF8F4', pgi: '#17150F', pgm: '#60594D', pgl: '#E3DDD1', pgc: '#FFFFFF',
  askBg: '#FFF7E4', askEdge: '#E8D6A8', recBg: '#EAF4EC', recEdge: '#BFDCC7', recInk: '#14603A',
  ok: '#15733F', bad: '#C02717',
};
const D = {
  canvas: '#15130F', surface: '#221F19', raised: '#2C2821', sunk: '#38332B',
  ink: '#F2EDE3', muted: '#ACA394',
  accent: '#C9A45C', onAccent: '#15130F', accentText: '#DCBE80',
  hair: '#302C25', border: '#857C6C',
  pos: '#7FCB9F', posBg: '#17291E',
  warn: '#E6C184', warnBg: '#2D2616',
  neg: '#F0998A', negBg: '#2F1B16',
  podAct: '#302C25', podGrp: '#1E1B16',
  alertEdge: '#4A3F27', foldLine: '#5B5345', foldText: '#9A907E', foldBg: 'rgba(21,19,15,.62)',
  coverA: '#4A3F2A', coverB: '#6B5A3C',
  grid0: 'rgba(242,237,227,.14)', grid1: 'rgba(242,237,227,.5)', grid2: '#F2EDE3',
  bar2: 'rgba(242,237,227,.45)', bar3: 'rgba(242,237,227,.2)',
  hatch: 'rgba(172,163,148,.09)', mineBg: 'rgba(172,163,148,.07)',
  scrim: 'rgba(5,4,3,.64)', lift: 'rgba(0,0,0,.5)',
  pg: '#121110', pgi: '#F0EBE2', pgm: '#A49B8C', pgl: '#2E2A24', pgc: '#1C1A16',
  askBg: '#2A2316', askEdge: '#4C4128', recBg: '#16271C', recEdge: '#2E4A38', recInk: '#8FD5AC',
  ok: '#64C88E', bad: '#F08273',
};

// ---------------------------------------------------------------- icons (inline stroke SVG only)
const ic = {
  home: '<path d="M4 10.5 12 4l8 6.5"/><path d="M6 9.6V19a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9.6"/><path d="M10 20v-5h4v5"/>',
  wallet: '<path d="M3 8.5A2.5 2.5 0 0 1 5.5 6H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5.5A2.5 2.5 0 0 1 3 16.5Z"/><path d="M3 8.5V7a2 2 0 0 1 2-2h10"/><circle cx="16" cy="12.5" r="1.2"/>',
  fridge: '<rect x="6" y="3" width="12" height="18" rx="2.5"/><path d="M6 10h12"/><path d="M9 6.5v2"/><path d="M9 12.5v2.5"/>',
  plus: '<path d="M12 6v12"/><path d="M6 12h12"/>',
  duties: '<path d="M4 7l2 2 3.5-3.5"/><path d="M4 17l2 2 3.5-3.5"/><path d="M13 7.5h7"/><path d="M13 17.5h7"/>',
  spend: '<path d="M4 16.5 9 11l3.5 3.5L20 6.5"/><path d="M15 6.5h5v5"/>',
  person: '<circle cx="12" cy="8" r="3.4"/><path d="M5 19.5a7 7 0 0 1 14 0"/>',
  chev: '<path d="M9 5l6 6-6 6"/>',
  back: '<path d="M15 5 9 11l6 6"/>',
  alert: '<path d="M12 4.5 21 19.5H3Z"/><path d="M12 10v4"/><path d="M12 16.6v.1"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  arrow: '<circle cx="12" cy="12" r="9"/><path d="M9.5 12h5"/><path d="M12.5 9.5 15 12l-2.5 2.5"/>',
  camera: '<path d="M4 8.5h3l1.3-2h7.4L17 8.5h3a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="3.3"/>',
  image: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="8.5" cy="10" r="1.6"/><path d="m4.5 17 4.6-4.4L13 16l2.6-2.4L20 17.5"/>',
  cart: '<path d="M3 5h2.2l2.3 10.2a1.6 1.6 0 0 0 1.6 1.3h7.6a1.6 1.6 0 0 0 1.6-1.2L20 8H6"/><circle cx="9.5" cy="20" r="1.2"/><circle cx="17" cy="20" r="1.2"/>',
  bowl: '<path d="M3.5 11h17a8.5 8.5 0 0 1-8.5 8.5A8.5 8.5 0 0 1 3.5 11Z"/><path d="M9 7.5c0-1.4 1.3-1.6 1.3-3M13 7.8c0-1.6 1.4-1.8 1.4-3.3"/>',
  grab: '<path d="M5 8.5h14"/><path d="M5 12h14"/><path d="M5 15.5h14"/>',
  minus: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12h7"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  x: '<path d="M6 6l12 12"/><path d="M18 6 6 18"/>',
  offer: '<path d="M12 19V5"/><path d="m7.5 9.5 4.5-4.5 4.5 4.5"/><path d="M4.5 19h15"/>',
  bell: '<path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5S6.5 14 6.5 10Z"/><path d="M10 18.5a2.2 2.2 0 0 0 4 0"/>',
  share: '<circle cx="17.5" cy="6" r="2.5"/><circle cx="6.5" cy="12" r="2.5"/><circle cx="17.5" cy="18" r="2.5"/><path d="m8.8 10.8 6.4-3.5M8.8 13.2l6.4 3.5"/>',
  store: '<path d="M4 9.5 5.5 5h13L20 9.5"/><path d="M4 9.5a2.2 2.2 0 0 0 4 0 2.2 2.2 0 0 0 4 0 2.2 2.2 0 0 0 4 0 2.2 2.2 0 0 0 4 0"/><path d="M5.5 11.5V19h13v-7.5"/>',
  spark: '<path d="M12 3.5 13.6 9l5.4 1.6-5.4 1.7L12 17.8l-1.6-5.5L5 10.6 10.4 9Z"/><path d="M18.5 16.2l.6 2 2 .6-2 .7-.6 2-.7-2-2-.7 2-.6Z"/>',
  pot: '<path d="M4.5 9h15v5.5a5 5 0 0 1-5 5h-5a5 5 0 0 1-5-5Z"/><path d="M3 9h18"/><path d="M19.5 11h1.8a1.4 1.4 0 0 1 0 2.8h-1.8"/><path d="M9 6c0-1.3 1.2-1.5 1.2-2.8M14 6c0-1.3 1.2-1.5 1.2-2.8"/>',
  barcode: '<path d="M4 6v12"/><path d="M7 6v12"/><path d="M10.5 6v12"/><path d="M14 6v12"/><path d="M17 6v12"/><path d="M20 6v12"/>',
  door: '<path d="M14.5 3.5H6a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h8.5"/><path d="M11 12h9"/><path d="m17 9 3 3-3 3"/>',
  guest: '<circle cx="9.5" cy="8.5" r="3.2"/><path d="M3.5 19.5a6 6 0 0 1 12 0"/><path d="M18.5 7.5v6"/><path d="M15.5 10.5h6"/>',
  away: '<path d="M3.5 13.5 20 7.5l-2 5.5-2.5 7-2.5-5.5-5.5-2.5"/><path d="m13 12.5 3.5-3.5"/>',
  receipt: '<path d="M5.5 3.5h13v17l-2.2-1.5-2.2 1.5-2.1-1.5L9.9 20.5 7.7 19l-2.2 1.5Z"/><path d="M9 8h6"/><path d="M9 12h6"/>',
  calendar: '<rect x="3.5" y="5.5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17"/><path d="M8 3.5v4M16 3.5v4"/>',
};
const svg = (n, size = 22, sw = 1.7) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ic[n]}</svg>`;

const RS = '<span class="rs">₹</span>';
const amt = (s, cls = '', sign = '') => `<span class="n ${cls}">${sign}${RS}${s}</span>`;

const statusbar = `<div class="sb"><span class="sb-t">9:41</span><span class="sb-r">
<svg viewBox="0 0 17 12" width="16" height="11" fill="currentColor" aria-hidden="true"><rect x="0" y="7" width="2.6" height="5" rx=".9"/><rect x="4" y="5" width="2.6" height="7" rx=".9"/><rect x="8" y="2.5" width="2.6" height="9.5" rx=".9"/><rect x="12" y="0" width="2.6" height="12" rx=".9"/></svg>
<svg viewBox="0 0 26 13" width="23" height="12" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true"><rect x=".5" y=".5" width="21" height="12" rx="3.5"/><rect x="2" y="2" width="16" height="9" rx="2" fill="currentColor" stroke="none"/><path d="M23.6 4.6v3.8" stroke-linecap="round" stroke-width="1.7"/></svg>
</span></div>`;

// ---------------------------------------------------------------- the approved floating nav
// Active tab is its own pill with a filled icon badge and its label; the other destinations are
// bare icons in a second capsule; Add is a separate circle outside both. Approved — not redesigned.
// R6: Kitchen's slot is now the Fridge, which is its own destination rather than a group.
const DEST = [['home', 'Home'], ['fridge', 'Fridge'], ['duties', 'Duties'], ['spend', 'Spending']];
const navbar = (active) => {
  const act = DEST.find((d) => d[1] === active) || DEST[0];
  const rest = DEST.filter((d) => d[1] !== act[1]);
  return `<nav class="tabs" aria-label="Main">
  <span class="pod act" aria-current="page"><span class="bdg">${svg(act[0], 21, 1.9)}</span><span class="tl">${act[1]}</span></span>
  <span class="pod grp">${rest.map((d) => `<span class="gi" aria-label="${d[1]}">${svg(d[0], 24, 1.8)}</span>`).join('')}</span>
  <span class="fab" aria-label="Add">${svg('plus', 24, 2.2)}</span>
</nav>`;
};

// ---------------------------------------------------------------- the flat (never invented)
// Sahid, Ansh, Adnan, Anant, Ayan, Jatin. Ansh Rastogi is treasurer. ₹2,000 each per month.
// Everything is drawn as Wednesday 7 October 2026, so the figures hold together:
//   carried over ₹5,750 + four top-ups ₹8,000 − spent ₹2,350 = ₹11,400 in the kitty.
//   9 entries so far, 7 days in → ≈₹336 a day.
//   Ansh owes back ₹340 (Sahid, water cans) + ₹1,110 (Anant, gas + cans) = ₹1,450.
const MATES = ['Adnan', 'Anant', 'Ansh', 'Ayan', 'Jatin', 'Sahid']; // alphabetical, always
const TOPPED = { Adnan: 1, Anant: 0, Ansh: 1, Ayan: 1, Jatin: 0, Sahid: 1 };

const avatars = () =>
  `<div class="avs">${MATES.map(
    (m) =>
      `<span class="av"><span class="avw"><span class="avi">${m[0]}${m[1].toLowerCase()}</span><span class="avb ${
        TOPPED[m] ? 'yes' : 'no'
      }">${TOPPED[m] ? '✓' : '○'}</span></span><em>${m}</em></span>`
  ).join('')}</div>
<p class="avleg">✓ topped up &nbsp;·&nbsp; ○ not yet &nbsp;·&nbsp; alphabetical, no amounts</p>`;

// ---------------------------------------------------------------- small parts
const hdrHome = (name, initial) => `<header class="hdr">
  <span class="hdrl"><span class="dateline">Wed, 7 October</span><span class="greet">Good morning,<br>${name}</span></span>
  <span class="avbtn" aria-label="Your profile">${initial}</span>
</header>`;

const hdrPlain = (title, right = '', backFirst = false) =>
  backFirst
    ? `<header class="hdr hdr2 back"><span class="iconbtn">${svg('back', 19, 1.9)}</span><span class="h1">${title}</span>${
        right ? `<span class="hdr-r">${right}</span>` : ''
      }</header>`
    : `<header class="hdr hdr2"><span class="h1">${title}</span><span class="hdr-r">${right}</span></header>`;

const sect = (label, right = '', link = false) =>
  `<div class="ghd"><span class="hd">${label}</span>${
    right ? `<span class="${link ? 'link' : 'hdm'}">${right}</span>` : ''
  }</div>`;

const alertCard = (title, sub, action) => `<section class="alertc">
  <span class="ai">${svg('alert', 19, 1.9)}</span>
  <span class="at"><b>${title}</b><em>${sub}</em></span>
  <span class="apill">${action}</span>
</section>`;

// R4: the big card is the summary now. The kitty is a tile.
const summaryCard = (lines) => `<section class="card sumc">
  <p class="sumh"><span class="sumi">${svg('spark', 16, 1.8)}</span>Your morning</p>
  ${lines.map((l) => `<p class="suml">${l}</p>`).join('')}
  <p class="sumf">Written fresh each morning from what the app already knows. It never names anyone else's miss, and it never ranks the six of you.</p>
</section>`;

const tile = (cap, big, sub, cls = '') =>
  `<span class="tile ${cls}"><span class="tcap">${cap}</span><span class="tbig">${big}</span><span class="tsub">${sub}</span></span>`;
const tiles3 = (a, b, c) => `<div class="tiles3">${a}${b}${c}</div>`;
const tiles2 = (a, b) => `<div class="tiles2">${a}${b}</div>`;

/**
 * states
 *   mine     your turn, a live tick
 *   theirs   someone else's turn — an inert ring, never a tap that gets rejected
 *   done     ticked, plus the Vouch pill anyone else can press, plus Photo
 *   missed   past its due date with no Done. COMPUTED, never recorded: nothing is appended
 *            to the ledger for a non-action, and it earns no credit, exactly as before.
 *            Stated as a fact in muted ink — no clay, nothing that reads as an error.
 *   offered  the assignee has offered it. Open to all five; anyone can Take it.
 *   claimed  somebody took it, and it is now theirs to tick.
 */
const dutyRow = (name, pts, who, state, when, extra = '') => {
  const tick =
    state === 'mine' || state === 'claimed'
      ? `<span class="tick live" role="button" aria-label="Tick ${name} done"></span>`
      : state === 'done'
      ? `<span class="tick done">${svg('check', 15, 2.6)}</span>`
      : state === 'missed'
      ? `<span class="tick missed" aria-hidden="true"></span>`
      : state === 'offered'
      ? `<span class="tick offerd">${svg('offer', 15, 2)}</span>`
      : `<span class="tick inert" aria-hidden="true"></span>`;
  const tail =
    state === 'mine'
      ? `<em class="who you">Your turn</em>`
      : state === 'claimed'
      ? `<em class="who you">Your turn now</em>`
      : state === 'done'
      ? `<em class="who">${who}'s turn · done</em><span class="vouch">Vouch</span>`
      : state === 'missed'
      ? `<em class="who">${who}'s turn</em><span class="wordchip">Missed</span>`
      : state === 'offered'
      ? `<span class="takeit">Take it</span>`
      : `<em class="who">${who}'s turn</em>`;
  const pt = `${pts} ${pts === 1 ? 'point' : 'points'}`;
  const sublabel =
    state === 'offered'
      ? `${pt} · ${who} offered it${when ? `, ${when}` : ''}`
      : state === 'claimed'
      ? `${pt} · you took it from ${who}`
      : pt;
  return `<div class="drow"><span class="dgut"></span>${tick}<span class="dn">${name}<span class="dpt">${sublabel}</span></span>${tail}</div>${extra}`;
};

// R2: both people do it together, the same day, and each ticks their OWN row.
const pairDuty = (name, pts, rows) => `<div class="pairblk">
  <p class="pairhd">${name}<span class="pairm">${pts} ${
  pts === 1 ? 'point' : 'points'
} each &nbsp;·&nbsp; today's pair, together</span></p>
  ${rows}
</div>`;
const pairRow = (who, state) => {
  const tick =
    state === 'done'
      ? `<span class="tick done">${svg('check', 15, 2.6)}</span>`
      : `<span class="tick live" role="button"></span>`;
  const tail =
    state === 'done'
      ? `<em class="who">done</em><span class="vouch">Vouch</span>`
      : `<em class="who you">Your turn</em>`;
  return `<div class="prow">${tick}<span class="pn">${who}</span>${tail}</div>`;
};

const photoChip = (label) =>
  `<div class="photorow"><span class="pthumb">${svg('image', 18, 1.6)}</span><span class="ptn">${label}</span></div>`;

const lot = (n, q, s, kind, meta) => `<div class="lot">
  <div class="lot-t"><span class="ln">${n}</span><span class="lq">${q}</span></div>
  <div class="lot-m"><span class="badge ${kind}">${
  kind === 'neg' ? svg('alert', 12, 2) : kind === 'warn' ? svg('clock', 12, 2) : ''
}${s}</span><span class="lp">${meta}</span></div>
</div>`;

const chipRow = (items, cls = '') =>
  `<div class="chiprow ${cls}">${items
    .map(([l, on]) => `<span class="chip2${on ? ' on' : ''}">${on ? svg('check', 14, 2.6) : ''}${l}</span>`)
    .join('')}</div>`;

const field = (label, value, icon = '') =>
  `<label class="flab">${label}</label><div class="field">${value}${
    icon ? `<span class="fico">${icon}</span>` : ''
  }</div>`;

const toggleRow = (label, sub, on) => `<div class="swrow">
  <span class="swt">${label}<em>${sub}</em></span><span class="sw ${on ? 'on' : ''}"><i></i></span>
</div>`;

// ================================================================= SCREENS
const S = {};

// ---- 1. HOME, signed in as Sahid --------------------------------------------
const todayDuties = (mine) => `<section class="card list">
  ${pairDuty(
    'Dishes',
    2,
    pairRow('Adnan', 'done') + pairRow(mine ? 'You' : 'Sahid', mine ? 'mine' : 'theirs')
  )}
  ${dutyRow('Kitchen floor', 1, 'Ayan', 'done')}
  ${dutyRow('Bins', 1, 'Jatin', 'theirs')}
  <div class="exp"><span class="eico">${svg('fridge', 17, 1.8)}</span><span class="en">Amul Taaza 1 L</span><span class="badge warn">${svg(
  'clock',
  12,
  2
)}Use today</span></div>
  <div class="exp"><span class="eico">${svg('fridge', 17, 1.8)}</span><span class="en">Dahi 400 g</span><span class="badge plain">2 days left</span></div>
</section>`;

S.homeSahid = () => `${hdrHome('Sahid', 'Sa')}
${alertCard('₹340 to get back from Ansh', 'Water cans, 3 Oct · paid from your own pocket', 'Statement')}
${summaryCard([
  'You and <b>Adnan</b> have the dishes today, so the two of you also tell the cook what to make.',
  'The <b>milk needs using</b> — 200 ml, today.',
  'At ₹336 a day the kitty lasts about <b>twelve more days</b>, which covers the month.',
])}
${tiles3(
  tile('In the kitty', `${RS}11,400`, 'held by Ansh', 'fill'),
  tile('Your position', `+${RS}340`, 'to get back'),
  tile('Duty points', '412', 'this month')
)}
${sect('Lunch and dinner', 'You and Adnan')}
<section class="card pad mealc">
  <p class="mealq">What's the plan today?</p>
  <div class="mealf"><span class="mealk">Lunch</span><span class="mealv ph">Tap to write it</span></div>
  <div class="mealf"><span class="mealk">Dinner</span><span class="mealv ph">Tap to write it</span></div>
  <p class="mealn">The cook reads this. Anything the kitchen is missing goes straight onto the shopping list.</p>
</section>
${sect('Today in the flat')}
${todayDuties(true)}
${sect('Quick add', 'Edit', true)}
<div class="qrow">
  <span class="qchip"><b>Milk</b>${amt('60')}</span>
  <span class="qchip"><b>Atta</b>${amt('320')}</span>
  <span class="qchip"><b>Eggs</b>${amt('90')}</span>
  <span class="qchip more">More</span>
</div>
${sect('Recent', 'See all', true)}
<section class="card">
  <div class="rrow"><span class="rn">Blinkit<span class="rm">Ansh · today · pool</span></span>${amt('1,284', 'ra')}${svg('chev', 14, 2.2)}</div>
  <div class="rrow"><span class="rn">Water cans<span class="rm">You · 3 Oct · own pocket · pending</span></span>${amt('340', 'ra')}${svg('chev', 14, 2.2)}</div>
  <div class="rrow"><span class="rn">Top-up<span class="rm">Adnan · 2 Oct</span></span>${amt('2,000', 'ra pos', '+')}${svg('chev', 14, 2.2)}</div>
  <div class="rrow"><span class="rn">Local kirana<span class="rm">Jatin · 1 Oct · pool</span></span>${amt('465', 'ra')}${svg('chev', 14, 2.2)}</div>
</section>
<div class="tailpad"></div>`;

// ---- 2. HOME, signed in as Ansh (treasurer) ---------------------------------
S.homeAnsh = () => `${hdrHome('Ansh', 'An')}
${alertCard('₹1,450 to pay back to 2 mates', 'Sahid ₹340 · Anant ₹1,110', 'Pay back')}
${summaryCard([
  '<b>Two mates</b> still have to top up this month, and you are holding ₹11,400.',
  'Nothing of yours is due today — <b>Sahid and Adnan</b> have the dishes.',
  'Yesterday <b>one duty went undone</b>. It is on the Duties tab if you want it.',
])}
${tiles3(
  tile('In the kitty', `${RS}11,400`, 'you hold it', 'fill'),
  tile('Your position', 'Settled', 'nothing either way'),
  tile('Duty points', '388', 'this month')
)}
${sect('Top-ups this month', 'Record one', true)}
<section class="card pad">
  <p class="bigline"><b class="n">4</b> of 6 in &nbsp;<span class="dot">·</span>&nbsp; <span class="mut">₹8,000 of ₹12,000</span></p>
  ${avatars()}
</section>
${sect("Today's meals", 'Sahid and Adnan')}
<section class="card pad mealc">
  <div class="mealf"><span class="mealk">Lunch</span><span class="mealv">Dal chawal, bhindi</span></div>
  <div class="mealf"><span class="mealk">Dinner</span><span class="mealv ph">Not said yet</span></div>
  <p class="mealn">Read-only for you. Only the two on dishes write it.</p>
</section>
${sect('Today in the flat')}
${todayDuties(false)}
${sect('Quick add', 'Edit', true)}
<div class="qrow">
  <span class="qchip"><b>Milk</b>${amt('60')}</span>
  <span class="qchip"><b>Atta</b>${amt('320')}</span>
  <span class="qchip"><b>Eggs</b>${amt('90')}</span>
  <span class="qchip more">More</span>
</div>
${sect('Recent', 'See all', true)}
<section class="card">
  <div class="rrow"><span class="rn">Blinkit<span class="rm">You · today · pool</span></span>${amt('1,284', 'ra')}${svg('chev', 14, 2.2)}</div>
  <div class="rrow"><span class="rn">Water cans<span class="rm">Sahid · 3 Oct · own pocket · pending</span></span>${amt('340', 'ra')}${svg('chev', 14, 2.2)}</div>
  <div class="rrow"><span class="rn">Top-up<span class="rm">Adnan · 2 Oct</span></span>${amt('2,000', 'ra pos', '+')}${svg('chev', 14, 2.2)}</div>
</section>
<div class="tailpad"></div>`;

// ---- 3. PROFILE --------------------------------------------------------------
S.profile = () => `<div class="cover"><span class="covbadge">${svg('camera', 17, 1.8)}</span></div>
<section class="phead">
  <span class="pav">Sa<span class="pavbadge">${svg('camera', 13, 1.9)}</span></span>
  <span class="pname">Sahid</span>
  <span class="phandle">@sahid</span>
  <div class="pstats"><span><b class="n">Mar 2025</b><em>joined</em></span><span class="pvr"></span><span><b class="n">412</b><em>duty points</em></span></div>
  <span class="outpill">Edit profile</span>
</section>
${sect('How you get paid back')}
<section class="card">
  <div class="rrow"><span class="rn">UPI ID<span class="rm n">sahid@okhdfcbank</span></span><span class="link">Edit</span>${svg('chev', 14, 2.2)}</div>
</section>
<p class="why">Ansh pays you back here. It is the only reason this field exists.</p>
${sect('Yours')}
<section class="card">
  <div class="rrow"><span class="rn">Notifications<span class="rm">Screen not drawn — still being researched</span></span>${svg('chev', 14, 2.2)}</div>
  <div class="rrow"><span class="rn">Away dates<span class="rm">Moved here from the flat sheet</span></span>${svg('chev', 14, 2.2)}</div>
  <div class="rrow"><span class="rn">Favourites for Quick add<span class="rm">Moved here from the flat sheet</span></span>${svg('chev', 14, 2.2)}</div>
  <div class="rrow"><span class="rn">Sign out</span>${svg('chev', 14, 2.2)}</div>
</section>
${sect('Stays with the flat, not with you')}
<section class="card ghostcard">
  <p class="gcl">Mates, guests and who's treasurer</p>
  <p class="gcl">The monthly top-up (₹2,000)</p>
  <p class="gcl">Close the month</p>
  <p class="gcl">Reimbursements — Ansh only</p>
  <p class="gcn">Four rows, one screen, reached from the kitty tile on Home. The old <b>/flat</b> sheet mixed these with your UPI ID, which is why you couldn't find it.</p>
</section>
<div class="tailpad"></div>`;

// ---- 4. FRIDGE — its own destination (R6) ------------------------------------
S.fridge = () => `${hdrPlain('Fridge')}
<section class="card shopcard">
  <span class="sci">${svg('cart', 22, 1.8)}</span>
  <span class="scn">Shopping list<em>5 to buy · 2 already ticked</em></span>
  <span class="scb">${svg('chev', 16, 2.2)}</span>
</section>
<p class="grouphd">Flat &nbsp;<span class="gm">bought with the kitty · first expired, first out</span></p>
<section class="card list">
  ${lot('Amul Taaza 1 L', '200 ml left', 'Use today', 'warn', 'opened · 1 L pack')}
  ${lot('Dahi', '350 g left', '2 days left', 'plain', 'opened · 400 g pack')}
  ${lot('Tomatoes', '1.1 kg left', '4 days left', 'plain', 'unopened · 2 kg pack')}
  ${lot('Eggs', '7 left', '9 days left', 'plain', 'unopened · tray of 12')}
</section>
<p class="grouphd">Personal &nbsp;<span class="gm">that person's own spend · never the kitty</span></p>
<section class="card list own">
  <div class="ownrow"><span class="ownav">Ay</span><div class="ownb"><span class="ln">Dairy Milk 150 g</span><span class="lp">Ayan's · he paid ₹90 · not shared</span></div></div>
  <div class="ownrow"><span class="ownav">An</span><div class="ownb"><span class="ln">Red Bull ×2</span><span class="lp">Anant's · he paid ₹250 · not shared</span></div></div>
</section>
<p class="grouphd">Leftovers &nbsp;<span class="gm">cooked here · eat these first</span></p>
<section class="card list lefto">
  <div class="lrow"><span class="lico">${svg('bowl', 20, 1.8)}</span><div class="ownb"><span class="ln">Rajma</span><span class="lp">Ayan put it in, Mon night</span></div><span class="badge warn">${svg(
  'clock',
  12,
  2
)}Eat tonight</span></div>
  <div class="lrow"><span class="lico">${svg('bowl', 20, 1.8)}</span><div class="ownb"><span class="ln">Rice</span><span class="lp">Jatin put it in, Tue</span></div><span class="badge plain">Tomorrow</span></div>
</section>
${sect('Staples')}
<section class="card">
  <div class="rrow"><span class="rn">Atta, rice, dal, chai<span class="rm">4 tracked · Stock lives here, not in a tab</span></span>${svg('chev', 14, 2.2)}</div>
  <div class="rrow"><span class="rn">Add a product<span class="rm">Scan the barcode or type it</span></span>${svg('chev', 14, 2.2)}</div>
</section>
<p class="why"><b>Loss ·</b> Paneer ₹120 written off this month.</p>
<div class="tailpad"></div>`;

// ---- 5. SHOPPING LIST — its own screen now -----------------------------------
S.shopping = () => `${hdrPlain('Shopping list', '', true)}
<div class="addbar"><span class="addf">Add something…</span><span class="addb">${svg('plus', 20, 2.2)}</span></div>
<div class="shoprow"><span class="minipill">${svg('share', 15, 1.8)}Send to WhatsApp</span><span class="minipill">${svg(
  'store',
  15,
  1.8
)}Open in Blinkit</span></div>
${sect("From tonight's meal plan", 'Sahid and Adnan')}
<section class="card list">
  <div class="ckrow"><span class="ck"></span><span class="ckn">Rajma 500 g<em>Dinner needs it · added by the meal plan</em></span></div>
  <div class="ckrow"><span class="ck"></span><span class="ckn">Ginger<em>Dinner needs it · added by the meal plan</em></span></div>
</section>
${sect('Asked for')}
<section class="card list">
  <div class="ckrow"><span class="ck"></span><span class="ckn">Amul Taaza ×2<em>Sahid, this morning</em></span></div>
  <div class="ckrow"><span class="ck"></span><span class="ckn">Dish soap<em>Ayan, yesterday</em></span></div>
  <div class="ckrow"><span class="ck"></span><span class="ckn">20 L water can<em>Jatin, Mon</em></span></div>
  <div class="ckrow done"><span class="ck on">${svg('check', 13, 2.8)}</span><span class="ckn">Onions 1 kg<em>ticked off by Ansh, today</em></span></div>
  <div class="ckrow done"><span class="ck on">${svg('check', 13, 2.8)}</span><span class="ckn">Bread<em>ticked off by Ansh, today</em></span></div>
</section>
<p class="why">Four doors reach this screen: the card at the top of the Fridge, <b>Add to the list</b> in the + sheet, the line in your morning summary, and the meal plan when it finds something the kitchen hasn't got.</p>
<div class="tailpad"></div>`;

// ---- 6. MEALS (R11) ----------------------------------------------------------
S.meals = () => `${hdrPlain("Today's meals", '', true)}
<section class="card pad">
  <p class="mealwho"><span class="mealwi">${svg('pot', 18, 1.8)}</span><span>You and <b>Adnan</b> are on dishes today, so the two of you tell the cook.</span></p>
</section>
${sect('Lunch')}
<section class="card pad">
  <div class="field tall">Dal chawal, bhindi</div>
</section>
${sect('Dinner')}
<section class="card pad">
  <div class="field tall ph">What's for dinner?</div>
</section>
${sect("What the kitchen hasn't got")}
<section class="card list">
  <div class="ckrow"><span class="ck on">${svg('check', 13, 2.8)}</span><span class="ckn">Rajma 500 g<em>not in the fridge or the staples</em></span></div>
  <div class="ckrow"><span class="ck on">${svg('check', 13, 2.8)}</span><span class="ckn">Ginger<em>not in the fridge or the staples</em></span></div>
</section>
<span class="brasspill wide">Add 2 things to the shopping list</span>
<p class="why">Either of you can write it, and the last one to write wins — this is a note to the cook, not a ledger. It shows on all six home screens the moment it's saved.</p>
<div class="tailpad"></div>`;

// ---- 7. DUTIES, today --------------------------------------------------------
const DAYS = [['Mon', 5], ['Tue', 6], ['Wed', 7], ['Thu', 8], ['Fri', 9], ['Sat', 10]];
S.duties = () => `${hdrPlain('Duties', `<span class="iconbtn">${svg('grab', 19, 1.8)}</span>`)}
<div class="strip">${DAYS.map(
  ([d, n]) => `<span class="day${n === 7 ? ' on' : ''}"><b class="n">${n}</b><em>${d}</em></span>`
).join('')}</div>
<p class="todayline">Today <span class="mut">· 3 duties · 9-day streak, every duty done</span></p>
<section class="card list">
  ${pairDuty('Dishes', 2, pairRow('Adnan', 'done') + pairRow('You', 'mine'))}
  ${dutyRow(
    'Kitchen floor',
    1,
    'Ayan',
    'done',
    '',
    photoChip('1 photo · added by Anant, 10 minutes ago')
  )}
  ${dutyRow('Bins', 1, 'Jatin', 'theirs')}
</section>
<p class="why"><b>Two people, together, on the same day.</b> One duty, one block, two rows — Adnan has ticked his, yours is still open. Each of you earns the points separately, each of you can be missed separately, and your partner is the obvious person to vouch for you.</p>
<p class="why"><b>A photo hangs off the duty, not off the person.</b> Anyone can add one, the row just says how many and who. There is no "report", no flag and no red: it is a record of what the floor looked like, and the conversation still happens in the kitchen.</p>
${sect('Swipe left on your own row')}
<div class="swipewrap">
  <div class="swipepanels" aria-hidden="true"><span class="sp offer">${svg('offer', 18, 1.9)}Offer</span></div>
  <div class="card list swiped">${dutyRow('Bins', 1, 'Sahid', 'mine')}</div>
</div>
<p class="why"><b>One panel, not two.</b> Offer is the only swipe action and it carries its word. Tapping the row open shows the same Offer as a button, plus <b>Add a photo</b> — a swipe is never the only way in.</p>
${sect('Offered · anyone can take it')}
<section class="card list">
  ${dutyRow('Bins', 1, 'Ansh', 'offered', 'due Thu 8 Oct')}
  ${dutyRow('Kitchen floor', 1, 'Anant', 'claimed', 'Thu 8 Oct')}
</section>
<p class="why">Offering does not hand the duty to anyone. It opens it, and it stays open and visible to all six until somebody taps <b>Take it</b>. Nobody is volunteered. On a two-person duty you offer <i>your half</i>, not both.</p>
<p class="why"><b>If nobody takes it by Thursday it is missed, like any other duty.</b> An open offer protects nobody — which is the thing that stops Offer becoming the old one-tap way out.</p>
${sect('Yesterday · Tue 6 Oct')}
<section class="card list">
  ${dutyRow('Bins', 1, 'Ansh', 'missed')}
</section>
<p class="why"><b>Missed is worked out, not recorded.</b> A duty past its due date with no Done is missed. Nothing is written to the ledger for something nobody did, and it earns no credit — the same as before. Grey, a single word, no icon, no colour, no running tally beside anyone's name.</p>
${tiles2(
  tile('Your duty points', '412', 'this month'),
  tile('Flat streak', '9', 'days all duties done')
)}
<div class="tailpad"></div>`;

// ---- 8. MANAGE — the list first (R1) -----------------------------------------
const manageRow = (name, meta) =>
  `<div class="rrow"><span class="rn">${name}<span class="rm">${meta}</span></span>${svg('chev', 14, 2.2)}</div>`;
S.manageList = () => `${hdrPlain('Duties', `<span class="iconbtn">${svg('x', 19, 1.9)}</span>`, true)}
<span class="brasspill wide">${svg('plus', 19, 2.2)}&nbsp;Add a duty</span>
${sect('The flat runs four', 'tap one to edit it')}
<section class="card">
  ${manageRow('Dishes', 'Every day · 2 points each · 2 people together · plans the meals')}
  ${manageRow('Kitchen floor', 'Every 2 days · 1 point · one person')}
  ${manageRow('Bins', 'Every day · 1 point · one person')}
  ${manageRow('Balcony', 'Weekly, Sunday · 2 points · one person')}
</section>
<p class="why"><b>The list comes first now.</b> Before, Manage opened on an empty Add form, which is the rarest thing you do here — you add a duty roughly never and edit one every few weeks.</p>
${sect('Retired')}
<section class="card">
  ${manageRow('Water cans', 'Stopped 12 Sep · its old rows stay in the ledger')}
</section>
<p class="why">A duty is retired, never deleted, because deleting one would rewrite history that the points were already earned from.</p>
<div class="tailpad"></div>`;

// ---- 9. EDIT / ADD A DUTY — the reworked form (R1 + R2 + R11) ----------------
S.editDuty = () => `${hdrPlain('Edit duty', `<span class="link">Save</span>`, true)}
<section class="card pad form">
  ${field('Name', 'Dishes')}
</section>
${sect('When, and what it is worth')}
<section class="card pad form">
  <label class="flab">How often</label>
  ${chipRow([['Every day', true], ['Weekdays', false], ['Every 2 days', false], ['Weekly', false]])}
  <label class="flab">Points, per person, per turn</label>
  ${chipRow([['1', false], ['2', true], ['3', false], ['Other', false]])}
</section>
${sect('Who does it')}
<section class="card pad form">
  <label class="flab">How many at once</label>
  ${chipRow([['1', false], ['2', true], ['3', false]])}
  <p class="fhint">Two people do this duty <b>together, on the same day</b>. They are not taking turns.</p>
  <label class="flab">Who's in</label>
  ${chipRow(
    [['Adnan', true], ['Anant', true], ['Ansh', true], ['Ayan', true], ['Jatin', true], ['Sahid', true]],
    'who'
  )}
  <div class="preview">
    <p class="pvh">So the rota comes out like this</p>
    <p class="pvr2"><b>Wed</b> Adnan + Sahid</p>
    <p class="pvr2"><b>Thu</b> Ansh + Ayan</p>
    <p class="pvr2"><b>Fri</b> Anant + Jatin</p>
    <p class="pvn">Then it starts again. Six people, two at a time.</p>
  </div>
</section>
${sect('What else it carries')}
<section class="card">
  ${toggleRow(
    'Plans the meals',
    "Whoever is on this duty tells the cook what to make, and gets asked on their home screen.",
    true
  )}
  ${toggleRow('Photos allowed', 'Anyone can attach a photo to a turn.', true)}
</section>
${sect('The rota', 'Edit', true)}
<section class="card list editing">
  ${[['Adnan', 'Sahid'], ['Ansh', 'Ayan'], ['Anant', 'Jatin']]
    .map(
      ([a, b]) =>
        `<div class="erow"><span class="eminus">${svg('minus', 20, 1.8)}</span><span class="emate">${a} + ${b}</span><span class="ehandle">${svg(
          'grab',
          20,
          1.8
        )}</span></div>`
    )
    .join('')}
</section>
<p class="why">"I can't have Monday because of college, I can do Tuesday" — drag your pair down one row. That is a permanent change and it lives here. An <b>Offer</b> is one instance, once, and lives on the Duties tab.</p>
<span class="outpill wide danger">Retire this duty</span>
<div class="tailpad"></div>`;

// ---- 10. SPENDING ------------------------------------------------------------
const BARS = [
  ['24', 0], ['25', 410], ['26', 180], ['27', 0], ['28', 620], ['29', 95], ['30', 1105],
  ['1', 465], ['2', 0], ['3', 340], ['4', 0], ['5', 120], ['6', 141], ['7', 1284],
];
const DOTS_SEP = [0,1,0,2,1,0,0, 1,0,2,0,1,1,0, 0,2,1,0,0,1,2, 1,0,0,1,2,0,1, 0,1,0,0,0,0,0];
const DOTS_OCT = [2,0,1,0,1,1,2, 0,0,0,0,0,0,0, 0,0,0,0,0,0,0, 0,0,0,0,0,0,0, 0,0,0,0,0,0,0];
const dotgrid = (name, arr, upto) =>
  `<div class="dgwrap"><span class="dgname">${name}</span><div class="dg">${arr
    .map((v, i) => `<i class="d${i >= upto ? 'x' : v}"></i>`)
    .join('')}</div></div>`;

S.spending = () => `${hdrPlain('Spending')}
<div class="chiprow periods">${[['Week', false], ['Month', true], ['Year', false], ['All', false]]
  .map(([l, on]) => `<span class="chip2${on ? ' on' : ''}">${l}</span>`)
  .join('')}</div>
<div class="tiles4">
  ${tile('Spent this month', `${RS}2,350`, 'October so far', 'fill')}
  ${tile('Left in the kitty', `${RS}11,400`, 'held by Ansh')}
  ${tile('Entries', '9', 'this month')}
  ${tile('Avg per day', `${RS}336`, 'over 7 days')}
</div>
<p class="why">Exactly one tile is filled — the one you picked. Tapping another fills it and redraws the chart. That is the fill's reason, and it keeps the one-accent rule without a second thought.</p>
<div class="ghd"><span class="hd">By day</span><span class="hdm">last 14 days</span></div>
<section class="card pad chartc">
  <div class="chart">
    <div class="bars">${BARS.map(
      ([d, v], i) =>
        `<span class="barcol"><span class="bar${i === BARS.length - 1 ? ' now' : ''}" style="height:${Math.max(
          1.5,
          Math.round((v / 1300) * 100)
        )}%"></span><em>${i % 2 === 0 || i === BARS.length - 1 ? d : ''}</em></span>`
    ).join('')}</div>
    <div class="yscale"><span>1,300</span><span>650</span><span>0</span></div>
  </div>
</section>
<p class="why">Bars cross the month boundary on purpose — 30 Sep is the gas cylinder. <b>ref-2's trend curve is not here, deliberately.</b> It has no axis and no units — it is decoration over the bars. A bare bar chart with a right-hand scale and today bolded reads better. If a trend must exist later it gets its own card, with real dots and a date axis.</p>
${sect('Days this flat spent nothing')}
<section class="card pad">
  <div class="dgs">${dotgrid('Sep', DOTS_SEP, 30)}${dotgrid('Oct', DOTS_OCT, 7)}</div>
  <p class="dgleg"><i class="d0"></i>no spend &nbsp; <i class="d1"></i>1 spend &nbsp; <i class="d2"></i>2 or more &nbsp; <i class="dx"></i>not yet</p>
</section>
${sect('Where it went · by store')}
<section class="card pad">
  <div class="segbar"><span style="width:55%"></span><span style="width:25%"></span><span style="width:20%"></span></div>
  <div class="seglegs"><span><i class="l1"></i>Blinkit ${RS}1,284</span><span><i class="l2"></i>Kirana ${RS}585</span><span><i class="l3"></i>Zepto ${RS}481</span></div>
</section>
<p class="why"><b>By store, not by category.</b> The audit found the category chart is a single bar labelled "Other" in every month, forever, because nothing in the app can set a category. Store is recorded on every spend already, so this one is true today.</p>
<p class="why"><b>ref-5's progress ring is not here either.</b> A ring says "% of a goal". The kitty has no goal, it has a balance. The one place it would have earned its keep — top-ups, 4 of 6 — is two lines of text on Ansh's home, and reads better as initials.</p>
<div class="tailpad"></div>`;

// ---- 11. IMPORT — no store grid (R3), receipt kept (R9) ----------------------
const LINES = [
  ['Amul Taaza 1 L ×2', '128', 'flat'],
  ['Atta 5 kg', '320', 'flat'],
  ['Dahi 400 g', '52', 'flat'],
  ['Onions 1 kg', '50', 'flat'],
  ['Tomatoes 1 kg', '40', 'flat'],
  ['Eggs, tray of 12', '90', 'flat'],
  ['Delivery fee', '20', 'fee'],
  ["Lay's ×4", '200', 'mine'],
  ['Coke 750 ml ×2', '280', 'mine'],
];
S.importx = () => `${hdrPlain('Add an order', `<span class="iconbtn">${svg('x', 19, 1.9)}</span>`)}
<p class="why">One action, not two. "Import a Zepto order" and "photo of the bill" were the same thing wearing two names — the reader is the same reader either way.</p>
<section class="picker">
  <span class="pkic">${svg('image', 26, 1.6)}${svg('camera', 26, 1.6)}</span>
  <b>Screenshot or photo</b>
  <em>Pick the order screenshot, or take a photo of a paper bill.</em>
</section>
<section class="card detected">
  <span class="dti">${svg('store', 20, 1.8)}</span>
  <span class="dtn">Blinkit &nbsp;·&nbsp; 7 Oct &nbsp;·&nbsp; ${RS}1,180<em>read off the bill · tap to change</em></span>
  ${svg('chev', 14, 2.2)}
</section>
${sect('Check the lines')}
<section class="card list lines">
  ${LINES.map(
    ([n, a, k]) => `<div class="lrow2 ${k}">
    <span class="l2n">${n}${k === 'fee' ? '<em>Fee</em>' : k === 'mine' ? "<em>Ayan's own spend · out of the kitty</em>" : ''}</span>
    ${amt(a, 'ra')}
    <span class="tog ${k === 'mine' ? 'on' : ''}"><i>Flat</i><i>Mine</i></span>
  </div>`
  ).join('')}
</section>
<section class="balance">
  <span class="bn">Adds up</span>
  <span class="bl">Flat ${RS}700 &nbsp;+&nbsp; Ayan's own ${RS}480 &nbsp;=&nbsp; bill ${RS}1,180</span>
</section>
<section class="card keepr">
  <span class="pthumb big">${svg('receipt', 22, 1.6)}</span>
  <span class="krn">The bill is kept<em>It shows on the statement row, so "₹1,180? what was that?" has an answer.</em></span>
  <span class="sw on"><i></i></span>
</section>
<span class="brasspill wide">Save ₹700 to the kitty</span>
<p class="why">The 11pm case from the audit: Ayan's chips and Coke are on the flat's bill. "Mine" drops the line from the kitty <i>and</i> from the total, so the app still agrees with his bank statement.</p>
<div class="tailpad"></div>`;

// ---- 12. ADD A PRODUCT, with the barcode (R10) -------------------------------
S.addProduct = () => `${hdrPlain('Add a product', `<span class="iconbtn">${svg('x', 19, 1.9)}</span>`, true)}
<section class="scanbox">
  <span class="scanic">${svg('barcode', 34, 1.7)}</span>
  <b>Scan the barcode</b>
  <em>Point the camera at the pack and the name, size and brand fill themselves in.</em>
</section>
<p class="orline"><span>or type it</span></p>
<section class="card pad form">
  ${field('Name', 'Amul Taaza toned milk')}
  ${field('Usual price', '₹60')}
  <label class="flab">Pack size</label>
  ${chipRow([['500 ml', false], ['1 L', true], ['2 L', false], ['Other', false]])}
  <label class="flab">Where it lives</label>
  ${chipRow([['Fridge', true], ['Staples', false], ['Neither', false]])}
  <span class="brasspill">Add it</span>
</section>
<p class="why"><b>This one has a condition on it.</b> A barcode is only worth scanning if something can tell us what the number means, and whether that data exists for the packs this flat actually buys — Amul, Aashirvaad, a loose 20 L can — is still being tested. If the hit rate is poor, the scan button goes and the typing stays.</p>
<div class="tailpad"></div>`;

// ---- 13. MOVING OUT (R12) ----------------------------------------------------
S.movingOut = () => `${hdrPlain('Jatin is moving out', '', true)}
${sect('Last day in the flat')}
<section class="card pad form">
  <div class="field">20 October 2026${`<span class="fico">${svg('calendar', 18, 1.8)}</span>`}</div>
  <p class="fhint">From the 21st he stops counting as a mate, and the rest of you split the kitty six ways minus one.</p>
</section>
${sect('What he gets back, frozen at the 20th')}
<section class="card pad">
  <div class="setl"><span>He put in</span><b class="n">${RS}2,000</b></div>
  <div class="setl"><span>Days here</span><b class="n">20 of 31</b></div>
  <div class="setl"><span>His share of what the flat spent</span><b class="n">${RS}1,540</b></div>
  <div class="setl tot"><span>Jatin gets back</span><b class="n pos">${RS}460</b></div>
</section>
<p class="why">Ansh pays it to <b>jatin@okaxis</b>, the UPI ID on Jatin's own profile. The figure freezes the moment you confirm, so a spend logged on the 22nd cannot move it.</p>
<span class="brasspill wide">Confirm and freeze ₹460</span>
<p class="why">Reversible until it's paid: unconfirm and he counts as a mate again. The same screen runs in reverse when a seventh person joins mid-month.</p>
<div class="tailpad"></div>`;

// ---- 14/15. AWAY and GUESTS --------------------------------------------------
S.away = () => `${hdrPlain('Away', '', true)}
<section class="card pad awayc">
  <span class="awayi">${svg('away', 22, 1.8)}</span>
  <p class="awayt">Tell the flat you're not eating here, and <b>your share pauses</b> for those days.</p>
</section>
${sect('New absence')}
<section class="card pad form">
  ${field('Who', 'You — Sahid')}
  ${field('From', '18 October 2026', svg('calendar', 18, 1.8))}
  ${field('To', '23 October 2026', svg('calendar', 18, 1.8))}
  <p class="fhint">6 nights. Your share of October drops by roughly ₹310.</p>
  <span class="brasspill">Log the absence</span>
</section>
${sect('Logged')}
<section class="card">
  <div class="rrow"><span class="rn">Jatin<span class="rm">2–5 Oct · 4 nights</span></span>${svg('chev', 14, 2.2)}</div>
</section>
<div class="tailpad"></div>`;

S.guests = () => `${hdrPlain('Guests', '', true)}
<section class="card pad awayc">
  <span class="awayi">${svg('guest', 22, 1.8)}</span>
  <p class="awayt">The mirror of Away. Each guest-night adds <b>one person-day to the host's share</b> — nobody else pays for your visitor.</p>
</section>
${sect('New guest')}
<section class="card pad form">
  <label class="flab">Whose guest</label>
  ${chipRow(
    [['Adnan', true], ['Anant', false], ['Ansh', false], ['Ayan', false], ['Jatin', false], ['Sahid', false]],
    'who'
  )}
  ${field('From', '11 October 2026', svg('calendar', 18, 1.8))}
  ${field('To', '15 October 2026', svg('calendar', 18, 1.8))}
  ${field('Who is it (optional)', 'my cousin')}
  <p class="fhint">4 nights. Adnan's share of October goes up by roughly ₹210. Everyone else's is untouched.</p>
  <span class="brasspill">Log the guest</span>
</section>
<p class="why">A guest is an absence with the sign flipped, so it runs through exactly the same month-close guard — you cannot log a guest into a month that is already closed.</p>
<div class="tailpad"></div>`;

// ---- 16/17. THE + SHEET (R5) -------------------------------------------------
const sheetHomeTop = () => `<div class="dimmed">${hdrHome('Sahid', 'Sa')}
${alertCard('₹340 to get back from Ansh', 'Water cans, 3 Oct · paid from your own pocket', 'Statement')}
${summaryCard([
  'You and <b>Adnan</b> have the dishes today, so the two of you also tell the cook what to make.',
])}</div>`;

const sheetTiles = (role) => `<div class="stiles">
  <span class="stile"><span class="sti">${svg('wallet', 24, 1.8)}</span>Log a spend</span>
  <span class="stile"><span class="sti">${svg('image', 24, 1.8)}</span>Import an order</span>
  <span class="stile"><span class="sti">${svg('arrow', 24, 1.8)}</span>${
  role === 'ansh' ? 'Record a top-up' : 'Pay Ansh ₹2,000'
}</span>
  <span class="stile"><span class="sti">${svg('cart', 24, 1.8)}</span>Add to the list</span>
</div>`;

S.sheet = () => `${sheetHomeTop()}
<div class="scrim"></div>
<section class="sheet withorigin">
  <span class="grabh"></span>
  <div class="sheadr"><b>Add</b><span class="sx">${svg('x', 18, 2)}</span></div>
  ${sheetTiles('sahid')}
  <p class="snote">Every tile is labelled. Four fits; six is the ceiling.</p>
</section>
<span class="originmark"><i></i><b>grows from here</b></span>`;

S.sheetB = () => `${sheetHomeTop()}
<div class="scrim"></div>
<section class="sheet">
  <span class="grabh"></span>
  <div class="sheadr"><b>Add</b><span class="sx">${svg('x', 18, 2)}</span></div>
  ${sheetTiles('sahid')}
  <p class="sdiv">Go to</p>
  <div class="card">
    <div class="rrow"><span class="rn">The kitty<span class="rm">Ledger, statements, close the month</span></span>${svg('chev', 14, 2.2)}</div>
    <div class="rrow"><span class="rn">Your profile<span class="rm">UPI ID, photo, notifications</span></span>${svg('chev', 14, 2.2)}</div>
  </div>
  <p class="snote warnnote">Option B. Two destinations parked inside an action menu — which is what makes it the weaker of the two.</p>
</section>`;

// ---- 18/19. EMPTY STATES -----------------------------------------------------
const emptyBowl = `<svg viewBox="0 0 120 120" width="108" height="108" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="M14 54h92a46 46 0 0 1-46 46 46 46 0 0 1-46-46Z"/><path d="M6 54h108"/><path d="M40 40c0-8 8-9 8-17M60 38c0-9 9-10 9-19M80 41c0-8 8-9 8-16"/></svg>`;
const emptyWallet = `<svg viewBox="0 0 120 120" width="108" height="108" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="M16 46c0-7 6-13 13-13h62v49a12 12 0 0 1-12 12H29a13 13 0 0 1-13-13Z"/><path d="M16 46 86 25"/><circle cx="78" cy="66" r="5"/><path d="M30 86h22"/></svg>`;

S.emptyFridge = () => `${hdrPlain('Fridge')}
<section class="card shopcard">
  <span class="sci">${svg('cart', 22, 1.8)}</span>
  <span class="scn">Shopping list<em>5 to buy · 2 already ticked</em></span>
  <span class="scb">${svg('chev', 16, 2.2)}</span>
</section>
<div class="empty"><span class="eart">${emptyBowl}</span>
<b>The fridge is empty.</b>
<em>Put away a Blinkit order and the lots show up here.</em>
<span class="brasspill">Import an order</span></div>`;

S.emptyReimburse = () => `${hdrPlain('To pay back', '', true)}
<div class="empty"><span class="eart">${emptyWallet}</span>
<b>Nobody's out of pocket.</b>
<em>When a mate pays from their own pocket, it lands here for you to pay back.</em>
<span class="nobtn">No button on purpose — good news is not a task.</span></div>`;

// ================================================================= frame wrapper
const frame = (which, { tall = false, nav = null, cap = '' } = {}) => {
  const body = S[which]();
  return `<figure class="fw">
  <div class="frame ph${tall ? ' tall' : ''}${nav ? ' hasnav' : ''}">${statusbar}<div class="scr">${body}</div>${
    nav ? navbar(nav) : ''
  }${tall ? '<span class="fold"><b>fold · 844pt — a scroll starts here</b></span>' : ''}</div>
  ${cap ? `<figcaption>${cap}</figcaption>` : ''}
</figure>`;
};

const plate = (active, cap) =>
  `<div class="pcol"><span class="pcap">${cap}</span><div class="plate ph">${navbar(active)}</div></div>`;

// ================================================================= contrast table
const PAIRS = [
  ['Body text on canvas', 'ink', 'canvas', 4.5],
  ['Secondary text on canvas', 'muted', 'canvas', 4.5],
  ['Accent as text on canvas', 'accentText', 'canvas', 4.5],
  ['Ink on the brass fill', 'onAccent', 'accent', 4.5],
  ['Body text on a card', 'ink', 'surface', 4.5],
  ['Secondary text on a card', 'muted', 'surface', 4.5],
  ['Secondary text on a raised chip', 'muted', 'raised', 4.5],
  ['"Get back" green on a card', 'pos', 'surface', 4.5],
  ['"Missed" on its neutral chip', 'muted', 'raised', 4.5],
  ['"Take it" label on its pill', 'canvas', 'ink', 4.5],
  ['Alert text on its warm bar', 'warn', 'warnBg', 4.5],
  ['Loss clay on its chip', 'neg', 'negBg', 4.5],
  ['Interactive border on canvas', 'border', 'canvas', 3],
  ['Interactive border on a card', 'border', 'surface', 3],
  ['Active tab label on its capsule', 'ink', 'podAct', 4.5],
  ['Inactive tab icon on its capsule', 'muted', 'podGrp', 3],
  ['Add glyph on the Add circle', 'canvas', 'ink', 3],
  ['Page body text', 'pgi', 'pg', 4.5],
  ['Page secondary text', 'pgm', 'pg', 4.5],
];
const ctable = () =>
  `<table class="ct"><thead><tr><th>Pair</th><th>Light</th><th>Dark</th><th>Min</th></tr></thead><tbody>${PAIRS.map(
    ([name, a, b, min]) => {
      const cell = (t) => {
        const v = r2(t[a], t[b]);
        return `<b class="${v >= min ? 'ok' : 'bad'}">${v.toFixed(2)}</b>`;
      };
      return `<tr><td>${name}</td><td>${cell(L)}</td><td>${cell(D)}</td><td class="min">${min.toFixed(1)}</td></tr>`;
    }
  ).join('')}</tbody></table>`;

// ================================================================= page sections
const sec = (id, n, title, lede, notes, frames) => `
<section class="blk" id="${id}">
  <div class="colL">
    <p class="num">${n}</p>
    <h2>${title}</h2>
    <p class="one">${lede}</p>
    ${notes}
  </div>
  <div class="colR">${frames}</div>
</section>`;

const chg = (quote, body) => `<div class="chg"><p class="q">“${quote}”</p><p class="b">${body}</p></div>`;
const r2note = (title, body) => `<div class="chg r2"><p class="q">Round 2 · ${title}</p><p class="b">${body}</p></div>`;
const ask = (body) => `<div class="ask"><b>Needs your yes</b>${body}</div>`;

// ================================================================= css vars
const vars = (t) =>
  Object.entries(t)
    .map(([k, v]) => `--${k}:${v}`)
    .join(';');

const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>FlatHub V3 — the concept screens</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Righteous&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{${vars(L)};
--fui:'Manrope',system-ui,sans-serif;--fnum:'Bricolage Grotesque','Manrope',system-ui,sans-serif;--fmark:'Righteous',system-ui,sans-serif;}
@media (prefers-color-scheme:dark){:root:not([data-mode="light"]){${vars(D)}}}
:root[data-mode="dark"]{${vars(D)}}
html{-webkit-text-size-adjust:100%}
body{background:var(--pg);color:var(--pgi);font:400 15px/1.55 var(--fui);padding-bottom:70px}
.wrap{max-width:1240px;margin:0 auto;padding:0 22px}
a{color:inherit}

/* ---------------- page chrome ---------------- */
header.top{padding:30px 0 16px}
header.top .mk{font-family:var(--fmark);font-size:15px;letter-spacing:.04em;color:var(--accentText)}
header.top h1{font-size:30px;font-weight:800;letter-spacing:-.03em;margin-top:6px;line-height:1.12}
header.top p{color:var(--pgm);max-width:74ch;margin-top:10px;font-size:14px}
.callout{margin-top:16px;border:1px solid var(--pgl);border-left:3px solid var(--accent);background:var(--pgc);border-radius:12px;padding:13px 16px;max-width:82ch}
.callout b{color:var(--pgi)}
.callout p + p{margin-top:7px}
nav.idx{position:sticky;top:0;z-index:20;background:var(--pg);border-bottom:1px solid var(--pgl)}
nav.idx .wrap{display:flex;gap:7px;overflow-x:auto;scrollbar-width:none;padding-top:9px;padding-bottom:9px}
nav.idx .wrap::-webkit-scrollbar{display:none}
nav.idx a,nav.idx button{flex:0 0 auto;text-decoration:none;border:1px solid var(--pgl);border-radius:999px;padding:0 14px;font:700 12.5px/1 var(--fui);min-height:38px;display:flex;align-items:center;background:var(--pgc);color:var(--pgi);cursor:pointer}
nav.idx a.on{background:var(--pgi);color:var(--pg);border-color:var(--pgi)}
nav.idx button{gap:7px;border-color:var(--accent)}

.blk{display:flex;gap:30px;align-items:flex-start;padding:38px 22px 10px;max-width:1240px;margin:0 auto;border-top:1px solid var(--pgl)}
.colL{flex:1 1 340px;min-width:300px;position:sticky;top:60px}
.colR{flex:0 1 802px;max-width:802px;min-width:0;display:flex;flex-wrap:wrap;gap:22px;align-items:flex-start}
.colR > *{max-width:100%}
.num{font-size:10.5px;letter-spacing:.15em;text-transform:uppercase;color:var(--pgm);font-weight:800}
.blk h2{font-size:25px;font-weight:800;letter-spacing:-.025em;margin-top:5px}
.one{font-size:14.5px;margin-top:7px;max-width:62ch}
.chg{margin-top:14px;border-left:2px solid var(--pgl);padding-left:13px;max-width:62ch}
.chg.r2{border-left-color:var(--accent)}
.chg .q{font-size:14px;font-style:italic;color:var(--pgi)}
.chg.r2 .q{font-style:normal;font-weight:800;font-size:12px;letter-spacing:.09em;text-transform:uppercase;color:var(--accentText)}
.chg .b{font-size:13.5px;color:var(--pgm);margin-top:4px}
.chg .b b{color:var(--pgi);font-weight:700}
.ask{margin-top:14px;background:var(--askBg);border:1px solid var(--askEdge);border-radius:12px;padding:12px 15px;font-size:13.5px;max-width:62ch;color:var(--pgi)}
.ask > b:first-child{display:block;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--accentText);margin-bottom:4px}
.ask b{font-weight:700;color:var(--pgi)}
.fw figcaption{text-align:center;font-size:12px;color:var(--pgm);margin-top:9px;max-width:390px;line-height:1.45}

/* contrast + palette */
.ct{margin-top:14px;border-collapse:collapse;font-size:12.5px;width:100%;max-width:560px;background:var(--pgc)}
.ct th,.ct td{text-align:left;padding:6px 12px;border-bottom:1px solid var(--pgl)}
.ct th{font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--pgm)}
.ct b{font:700 12.5px/1 var(--fnum);font-variant-numeric:tabular-nums}
.ct .ok{color:var(--ok)}.ct .bad{color:var(--bad)}
.ct .min{color:var(--pgm);font:500 11.5px/1 var(--fnum)}
.swr{display:flex;gap:7px;flex-wrap:wrap;margin-top:14px;max-width:580px}
.swc{display:flex;align-items:center;gap:7px;border:1px solid var(--pgl);background:var(--pgc);border-radius:9px;padding:5px 9px}
.swc i{width:14px;height:14px;border-radius:4px;box-shadow:inset 0 0 0 1px rgba(128,128,128,.4);display:block;flex:0 0 14px}
.swc em{font-style:normal;font-size:11.5px;color:var(--pgm)}
.swc code{font:600 11px/1 var(--fnum);font-variant-numeric:tabular-nums}

/* nav options */
.plates{display:flex;flex-wrap:wrap;gap:18px;margin-top:4px;width:100%;max-width:100%}
.navcol{flex:0 1 820px;min-width:0;flex-direction:column}
.sheetpair{display:flex;gap:22px;flex-wrap:wrap;margin-top:22px;width:100%}
.pcol{flex:1 1 390px;min-width:0;display:flex;flex-direction:column;gap:8px}
.pcap{font-size:11.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--pgm);font-weight:800}
.plate{width:100%;max-width:420px;padding:14px;border-radius:18px;background:var(--canvas);box-shadow:0 0 0 1px var(--pgl)}
.plate .tabs{position:static}
.taps{width:100%;max-width:600px;border-collapse:collapse;margin-top:16px;font-size:13px;background:var(--pgc)}
.taps th,.taps td{text-align:left;padding:7px 12px;border-bottom:1px solid var(--pgl)}
.taps th:first-child,.taps td:first-child{min-width:150px}
.taps th{font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--pgm)}
.taps td.y{font:700 13px/1 var(--fnum)}
.rec{margin-top:14px;background:var(--recBg);border:1px solid var(--recEdge);border-radius:12px;padding:12px 15px;font-size:13.5px;max-width:62ch}
.rec b{color:var(--recInk)}

/* open questions */
.openlist{max-width:84ch}
.openlist li{list-style:none;border-top:1px solid var(--pgl);padding:13px 0;font-size:14px}
.openlist li > b{display:block;font-weight:700;margin-bottom:3px}
.openlist li em b{display:inline;font-weight:700;color:var(--pgi)}
.openlist li em{font-style:normal;color:var(--pgm);font-size:13.5px}
.openlist li.hot{background:var(--askBg);border:1px solid var(--askEdge);border-radius:12px;padding:13px 15px;margin:10px 0}

/* ================= phone frames ================= */
.frame{width:390px;height:844px;border-radius:38px;overflow:hidden;position:relative;display:flex;flex-direction:column;
background:var(--canvas);color:var(--ink);font-family:var(--fui);
box-shadow:0 0 0 1px var(--pgl),0 16px 36px var(--lift)}
.frame.tall{height:auto;min-height:844px;overflow:visible;border-radius:30px}
.frame.hasnav::after{content:'';position:absolute;left:0;right:0;bottom:0;height:94px;z-index:1;pointer-events:none;
background:linear-gradient(to bottom,transparent,var(--canvas) 46%)}
.frame .fold{position:absolute;left:0;right:0;top:844px;height:20px;z-index:3;pointer-events:none;
background:var(--foldBg);border-top:1.5px dashed var(--foldLine);border-bottom:1.5px dashed var(--foldLine);display:flex;align-items:center;justify-content:flex-end}
.frame .fold b{font:700 10px/1 var(--fui);letter-spacing:.06em;color:var(--foldText);background:var(--canvas);border-radius:4px;padding:3px 6px;margin-right:10px}
.frame .sb{height:44px;flex:0 0 44px;display:flex;align-items:center;justify-content:space-between;padding:0 20px 0 26px;color:var(--ink)}
.frame .sb-t{font:700 14px/1 var(--fui);letter-spacing:-.01em}
.frame .sb-r{display:flex;align-items:center;gap:5px}
.frame .scr{flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;gap:11px;padding-top:2px}
.frame.tall .scr{overflow:visible}
.frame .scr > *{flex-shrink:0}
.frame .tailpad{flex:0 0 110px}

/* header */
.frame .hdr{display:flex;align-items:flex-start;justify-content:space-between;padding:4px 16px 0;gap:12px}
.frame .hdrl{display:flex;flex-direction:column;gap:7px;min-width:0}
.frame .dateline{font:700 11.5px/1 var(--fui);letter-spacing:.11em;text-transform:uppercase;color:var(--muted)}
.frame .greet{font:800 28px/1.14 var(--fui);letter-spacing:-.035em;color:var(--ink)}
.frame .avbtn{width:48px;height:48px;flex:0 0 48px;border-radius:999px;background:var(--raised);box-shadow:inset 0 0 0 1.5px var(--border);
display:flex;align-items:center;justify-content:center;font:800 15px/1 var(--fui);color:var(--ink);letter-spacing:-.02em}
.frame .hdr2{align-items:center;padding:0 16px 2px;min-height:52px}
.frame .hdr2.back{gap:10px}
.frame .hdr2.back .h1{flex:1}
.frame .h1{font:800 26px/1.1 var(--fui);letter-spacing:-.03em}
.frame .hdr-r{display:flex;align-items:center;gap:9px}
.frame .iconbtn{width:44px;height:44px;border-radius:999px;box-shadow:inset 0 0 0 1.5px var(--border);display:flex;align-items:center;justify-content:center;color:var(--ink);flex:0 0 44px}

/* numerals */
.frame .n{font-family:var(--fnum);font-variant-numeric:lining-nums tabular-nums;font-weight:800;letter-spacing:-.015em}
.frame .n .rs{font-size:.86em}
.frame .pos{color:var(--pos)}
.frame .mut{color:var(--muted)}
.frame .dot{color:var(--border)}

/* alert card — exactly one per home */
.frame .alertc{display:flex;align-items:center;gap:11px;margin:0 16px;padding:13px 14px;border-radius:20px;background:var(--warnBg);box-shadow:inset 0 0 0 1px var(--alertEdge)}
.frame .alertc .ai{color:var(--warn);flex:0 0 auto}
.frame .alertc .at{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.frame .alertc b{font:800 15.5px/1.25 var(--fui);letter-spacing:-.02em;color:var(--ink)}
.frame .alertc em{font-style:normal;font:500 12px/1.3 var(--fui);color:var(--warn)}
.frame .apill{flex:0 0 auto;min-height:44px;display:flex;align-items:center;padding:0 16px;border-radius:999px;background:var(--ink);color:var(--canvas);font:700 13px/1 var(--fui)}

/* the AI summary card — R4 */
.frame .sumc{padding:14px 16px 13px;display:flex;flex-direction:column;gap:7px}
.frame .sumh{display:flex;align-items:center;gap:7px;font:800 11px/1 var(--fui);letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.frame .sumi{color:var(--accentText);display:flex}
.frame .suml{font:500 15px/1.45 var(--fui);color:var(--ink)}
.frame .suml b{font-weight:800}
.frame .sumf{font:500 11px/1.4 var(--fui);color:var(--muted);margin-top:4px;padding-top:8px;border-top:1px solid var(--hair)}

/* tiles */
.frame .tiles2{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:0 16px}
.frame .tiles3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin:0 16px}
.frame .tiles4{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:0 16px}
.frame .tile{background:var(--surface);border-radius:20px;padding:12px 13px 13px;display:flex;flex-direction:column;gap:3px;min-height:86px;justify-content:center;box-shadow:inset 0 0 0 1px var(--hair)}
.frame .tile.fill{background:var(--accent);box-shadow:none;color:var(--onAccent)}
.frame .tcap{font:700 10.5px/1.25 var(--fui);letter-spacing:.07em;text-transform:uppercase;color:var(--muted)}
.frame .tile.fill .tcap,.frame .tile.fill .tsub{color:var(--onAccent);opacity:.82}
.frame .tbig{font:800 23px/1.08 var(--fnum);font-variant-numeric:lining-nums tabular-nums;letter-spacing:-.04em;margin-top:2px}
.frame .tiles2 .tbig,.frame .tiles4 .tbig{font-size:26px}
.frame .tbig .rs{font-size:.72em}
.frame .tsub{font:500 11px/1.25 var(--fui);color:var(--muted)}

/* section heads + cards */
.frame .ghd{display:flex;justify-content:space-between;align-items:center;min-height:40px;padding:0 20px;margin:-4px 0 -9px;gap:10px}
.frame .hd{font:800 11.5px/1.2 var(--fui);letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.frame .hdm{font:600 11.5px/1.3 var(--fui);color:var(--muted);text-align:right}
.frame .link{font:700 12.5px/1.2 var(--fui);color:var(--ink);min-height:44px;display:inline-flex;align-items:center;padding-left:14px;text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:1.3px}
.frame .card{background:var(--surface);border-radius:22px;margin:0 16px;overflow:hidden;box-shadow:inset 0 0 0 1px var(--hair)}
.frame .card.pad{padding:13px 15px}
.frame .rrow{display:flex;align-items:center;gap:10px;min-height:56px;padding:6px 15px}
.frame .rrow + .rrow{box-shadow:inset 0 1px 0 var(--hair)}
.frame .rn{font:700 15px/1.3 var(--fui);flex:1;display:flex;flex-direction:column;gap:2px;min-width:0}
.frame .rm{font:500 12px/1.3 var(--fui);color:var(--muted)}
.frame .ra{font-size:16.5px;flex:0 0 auto}
.frame .rrow svg{color:var(--muted);flex:0 0 auto}
.frame .why{font:500 12.5px/1.5 var(--fui);color:var(--muted);padding:0 20px;margin-top:-2px}
.frame .why b{color:var(--ink);font-weight:700}
.frame .why i{font-style:italic}

/* duty rows */
.frame .drow{display:flex;align-items:center;gap:11px;min-height:58px;padding:6px 15px;position:relative}
.frame .drow + .drow,.frame .pairblk + .drow,.frame .drow + .pairblk{box-shadow:inset 0 1px 0 var(--hair)}
.frame .dgut{display:none}
.frame .tick{width:30px;height:30px;flex:0 0 30px;border-radius:999px;display:flex;align-items:center;justify-content:center;position:relative;z-index:1;background:var(--surface)}
.frame .tick.live{box-shadow:inset 0 0 0 2.5px var(--ink)}
.frame .tick.inert{box-shadow:inset 0 0 0 2px var(--hair)}
.frame .tick.missed{border:2px dashed var(--border);background:transparent}
.frame .tick.offerd{box-shadow:inset 0 0 0 2px var(--border);color:var(--muted)}
.frame .tick.done{background:var(--posBg);color:var(--pos);box-shadow:inset 0 0 0 1.5px var(--pos)}
.frame .dn{flex:1 1 auto;min-width:92px;display:flex;flex-direction:column;gap:2px;font:700 15.5px/1.25 var(--fui)}
.frame .dpt{font:600 11.5px/1.3 var(--fui);color:var(--muted)}
.frame .who{font-style:normal;font:600 12.5px/1.2 var(--fui);color:var(--muted);flex:0 1 auto;min-width:0}
.frame .who.you{color:var(--ink);font-weight:800}
.frame .wordchip{font:700 11.5px/1 var(--fui);color:var(--muted);background:var(--raised);border-radius:8px;padding:5px 8px;margin-left:8px;flex:0 0 auto}
.frame .takeit{font:700 12.5px/1 var(--fui);color:var(--canvas);background:var(--ink);border-radius:999px;padding:12px 14px;margin-left:8px;flex:0 0 auto}
.frame .vouch{font:700 12.5px/1 var(--fui);color:var(--ink);box-shadow:inset 0 0 0 1.3px var(--border);border-radius:999px;padding:9px 11px;flex:0 0 auto;margin-left:8px}

/* R2 — one duty, two people, together */
.frame .pairblk{padding:10px 15px 4px;background:var(--raised)}
.frame .pairhd{font:800 15.5px/1.25 var(--fui);display:flex;flex-direction:column;gap:2px}
.frame .pairm{font:600 11.5px/1.3 var(--fui);color:var(--muted);letter-spacing:0}
.frame .prow{display:flex;align-items:center;gap:11px;min-height:52px}
.frame .prow + .prow{box-shadow:inset 0 1px 0 var(--hair)}
.frame .prow .tick{background:var(--raised)}
.frame .pn{flex:1;font:700 15px/1.2 var(--fui)}

/* R8 — photo evidence */
.frame .photorow{display:flex;align-items:center;gap:10px;padding:0 15px 11px 56px}
.frame .pthumb{width:38px;height:38px;flex:0 0 38px;border-radius:10px;background:var(--raised);box-shadow:inset 0 0 0 1px var(--hair);display:flex;align-items:center;justify-content:center;color:var(--muted)}
.frame .pthumb.big{width:46px;height:46px;flex:0 0 46px;border-radius:12px}
.frame .ptn{font:600 12px/1.3 var(--fui);color:var(--muted)}

.frame .exp{display:flex;align-items:center;gap:10px;min-height:48px;padding:4px 15px;box-shadow:inset 0 1px 0 var(--hair)}
.frame .eico{color:var(--muted);flex:0 0 auto}
.frame .en{flex:1;font:600 14px/1.25 var(--fui)}

/* badges */
.frame .badge{display:inline-flex;align-items:center;gap:4px;border-radius:8px;padding:3px 8px;font:700 11.5px/1.3 var(--fui);flex:0 0 auto}
.frame .badge.warn{background:var(--warnBg);color:var(--warn)}
.frame .badge.neg{background:var(--negBg);color:var(--neg);box-shadow:inset 0 0 0 1px var(--neg)}
.frame .badge.plain{color:var(--muted);background:transparent;padding-left:0}

/* quick add — one row, not a grid */
.frame .qrow{display:flex;gap:8px;padding:0 16px;overflow:hidden}
.frame .qchip{display:inline-flex;align-items:center;gap:7px;min-height:48px;padding:0 14px;border-radius:999px;background:var(--surface);box-shadow:inset 0 0 0 1px var(--hair);flex:0 0 auto}
.frame .qchip b{font:700 14px/1 var(--fui)}
.frame .qchip .n{font-size:14px;color:var(--muted)}
.frame .qchip.more{color:var(--ink);font:700 14px/1 var(--fui)}

/* meals — R11 */
.frame .mealc{display:flex;flex-direction:column;gap:9px}
.frame .mealq{font:800 15.5px/1.25 var(--fui);letter-spacing:-.02em}
.frame .mealf{display:flex;align-items:center;gap:10px;min-height:48px;border-radius:14px;box-shadow:inset 0 0 0 1.3px var(--hair);padding:0 13px}
.frame .mealk{font:800 10.5px/1 var(--fui);letter-spacing:.11em;text-transform:uppercase;color:var(--muted);width:52px;flex:0 0 52px}
.frame .mealv{font:600 14.5px/1.3 var(--fui);flex:1}
.frame .mealv.ph,.frame .field.ph{color:var(--muted);font-weight:500}
.frame .mealn{font:500 11.5px/1.4 var(--fui);color:var(--muted)}
.frame .mealwho{font:600 14px/1.45 var(--fui);display:flex;gap:10px;align-items:flex-start}
.frame .mealwi{color:var(--muted);flex:0 0 auto;margin-top:1px}

/* top-ups (rule 3) */
.frame .bigline{font:600 13.5px/1.3 var(--fui);color:var(--muted)}
.frame .bigline b{font-size:20px;color:var(--ink)}
.frame .avs{display:flex;gap:9px;margin-top:11px}
.frame .av{flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;gap:5px}
.frame .av em{font-style:normal;font:600 10.5px/1 var(--fui);color:var(--muted)}
.frame .avw{position:relative;display:block;width:42px;height:42px}
.frame .avi{width:42px;height:42px;border-radius:999px;background:var(--raised);display:flex;align-items:center;justify-content:center;font:800 13px/1 var(--fui);letter-spacing:-.02em}
.frame .avb{position:absolute;right:-2px;bottom:-2px;width:18px;height:18px;border-radius:999px;display:flex;align-items:center;justify-content:center;font:700 10px/1 var(--fui);box-shadow:0 0 0 2px var(--surface)}
.frame .avb.yes{background:var(--posBg);color:var(--pos)}
.frame .avb.no{background:var(--raised);color:var(--muted)}
.frame .avleg{font:500 11.5px/1.3 var(--fui);color:var(--muted);margin-top:10px}

/* profile */
.frame .cover{height:132px;background:linear-gradient(135deg,var(--coverA),var(--coverB));margin:0 16px;border-radius:22px;position:relative;flex:0 0 132px}
.frame .covbadge{position:absolute;right:10px;top:10px;width:36px;height:36px;border-radius:999px;background:var(--surface);display:flex;align-items:center;justify-content:center;color:var(--ink)}
.frame .phead{margin:-46px 16px 0;padding:0 2px;display:flex;flex-direction:column;align-items:flex-start;gap:3px;position:relative;z-index:2}
.frame .pav{width:84px;height:84px;border-radius:999px;background:var(--raised);box-shadow:0 0 0 4px var(--canvas);display:flex;align-items:center;justify-content:center;font:800 27px/1 var(--fui);letter-spacing:-.03em;position:relative;margin-left:4px}
.frame .pavbadge{position:absolute;right:-2px;bottom:-2px;width:28px;height:28px;border-radius:999px;background:var(--ink);color:var(--canvas);display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 3px var(--canvas)}
.frame .pname{font:800 27px/1.1 var(--fui);letter-spacing:-.035em;margin-top:9px}
.frame .phandle{font:600 13.5px/1.2 var(--fui);color:var(--muted)}
.frame .pstats{display:flex;align-items:center;gap:16px;margin-top:11px}
.frame .pstats span{display:flex;flex-direction:column;gap:1px}
.frame .pstats b{font:800 17px/1.1 var(--fnum);font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.frame .pstats em{font-style:normal;font:600 11px/1.2 var(--fui);letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.frame .pvr{width:1px;height:28px;background:var(--hair)}
.frame .outpill{margin-top:14px;min-height:46px;display:inline-flex;align-items:center;justify-content:center;padding:0 20px;border-radius:999px;box-shadow:inset 0 0 0 1.5px var(--border);font:700 14px/1 var(--fui)}
.frame .outpill.wide{margin:0 16px;min-height:52px}
.frame .outpill.danger{color:var(--neg);box-shadow:inset 0 0 0 1.5px var(--neg)}
.frame .ghostcard{padding:13px 15px;background:transparent;box-shadow:inset 0 0 0 1.5px var(--hair)}
.frame .gcl{font:600 14px/1.5 var(--fui);padding-left:16px;position:relative}
.frame .gcl::before{content:'';position:absolute;left:2px;top:9px;width:5px;height:5px;border-radius:3px;background:var(--border)}
.frame .gcn{font:500 12px/1.45 var(--fui);color:var(--muted);margin-top:9px}

/* fridge + shopping */
.frame .shopcard{display:flex;align-items:center;gap:12px;padding:14px 15px}
.frame .sci{color:var(--ink);flex:0 0 auto}
.frame .scn{flex:1;font:800 16px/1.2 var(--fui);letter-spacing:-.02em;display:flex;flex-direction:column;gap:3px}
.frame .scn em{font-style:normal;font:500 12.5px/1.2 var(--fui);color:var(--muted)}
.frame .scb{color:var(--muted)}
.frame .shoprow{display:flex;gap:8px;padding:0 16px;margin-top:-4px}
.frame .minipill{display:inline-flex;align-items:center;gap:7px;min-height:44px;padding:0 14px;border-radius:999px;box-shadow:inset 0 0 0 1.3px var(--border);font:700 12.5px/1 var(--fui)}
.frame .addbar{display:flex;gap:9px;margin:0 16px}
.frame .addf{flex:1;min-height:50px;display:flex;align-items:center;padding:0 15px;border-radius:999px;background:var(--surface);box-shadow:inset 0 0 0 1.3px var(--border);font:500 14.5px/1 var(--fui);color:var(--muted)}
.frame .addb{width:50px;height:50px;flex:0 0 50px;border-radius:999px;background:var(--ink);color:var(--canvas);display:flex;align-items:center;justify-content:center}
.frame .ckrow{display:flex;align-items:center;gap:12px;min-height:54px;padding:6px 15px}
.frame .ckrow + .ckrow{box-shadow:inset 0 1px 0 var(--hair)}
.frame .ck{width:24px;height:24px;flex:0 0 24px;border-radius:7px;box-shadow:inset 0 0 0 2px var(--border);display:flex;align-items:center;justify-content:center}
.frame .ck.on{background:var(--ink);color:var(--canvas);box-shadow:none}
.frame .ckn{flex:1;font:700 14.5px/1.25 var(--fui);display:flex;flex-direction:column;gap:2px;min-width:0}
.frame .ckn em{font-style:normal;font:500 11.5px/1.3 var(--fui);color:var(--muted)}
.frame .ckrow.done .ckn{color:var(--muted);text-decoration:line-through;text-decoration-thickness:1px}
.frame .ckrow.done .ckn em{text-decoration:none}
.frame .grouphd{font:800 13.5px/1.2 var(--fui);padding:0 20px;margin:2px 0 -6px;letter-spacing:-.01em}
.frame .gm{font-weight:500;font-size:11.5px;color:var(--muted);letter-spacing:0}
.frame .lot{padding:10px 15px}
.frame .lot + .lot{box-shadow:inset 0 1px 0 var(--hair)}
.frame .lot-t{display:flex;align-items:center;gap:9px}
.frame .ln{font:700 15.5px/1.25 var(--fui);flex:1}
.frame .lq{font-family:var(--fnum);font-variant-numeric:tabular-nums;font-weight:800;font-size:14.5px;letter-spacing:-.015em}
.frame .lot-m{display:flex;align-items:center;gap:8px;margin-top:5px;flex-wrap:wrap}
.frame .lp{font:500 12px/1.3 var(--fui);color:var(--muted)}
.frame .own .ownrow{display:flex;align-items:center;gap:11px;padding:11px 15px 11px 12px;border-left:3px dashed var(--border)}
.frame .own .ownrow + .ownrow{box-shadow:inset 0 1px 0 var(--hair)}
.frame .ownav{width:34px;height:34px;flex:0 0 34px;border-radius:999px;background:var(--raised);display:flex;align-items:center;justify-content:center;font:800 12px/1 var(--fui)}
.frame .ownb{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.frame .lefto .lrow{display:flex;align-items:center;gap:11px;padding:11px 15px;background:repeating-linear-gradient(135deg,transparent,transparent 9px,var(--hatch) 9px,var(--hatch) 18px)}
.frame .lefto .lrow + .lrow{box-shadow:inset 0 1px 0 var(--hair)}
.frame .lico{width:34px;height:34px;flex:0 0 34px;border-radius:10px;box-shadow:inset 0 0 0 1.4px var(--border);display:flex;align-items:center;justify-content:center;color:var(--ink)}

/* duties strip */
.frame .strip{display:flex;gap:7px;padding:0 16px}
.frame .day{flex:1;min-width:0;height:62px;border-radius:18px;background:var(--surface);box-shadow:inset 0 0 0 1px var(--hair);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px}
.frame .day b{font:800 17px/1 var(--fnum);font-variant-numeric:tabular-nums}
.frame .day em{font-style:normal;font:600 11px/1 var(--fui);color:var(--muted)}
.frame .day.on{background:var(--accent);box-shadow:none;color:var(--onAccent)}
.frame .day.on em{color:var(--onAccent);opacity:.8}
.frame .todayline{font:800 15px/1.2 var(--fui);padding:0 20px;letter-spacing:-.02em}
.frame .todayline .mut{font-weight:500;font-size:12.5px}
.frame .swipewrap{position:relative;margin:0 16px;overflow:hidden;border-radius:22px;display:flex;align-items:stretch}
.frame .swipepanels{position:static;display:flex;flex:0 0 88px;order:2}
.frame .sp{width:88px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;font:800 12.5px/1 var(--fui)}
.frame .sp.offer{background:var(--raised);color:var(--ink)}
.frame .swiped{margin:0;flex:1;min-width:0;border-radius:22px 0 0 22px;order:1}
.frame .swiped .drow{padding-right:10px}

/* forms */
.frame .form .flab{display:block;font:800 11px/1.2 var(--fui);letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:14px 0 8px}
.frame .form .flab:first-child{margin-top:0}
.frame .field{min-height:50px;border-radius:14px;box-shadow:inset 0 0 0 1.4px var(--border);display:flex;align-items:center;padding:0 14px;font:600 15px/1 var(--fui);gap:10px}
.frame .field.tall{min-height:64px;align-items:center}
.frame .fico{margin-left:auto;color:var(--muted);display:flex}
.frame .chiprow{display:flex;gap:7px;flex-wrap:wrap}
.frame .chiprow.who{gap:6px}
.frame .chip2{display:inline-flex;align-items:center;gap:6px;min-height:46px;padding:0 15px;border-radius:999px;box-shadow:inset 0 0 0 1.4px var(--border);font:700 13.5px/1 var(--fui);background:var(--surface)}
.frame .chip2.on{background:var(--ink);color:var(--canvas);box-shadow:none}
.frame .chiprow.who .chip2{padding:0 12px;font-size:13px}
.frame .fhint{font:500 12px/1.45 var(--fui);color:var(--muted);margin-top:11px}
.frame .fhint b{color:var(--ink);font-weight:700}
.frame .preview{margin-top:14px;border-radius:14px;background:var(--raised);padding:12px 14px}
.frame .pvh{font:800 10.5px/1 var(--fui);letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:9px}
.frame .pvr2{font:600 14px/1.65 var(--fui)}
.frame .pvr2 b{display:inline-block;width:38px;color:var(--muted);font-weight:700;font-size:12px}
.frame .pvn{font:500 11.5px/1.4 var(--fui);color:var(--muted);margin-top:7px}
.frame .brasspill{display:flex;align-items:center;justify-content:center;min-height:56px;border-radius:999px;background:var(--accent);color:var(--onAccent);font:800 15.5px/1 var(--fui);margin-top:14px}
.frame .brasspill.wide{margin:0 16px}
.frame .swrow{display:flex;align-items:center;gap:12px;min-height:62px;padding:8px 15px}
.frame .swrow + .swrow{box-shadow:inset 0 1px 0 var(--hair)}
.frame .swt{flex:1;font:700 15px/1.25 var(--fui);display:flex;flex-direction:column;gap:3px;min-width:0}
.frame .swt em{font-style:normal;font:500 11.5px/1.35 var(--fui);color:var(--muted)}
.frame .sw{width:50px;height:30px;flex:0 0 50px;border-radius:999px;background:var(--raised);box-shadow:inset 0 0 0 1.3px var(--hair);position:relative}
.frame .sw i{position:absolute;top:3px;left:3px;width:24px;height:24px;border-radius:999px;background:var(--border)}
.frame .sw.on{background:var(--ink);box-shadow:none}
.frame .sw.on i{left:23px;background:var(--canvas)}
.frame .erow{display:flex;align-items:center;gap:11px;min-height:56px;padding:0 15px}
.frame .erow + .erow{box-shadow:inset 0 1px 0 var(--hair)}
.frame .eminus{color:var(--neg);flex:0 0 auto}
.frame .emate{flex:1;font:700 15.5px/1.2 var(--fui)}
.frame .ehandle{color:var(--border);flex:0 0 auto}
.frame .setl{display:flex;align-items:baseline;justify-content:space-between;gap:10px;min-height:38px;font:600 14px/1.3 var(--fui);color:var(--muted)}
.frame .setl b{font-size:16px;color:var(--ink)}
.frame .setl.tot{border-top:1.5px solid var(--hair);margin-top:7px;padding-top:11px;color:var(--ink);font-weight:800}
.frame .setl.tot b{font-size:24px}
.frame .awayc{display:flex;gap:12px;align-items:flex-start}
.frame .awayi{color:var(--muted);flex:0 0 auto;margin-top:1px}
.frame .awayt{font:600 14px/1.45 var(--fui)}
.frame .awayt b{font-weight:800}

/* spending */
.frame .periods{padding:0 16px}
.frame .chartc .chart{display:flex;gap:10px;align-items:stretch;height:150px}
.frame .bars{flex:1;display:flex;align-items:flex-end;gap:4px;padding-bottom:20px;position:relative}
.frame .barcol{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%;position:relative}
.frame .bar{width:100%;border-radius:4px 4px 2px 2px;background:var(--sunk);display:block;min-height:2px}
.frame .bar.now{background:var(--ink)}
.frame .barcol em{position:absolute;bottom:-17px;font-style:normal;font:600 10px/1 var(--fnum);font-variant-numeric:tabular-nums;color:var(--muted)}
.frame .barcol:last-child em{color:var(--ink);font-weight:800}
.frame .yscale{display:flex;flex-direction:column;justify-content:space-between;padding-bottom:20px;font:600 10.5px/1 var(--fnum);font-variant-numeric:tabular-nums;color:var(--muted);text-align:right}
.frame .dgs{display:flex;gap:16px}
.frame .dgwrap{flex:1;min-width:0}
.frame .dgname{font:800 11px/1.2 var(--fui);letter-spacing:.1em;text-transform:uppercase;color:var(--muted);display:block;margin-bottom:7px}
.frame .dg{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}
.frame .dg i,.frame .dgleg i{display:block;width:100%;aspect-ratio:1;border-radius:4px}
.frame .dgleg i{display:inline-block;width:11px;height:11px;vertical-align:-1px;margin-right:3px}
.frame .d0{background:var(--grid0)}
.frame .d1{background:var(--grid1)}
.frame .d2{background:var(--grid2)}
.frame .dx{background:transparent;box-shadow:inset 0 0 0 1px var(--border)}
.frame .dgleg{font:600 11px/1.9 var(--fui);color:var(--muted);margin-top:10px}
.frame .segbar{display:flex;height:14px;border-radius:7px;overflow:hidden;gap:2px}
.frame .segbar span:nth-child(1),.frame .seglegs .l1{background:var(--ink)}
.frame .segbar span:nth-child(2),.frame .seglegs .l2{background:var(--bar2)}
.frame .segbar span:nth-child(3),.frame .seglegs .l3{background:var(--bar3)}
.frame .seglegs{display:flex;flex-wrap:wrap;gap:12px;margin-top:10px;font:600 12px/1 var(--fui)}
.frame .seglegs i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px}

/* import + add product */
.frame .picker{margin:0 16px;border-radius:22px;border:2px dashed var(--border);padding:20px 16px;display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;background:var(--surface)}
.frame .pkic{display:flex;gap:10px;color:var(--muted)}
.frame .picker b{font:800 16px/1.2 var(--fui);letter-spacing:-.02em;margin-top:4px}
.frame .picker em{font-style:normal;font:500 12.5px/1.4 var(--fui);color:var(--muted);max-width:30ch}
.frame .detected{display:flex;align-items:center;gap:12px;padding:13px 15px}
.frame .dti{color:var(--ink);flex:0 0 auto}
.frame .dtn{flex:1;font:800 15.5px/1.25 var(--fui);letter-spacing:-.02em;display:flex;flex-direction:column;gap:3px}
.frame .dtn em{font-style:normal;font:500 12px/1.2 var(--fui);color:var(--muted);letter-spacing:0}
.frame .dtn .rs{font-family:var(--fnum)}
.frame .lines .lrow2{display:flex;align-items:center;gap:9px;min-height:54px;padding:7px 13px}
.frame .lines .lrow2 + .lrow2{box-shadow:inset 0 1px 0 var(--hair)}
.frame .l2n{flex:1;min-width:0;font:600 14.5px/1.25 var(--fui);display:flex;flex-direction:column;gap:2px}
.frame .l2n em{font-style:normal;font:600 11px/1.2 var(--fui);color:var(--muted)}
.frame .lrow2.mine{background:var(--mineBg)}
.frame .lrow2.mine .l2n,.frame .lrow2.mine .ra{color:var(--muted)}
.frame .lrow2.mine .l2n em{color:var(--warn)}
.frame .tog{display:flex;flex:0 0 auto;border-radius:999px;background:var(--raised);padding:3px;height:36px;align-items:center}
.frame .tog i{font-style:normal;font:700 11.5px/1 var(--fui);padding:0 10px;height:30px;display:flex;align-items:center;border-radius:999px;color:var(--muted)}
.frame .tog i:first-child{background:var(--ink);color:var(--canvas)}
.frame .tog.on i:first-child{background:transparent;color:var(--muted)}
.frame .tog.on i:last-child{background:var(--ink);color:var(--canvas)}
.frame .balance{margin:0 16px;padding:11px 15px;border-radius:16px;background:var(--posBg);display:flex;flex-direction:column;gap:3px}
.frame .bn{font:800 12.5px/1.2 var(--fui);color:var(--pos)}
.frame .bl{font:600 12.5px/1.3 var(--fui);color:var(--ink)}
.frame .bl .rs{font-family:var(--fnum)}
.frame .keepr{display:flex;align-items:center;gap:12px;padding:12px 15px}
.frame .krn{flex:1;font:700 14.5px/1.25 var(--fui);display:flex;flex-direction:column;gap:3px}
.frame .krn em{font-style:normal;font:500 11.5px/1.35 var(--fui);color:var(--muted)}
.frame .scanbox{margin:0 16px;border-radius:22px;background:var(--surface);box-shadow:inset 0 0 0 1px var(--hair);padding:22px 16px;display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center}
.frame .scanic{color:var(--ink)}
.frame .scanbox b{font:800 17px/1.2 var(--fui);letter-spacing:-.025em;margin-top:6px}
.frame .scanbox em{font-style:normal;font:500 12.5px/1.4 var(--fui);color:var(--muted);max-width:32ch}
.frame .orline{display:flex;align-items:center;gap:12px;padding:0 20px;color:var(--muted);font:700 11px/1 var(--fui);letter-spacing:.12em;text-transform:uppercase}
.frame .orline::before,.frame .orline::after{content:'';flex:1;height:1px;background:var(--hair)}

/* sheet */
.frame .dimmed{display:flex;flex-direction:column;gap:11px;flex:1}
.frame .scrim{position:absolute;inset:0;background:var(--scrim);z-index:4}
.frame .sheet{position:absolute;left:0;right:0;bottom:0;z-index:5;background:var(--canvas);border-radius:28px 28px 0 0;padding:9px 16px 30px;display:flex;flex-direction:column;gap:12px}
.frame .grabh{width:40px;height:4px;border-radius:3px;background:var(--border);align-self:center;opacity:.6}
.frame .sheadr{display:flex;align-items:center;justify-content:space-between;min-height:44px}
.frame .sheadr b{font:800 20px/1 var(--fui);letter-spacing:-.03em}
.frame .sx{width:40px;height:40px;border-radius:999px;background:var(--raised);display:flex;align-items:center;justify-content:center}
.frame .stiles{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.frame .stile{min-height:92px;border-radius:20px;background:var(--surface);box-shadow:inset 0 0 0 1px var(--hair);display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-end;gap:9px;padding:13px;font:700 14px/1.2 var(--fui)}
.frame .sti{width:44px;height:44px;border-radius:14px;background:var(--raised);display:flex;align-items:center;justify-content:center;color:var(--ink)}
.frame .snote{font:500 12px/1.4 var(--fui);color:var(--muted)}
.frame .warnnote{color:var(--neg);font-weight:600}
.frame .sdiv{font:800 11px/1.2 var(--fui);letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-top:2px}
.frame .sheet .card{margin:0}
/* R5 — the sheet grows out of the + circle */
.frame .sheet.withorigin{padding-bottom:84px}
.frame .originmark{position:absolute;right:28px;bottom:22px;z-index:6;display:flex;align-items:center;pointer-events:none}
.frame .originmark i{width:52px;height:52px;border-radius:999px;border:2px dashed var(--accent);display:block}
.frame .originmark b{position:absolute;right:62px;white-space:nowrap;font:800 10px/1 var(--fui);letter-spacing:.08em;text-transform:uppercase;color:var(--onAccent);background:var(--accent);border-radius:5px;padding:5px 7px}

/* empty */
.frame .empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;padding:0 40px 90px;text-align:center}
.frame .eart{color:var(--border)}
.frame .empty b{font:800 20px/1.2 var(--fui);letter-spacing:-.03em;margin-top:9px}
.frame .empty em{font-style:normal;font:500 13.5px/1.5 var(--fui);color:var(--muted)}
.frame .empty .brasspill{padding:0 26px;margin-top:14px}
.frame .nobtn{font:600 12px/1.4 var(--fui);color:var(--border);margin-top:10px}

/* ---- the approved floating nav ---- */
.ph .tabs{display:flex;align-items:center;gap:6px;height:56px}
.frame .tabs{position:absolute;left:14px;right:14px;bottom:26px;z-index:3}
.ph .pod{height:56px;border-radius:28px;display:flex;align-items:center}
.ph .pod.act{flex:0 0 auto;gap:9px;padding:0 15px 0 8px;background:var(--podAct)}
.ph .bdg{width:40px;height:40px;flex:0 0 40px;border-radius:999px;background:var(--accent);color:var(--onAccent);display:flex;align-items:center;justify-content:center}
.ph .tl{font:800 14px/1 var(--fui);color:var(--ink);letter-spacing:-.015em;white-space:nowrap}
.ph .pod.grp{flex:1;min-width:0;padding:0 6px;background:var(--podGrp)}
.ph .gi{flex:1;min-width:0;height:48px;display:flex;align-items:center;justify-content:center;color:var(--muted)}
.ph .fab{width:52px;height:52px;flex:0 0 52px;border-radius:999px;display:flex;align-items:center;justify-content:center;background:var(--ink);color:var(--canvas)}
.ph .pod,.ph .fab{box-shadow:0 6px 18px var(--lift)}

@media (max-width:980px){
 .blk{flex-direction:column;gap:20px}
 .colL{position:static}
 .colR{justify-content:center;width:100%;max-width:none;flex-basis:auto}
}
@media (max-width:440px){
 .wrap{padding:0 16px}
 .blk{padding:30px 0 8px}
 .colL{padding:0 16px;min-width:0}
 .colR{gap:18px;width:100%;max-width:none;flex-basis:auto;margin:0}
 .colR > p{padding:0 16px}
 .fw{width:100%}
 .frame{width:min(390px,100vw);border-radius:0}
 .frame.tall{border-radius:0}
 .plates{width:100%;max-width:100%;margin:0}
 .pcol{flex:1 1 100%;max-width:100%}
 .plate{border-radius:0;max-width:none}
 .pcap{padding:0 16px}
 .fw figcaption{padding:0 16px;max-width:none}
 .ct,.taps,.openlist,.ask,.rec,.chg,.one{max-width:none}
}
</style></head>
<body>

<header class="top"><div class="wrap">
<p class="mk">FLATHUB</p>
<h1>V3 — the concept screens, round two</h1>
<p>Nineteen screens at true phone size (390×844), redrawn after your thirteen notes. This page is about <b>what is on each screen and where it sits</b>. Every screen carries a note saying which complaint it answers, in your own words, and the eight things that changed since the last version are marked <b>ROUND 2</b> in brass down the left.</p>

<div class="callout">
<p><b>Dark mode is here.</b> Use the <b>Light / Dark</b> button at the left of the index bar. The page opens in whichever your phone is set to. Every screen is drawn once and flips with the switch, rather than being drawn twice — it makes the page half as long to scroll and shows you more, not less.</p>
<p><b>The colours are still a placeholder.</b> Nobody has chosen a palette. These warm tones are from ref-4 so the screens can be drawn at all. Judge what appears on a screen, in what order, and what you tap to reach it.</p>
<p><b>The dashed line on a tall screen is the fold</b> — 844pt, where an iPhone stops. Anything under it needs a scroll. The floating bar is drawn at the bottom of each drawing so it does not sit on the content you are meant to read; on a real phone it stays pinned at the fold and content passes behind it.</p>
<p><b>The house rules still hold:</b> one accent per screen, every coloured state also carries a word, "Pay"/"Get back" and never "owe", no per-mate leaderboard, Indian digit grouping, tabular figures. The contrast table below is <i>computed</i> from the hex values in both modes, not claimed.</p>
<p><b>The data is this flat's.</b> Sahid, Ansh, Adnan, Anant, Ayan, Jatin. Ansh Rastogi holds the kitty. ₹2,000 each. Blinkit, Zepto and the local kirana. No invented flatmate, no invented shop. Everything is drawn as <b>Wednesday 7 October</b> so the figures hold together: ₹5,750 carried over + ₹8,000 of top-ups (4 of 6 in) − ₹2,350 spent = <b>₹11,400 in the kitty</b>, 9 entries, ≈₹336 a day. Ansh owes back ₹340 to Sahid and ₹1,110 to Anant.</p>
</div>
</div></header>

<nav class="idx"><div class="wrap">
<button id="modebtn" type="button" aria-label="Switch light and dark">◐ <span id="modelbl">Dark</span></button>
<a href="#palette">Palette &amp; contrast</a>
<a href="#nav">The nav question</a>
<a href="#home">1 · Home</a>
<a href="#profile">2 · Profile</a>
<a href="#fridge">3 · Fridge</a>
<a href="#meals">4 · Meals</a>
<a href="#duties">5 · Duties</a>
<a href="#manage">6 · Manage</a>
<a href="#spending">7 · Spending</a>
<a href="#import">8 · Import</a>
<a href="#money">9 · Moving out &amp; guests</a>
<a href="#sheet">10 · The + sheet</a>
<a href="#empty">11 · Empty states</a>
<a href="#open">Still open</a>
</div></nav>

<section class="blk" id="palette">
  <div class="colL">
    <p class="num">Placeholder · both modes</p>
    <h2>The palette, and its measured contrast</h2>
    <p class="one">One warm palette with a dark twin, derived from ref-4. It exists so the screens can be drawn. It is not a proposal and you are not being asked to approve it.</p>
    <p class="one">What <i>is</i> worth checking: that a placeholder is still legible in both modes. Every pair below is computed from the hex values at build time, in light <i>and</i> dark, and the build fails loudly if one drops under its minimum.</p>
    ${r2note(
      'Dark mode',
      'Added. The brass stays the same hex in both modes — it is the one colour that should feel like the same app at 9am and at 1am. Everything else has a twin.'
    )}
    <div class="swr">${[
      ['canvas', 'canvas'], ['card', 'surface'], ['raised', 'raised'], ['ink', 'ink'], ['muted', 'muted'],
      ['accent fill', 'accent'], ['accent text', 'accentText'], ['get back', 'pos'], ['soon', 'warn'], ['loss', 'neg'],
    ]
      .map(
        ([n, k]) =>
          `<span class="swc"><i style="background:${L[k]}"></i><i style="background:${D[k]}"></i><em>${n}</em><code>${L[k]} / ${D[k]}</code></span>`
      )
      .join('')}</div>
  </div>
  <div class="colR" style="flex:1 1 440px">${ctable()}</div>
</section>

<section class="blk" id="nav">
  <div class="colL">
    <p class="num">Open question · drawn, not decided</p>
    <h2>Where Kitty and Profile go</h2>
    <p class="one">The floating capsule is approved and unchanged: the active tab is its own pill with a filled badge and its label, the other three are bare icons in a second capsule, and <b>Add is a separate circle outside both</b> so it structurally cannot take the selected state. Content passes behind it.</p>
    ${r2note(
      'Kitchen became Fridge',
      'You asked for a <b>separate section for fridge</b>, so the fridge takes the slot outright and "Kitchen" stops being a container. The shopping list did not vanish — it gets <b>four doors</b> instead of a tab: the card at the top of the Fridge, "Add to the list" in the + sheet, a line in your morning summary, and the meal plan. Stock folds into the Fridge as one Staples row, where it already was.'
    )}
    ${chg(
      'the prominent one should show who owes what',
      'Kitty stops being the first thing the app opens on. It becomes a ledger you visit, reached from the kitty tile on Home.'
    )}
    <div class="rec"><b>Recommendation: A.</b> Same tap count, better mental model. The avatar top-right is the profile pattern every phone user already knows (PATTERNS §2 explicitly says "not a sixth tab"), and the + sheet is for <i>actions</i>; parking two destinations in an action menu is the one thing PATTERNS §7 warns about with Docusign. <b>A's cost, plainly: Home must carry the kitty figure in every single state, including every empty one. The moment Home stops showing it, the kitty ledger has no door.</b> The brass tile on the new Home satisfies that — see the question on screen 1.</div>
    <table class="taps"><thead><tr><th>From a cold open</th><th>A</th><th>B</th></tr></thead><tbody>
      <tr><td>The kitty ledger</td><td class="y">1 tap — the brass tile</td><td class="y">2 taps — + then a row</td></tr>
      <tr><td>Your profile / UPI ID</td><td class="y">1 tap — the avatar</td><td class="y">2 taps — + then a row</td></tr>
      <tr><td>The shopping list</td><td class="y">2 taps — Fridge, then the card</td><td class="y">2 taps</td></tr>
      <tr><td>Log a spend</td><td class="y">2 taps</td><td class="y">2 taps</td></tr>
    </tbody></table>
  </div>
  <div class="colR navcol">
    <div class="plates">
      ${plate('Home', 'A and B share this bar — Home active')}
      ${plate('Fridge', 'Fridge active · the label moves with the pill')}
    </div>
    <div class="sheetpair">
    ${frame('sheet', { cap: '<b>Option A</b> — the + sheet holds four actions and nothing else. The dashed circle marks where the sheet grows from, which is your round-2 note R5.' })}
    ${frame('sheetB', { cap: '<b>Option B</b> — the same sheet with Kitty and Profile added below a "Go to" rule. Reachable, but a destination living in an action menu.' })}
    </div>
  </div>
</section>

${sec(
  'home',
  'Screen 1 · the most important one',
  'Home',
  'Asana\'s skeleton (date line → greeting → one alert → the day → recent). Two versions, because personalisation is the entire point.',
  r2note(
    'The big card is the summary now',
    'You said <i>"no need to show the kitty money this big, instead of that we can have an ai customize and personalised summary after good morning in the big card."</i> Done. The summary sits where the hero was, and <b>the kitty becomes the first of three tiles</b> — still one tap to the ledger. The summary never names another mate\'s miss, never ranks the six of you, and never repeats the alert card above it.'
  ) +
    ask(
      'The kitty figure shrinking <b>collides with nav Option A</b>, whose whole risk was "Home must carry the kitty figure or the ledger has no door." A brass tile <i>is</i> still a door, and it is the only brass thing on the screen, so it is also the most tappable-looking. But it is a judgement call and it is yours, not mine. <b>Is the tile enough, or should the kitty keep a bigger block?</b>'
    ) +
    r2note(
      'The meals card',
      'You said whoever has the dishes also tells the cook. Modelled as a <b>role on the duty</b>, not as the word "dishes" — so if the flat renames it, or hangs meal-planning off a different chore, nothing breaks. Sahid is on dishes today, so he gets the prompt. Ansh is not, so he gets the same card read-only.'
    ) +
    chg(
      'the prominent one should show who owes what — if the flat owes Anant, Anant should have it on his home screen',
      'The alert card is personal and there is <b>exactly one</b>. Sahid: "₹340 to get back from Ansh", traceable in Recent. Ansh: "₹1,450 to pay back to 2 mates" — his own outstanding work, today three screens deep behind the people icon.'
    ) +
    `<div class="chg"><p class="b"><b>One brass element:</b> the kitty tile. The summary, the meals card, the duties and Recent are all plain cards. Section links are underlined ink. The alert sits on warm amber with its own word, never red.</p></div>
     <div class="chg"><p class="b"><b>Ansh's top-ups block obeys rule 3:</b> initials with ✓/○, alphabetical, no amounts, no ranking, no "who's late" list. The only number is "4 of 6".</p></div>`,
  frame('homeSahid', {
    tall: true,
    nav: 'Home',
    cap: '<b>Sahid</b> — an ordinary mate, and one of today\'s two on dishes, so the meals card asks him.',
  }) +
    frame('homeAnsh', {
      tall: true,
      nav: 'Home',
      cap: '<b>Ansh</b> — treasurer. Different alert, different summary, the top-ups block only he acts on, and the meals card read-only.',
    })
)}

${sec(
  'profile',
  'Screen 2 · a missing feature, not a restyle',
  'Profile',
  'There is no profile screen in the app today. Hypelist\'s cover + overlapping avatar, CRED\'s UPI row, Starling\'s grouping.',
  chg(
    "I can't see anywhere where I can add my UPI",
    'The UPI ID gets its own card at the top, with the sentence that earns it underneath: <b>"Ansh pays you back here."</b>'
  ) +
    chg(
      "the people icon opening /flat — I don't think all of them should be here",
      'What belongs to a person moves here; what belongs to the household stays on one flat screen, listed on the phone so you can see exactly what moved and what did not.'
    ) +
    r2note(
      'Notifications',
      'The row stays, the screen does not. You asked for <i>"proper notifications for everything"</i> and that is being worked out separately — drawing a settings screen now would be guessing at what the switches are.'
    ),
  frame('profile', { tall: true, nav: null, cap: 'No tab bar: Profile is pushed from the avatar, so it gets a back gesture rather than a destination slot.' })
)}

${sec(
  'fridge',
  'Screen 3 · now its own destination',
  'Fridge',
  'The fridge is a tab in its own right. Three groups, told apart by shape and by words, not by colour.',
  r2note(
    'Separate section for fridge',
    'It was a long group inside a longer Kitchen scroll. Now it is the destination, and <b>"Kitchen" stops existing as a word in the app</b>. The shopping list became its own screen with four doors into it, and Stock stayed where it was — one Staples row at the bottom, which is honest about how much it is worth right now.'
  ) +
    chg(
      'I bought a chocolate and will put it in my fridge',
      '<b>Personal</b> rows carry the owner\'s initials, a dashed left rail, and the words "Ayan\'s · he paid ₹90 · not shared". His own spend, never the kitty.'
    ) +
    chg(
      'Ayan will be doing the dishes. He will add those if he had put some extra food in the fridge',
      '<b>Leftovers</b> get a bowl glyph, a hatched row, who cooked it and when, and an eat-by badge. Different geometry from the other two, so a colourblind reader and a black-and-white print both still work.'
    ) +
    r2note(
      'Barcode scanning',
      'There is now an <b>Add a product</b> row at the bottom of Staples, and it opens with a scanner. Drawn on the right — <i>with a condition printed on the screen</i>, because whether barcode data exists for Amul and Aashirvaad packs is still being tested.'
    ),
  frame('fridge', { tall: true, nav: 'Fridge', cap: 'One scroll, three labelled groups, and the shopping list promoted to a card at the top.' }) +
    frame('shopping', { tall: true, nav: null, cap: 'The shopping list as its own screen. Note the group fed by tonight\'s meal plan.' }) +
    frame('addProduct', { tall: true, nav: null, cap: 'Add a product — scan first, type second. The condition on it is printed on the screen.' })
)}

${sec(
  'meals',
  'Screen 4 · a new feature',
  'Meals, and the cook',
  'Whoever is on dishes tells the cook what to make and gets what is missing onto the list. You asked for a reminder, and for it to show on the home screen.',
  r2note(
    'Modelled as a role, not a chore name',
    'A duty carries a <b>"plans the meals"</b> switch. Today\'s planner is whoever is assigned that duty — the app never looks for the word "dishes". Rename the chore, or move meal-planning to cooking, and nothing breaks.'
  ) +
    `<div class="chg"><p class="b"><b>With a two-person duty, both of you can write it</b>, and the last one to write wins. This is a note to the cook, not a ledger, so overwriting is fine — unlike money, which is append-only forever.</p></div>
     <div class="chg"><p class="b"><b>The groceries half:</b> the plan is checked against the fridge and the staples, and anything it cannot find is offered as one button onto the shopping list. That is the only automatic path onto the list; everything else is typed by a person.</p></div>
     <div class="chg"><p class="b"><b>Where the reminder lives:</b> on the planner's own home, as the card with two empty fields. It is not a push notification — notifications are being worked out separately.</p></div>`,
  frame('meals', { tall: true, nav: null, cap: 'The planner\'s view. Everyone else sees the same two lines read-only on Home.' })
)}

${sec(
  'duties',
  'Screen 5',
  'Duties',
  'ref-1\'s date strip lands here. Skip is gone, Swap is now Offer → Claim, and co-assignment has been redrawn because we had it wrong.',
  r2note(
    'Two people means together, not alternating',
    'You wrote: <i>"what I meant by two people is that one duty will be fulfilled by two people. e.g., Adnan and me one day, Ayan and Ansh the other day."</i> We drew them taking turns. Wrong, and it is fixed: <b>one duty, one block, two rows on the same day</b>. Adnan has ticked his, yours is open. Each of you earns the points separately, each of you can be missed separately, and your partner is the obvious voucher.'
  ) +
    r2note(
      'Photos on a duty',
      'You asked for <i>"an option to add photos if someone didnt do his duty correctly."</i> It attaches to the <b>turn</b>, not to the person, and anyone can add one. The row says how many and who added it — no "report", no flag, no red. Same discipline as the Missed row: a record, not an accusation.'
    ) +
    chg(
      'only the assigned person ticks their own duty, and anyone else can vouch it was done',
      'Someone else\'s row gets a <b>muted ring with no press feedback</b> and their name beside it — never a tap that gets rejected. Once done, a <b>Vouch</b> pill appears.'
    ) +
    `<div class="chg"><p class="q">Skip is gone</p><p class="b">A skip and a no-show already produced identical output from the fairness engine, so Skip was a word that bought nothing while making "formally decline a chore" a one-tap action. <b>Missed</b> replaces it and is <b>computed, never recorded</b>. Old skip rows in the ledger stay valid.</p></div>
     <div class="chg"><p class="q">Swap became Offer → Claim</p><p class="b">Two-sided, so nobody is volunteered. If nobody takes it by the due date it is missed like any other — the offer protects nobody. On a pair duty you offer <i>your half</i>.</p></div>`,
  frame('duties', {
    tall: true,
    nav: 'Duties',
    cap: 'The pair block, a photo on a done row, the single Offer swipe panel, an open offer with Take it, and a missed row.',
  })
)}

${sec(
  'manage',
  'Screen 6 · reworked, not restyled',
  'Manage duties',
  'You said plainly that you did not like the structure of the add-duty screen. It is a different screen now, in two parts.',
  r2note(
    'The list comes first',
    'You wrote: <i>"I honestly didn\'t like the structure and ui of the add duties things, we can have rework on it."</i> Manage now <b>opens on the four duties this flat actually runs</b>; tapping one edits it; <b>Add a duty</b> is a separate button at the top. Before, it opened on an empty form — the rarest thing you do here.'
  ) +
    `<div class="chg"><p class="b"><b>The form is grouped, not stacked.</b> Three cards instead of one column of chip rows: <i>when and what it is worth</i>, <i>who does it</i>, <i>what else it carries</i>. The same fields, in a shape you can skim.</p></div>
     <div class="chg"><p class="b"><b>It shows you the rota it is about to make.</b> Pick "2 at once" and six names, and the form prints Wed Adnan + Sahid / Thu Ansh + Ayan / Fri Anant + Jatin before you save. That is the actual rework — a form that tells you the consequence instead of making you imagine it.</p></div>
     <div class="chg"><p class="b"><b>The rota is pairs now</b>, three rows not six, with the grab handle on each pair. "I can't have Monday because of college" means dragging your pair down one row, and it is still a permanent change — distinct from an Offer, which is one instance, once.</p></div>
     <div class="chg"><p class="b"><b>Retire, never delete.</b> Deleting a duty would rewrite history the points were earned from, so an old duty goes to a Retired list and its rows stay in the ledger.</p></div>`,
  frame('manageList', { tall: true, nav: null, cap: 'Manage, part one — the list of duties, with Add as its own button.' }) +
    frame('editDuty', { tall: true, nav: null, cap: 'Part two — the reworked form, with "how many at once", the meals switch, and the live rota preview.' })
)}

${sec(
  'spending',
  'Screen 7',
  'Spending',
  'ref-2\'s vocabulary — 2-up stat tiles, big figures, the dot-matrix grid — with two of your references deliberately declined. The reasons are printed on the phone so you can overrule them.',
  chg(
    'I liked this kind of stats and graphic',
    'Four tiles 2-up and <b>exactly one filled</b>. The fill has a reason — it is the one you picked, and it redraws the chart above.'
  ) +
    `<div class="chg"><p class="q">Declined · ref-2's trend curve</p><p class="b">No axis, no units; decoration over bars that already say the same thing. If a trend line is wanted later it gets its own card, with real dots and a date axis.</p></div>
     <div class="chg"><p class="q">Declined · ref-5's progress ring</p><p class="b">A ring says "% of a goal". The kitty has no goal, it has a balance.</p></div>
     <div class="chg"><p class="b"><b>By store, not by category.</b> The audit found the category chart is a single bar labelled "Other" in every month, forever, because nothing in the app can set a category.</p></div>`,
  frame('spending', { tall: true, nav: 'Spending', cap: 'Four tiles with one filled, a bare bar chart, the dot grid, and the store split.' })
)}

${sec(
  'import',
  'Screen 8',
  'Import, merged',
  'One entry, one reader. Round two removed the thing you did not like about it.',
  r2note(
    'The store picker is gone',
    'You wrote: <i>"what I didn\'t like how we are showing the options of \'where from\'."</i> The right fix turned out to be deletion rather than restyling: <b>the reader already tells us the store from the bill</b>, so six chips were asking you a question the app could answer itself. It is one confirm line now — <b>"Blinkit · 7 Oct · ₹1,180 — read off the bill, tap to change"</b> — and it only costs you a tap when it gets it wrong.'
  ) +
    r2note(
      'The bill is kept',
      'You asked for the records. <b>spend.receipt_path</b> has existed in the schema since day one and nothing has ever written to it — the photo the reader looks at is thrown away. Now it is kept and shows on the statement row, so "₹1,180? what was that?" has an answer.'
    ) +
    `<div class="chg"><p class="q">11pm. Ayan orders ₹1,180: ₹700 of flat groceries, ₹480 of his own chips and Coke.</p><p class="b">The per-line <b>Flat | Mine</b> toggle. "Mine" drops the line from the kitty <i>and</i> from the total, so the saved figure still matches his bank statement.</p></div>
     <div class="chg"><p class="b"><b>What is still not possible:</b> reading a cart or an order. None of Zepto, Blinkit, BigBasket or JioMart has a public API and their terms forbid scraping it. Widening the reader to all of them is an afternoon's work; a real integration is not.</p></div>`,
  frame('importx', { tall: true, nav: null, cap: 'No store grid. One detected line, the per-line Mine toggle, and the bill kept.' })
)}

${sec(
  'money',
  'Screen 9 · three missing features',
  'Moving out, away and guests',
  'All three change what somebody pays, and none of them exists in the app today.',
  r2note(
    'Moving out',
    'Nothing in the app can write a leaving date, and there is no final-settle screen, so "Jatin\'s lease ends on the 20th and he wants his money" happens on WhatsApp. Pick the date, see the arithmetic, freeze it. The wording follows the house rule — <b>"Jatin gets back ₹460"</b>, never "owes".'
  ) +
    r2note(
      'Guests',
      'The mirror of Away, which is why they are drawn side by side. A guest-night adds <b>one person-day to the host\'s share</b> and nobody else\'s — Adnan\'s cousin stays four nights, Adnan pays about ₹210 more, everyone else is untouched. Same month-close guard as an absence: you cannot log a guest into a closed month.'
    ) +
    `<div class="chg"><p class="b"><b>Away has never been drawn before</b>, even though it is built. It is here so the symmetry is visible: one pauses your share, the other adds to it, and they are the same form.</p></div>`,
  frame('movingOut', { tall: true, nav: null, cap: 'Moving out — the date, the arithmetic, and the frozen figure.' }) +
    frame('away', { tall: true, nav: null, cap: 'Away — your share pauses.' }) +
    frame('guests', { tall: true, nav: null, cap: 'Guests — the same form, the sign flipped, charged to the host.' })
)}

<section class="blk" id="sheet">
  <div class="colL">
    <p class="num">Screen 10</p>
    <h2>The + sheet</h2>
    <p class="one">Pinterest's three-tile sheet, at four. A short sheet rising from the bottom with a grab handle, a close, and labelled rounded-square tiles.</p>
    ${r2note(
      'It grows out of the + button',
      'You wrote: <i>"the animation should look like coming from the + icon/button."</i> The sheet\'s <b>transform-origin is the + circle itself</b> — bottom-right, where your thumb just was — so it scales up from that point rather than sliding in from the bottom edge. Reversed on close. 240&nbsp;ms, no bounce; under reduced motion it cross-fades in place. The dashed circle on Option A marks the origin.'
    )}
    ${chg(
      'tap the centre +, a squarish rounded-corner menu comes up',
      'Exactly that. <b>Every tile is labelled</b> — "Top up" and "Log a spend" are indistinguishable at 24pt as icons, and always will be.'
    )}
    <div class="chg"><p class="q">Declined · the radial / arc menu</p><p class="b">No app in the sweep ships one. The + sits at the bottom-centre, so an arc puts half its targets under your own knuckle and the other half out of reach without regripping.</p></div>
    <div class="chg"><p class="b"><b>The tile is role-aware.</b> For Sahid "Pay Ansh ₹2,000" (the upi:// link); for Ansh "Record a top-up".</p></div>
  </div>
  <div class="colR"><p class="one" style="max-width:380px;color:var(--pgm);font-size:13.5px">Both versions of the sheet are drawn in <a href="#nav">the nav question</a> above, since the difference between the two nav options <i>is</i> what the sheet contains.</p></div>
</section>

${sec(
  'empty',
  'Screen 11',
  'Empty states',
  'Buddy\'s template: one drawn object → headline → one line of body → <b>one</b> action, never two. Two of the five are drawn here.',
  `<div class="chg"><p class="b"><b>One line-drawn object in one colour</b> — an empty bowl, a flat wallet. A stroked SVG works in both modes and leaves the accent free for the button.</p></div>
   <div class="chg"><p class="b"><b>The second has no button on purpose.</b> "Nobody's out of pocket" is good news, not a task.</p></div>
   <div class="chg"><p class="b">The other three, already written: Kitty in a new month, Duties all done, and a month with no entries (<i>View another month</i> as a text link, not a button).</p></div>`,
  frame('emptyFridge', { nav: 'Fridge', cap: 'The fridge, empty. One object, one headline, one line, one button.' }) +
    frame('emptyReimburse', { nav: null, cap: "Ansh's reimburse list, empty. Deliberately no button." })
)}

<section class="blk" id="open">
  <div class="colL" style="flex:1 1 100%;position:static;min-width:0">
    <p class="num">Honest list</p>
    <h2>Still open — what this concept does not answer</h2>
    <p class="one" style="max-width:84ch">Not settled by these screens. The first three are new questions that round two created.</p>
    <p class="one" style="max-width:84ch;color:var(--pgm)"><b>Closed since the last version:</b> the Suraj question (Skip is gone, so there is nothing for it to show); guests, moving out and the kept receipt, all now drawn.</p>
    <ul class="openlist">
      <li class="hot"><b>Does the kitty tile carry enough weight?</b>
        <em>Asked on screen 1. The hero shrank because you asked it to, but nav Option A depends on Home always being the door to the ledger. A brass tile is a door. <b>Your call, and it is the one thing on this page I would not ship without hearing back on.</b></em></li>
      <li class="hot"><b>Where does the morning summary come from?</b>
        <em>Two honest options. <b>Templated</b> from facts the app already has — free, instant, offline, and it will read the same by the third week. <b>An LLM call</b> each morning — warmer and more varied, about ₹1 a day for six people, needs a network, and can be wrong in a way a template cannot. Either way the rules are the same: never name another mate's miss, never rank anyone, never say "owe", never repeat the alert card. <b>Which?</b></em></li>
      <li class="hot"><b>Is "Kitchen" gone for good?</b>
        <em>Making the fridge its own section means the word Kitchen no longer labels anything — the fridge, the shopping list and the meals are three separate places. That is cleaner, but if you think of them as one thing, say so and they get a hub screen instead.</em></li>
      <li><b>Barcode data</b><em>The scan button on Add a product is drawn, and whether a lookup exists for the packs this flat buys is still being tested. If the hit rate is poor the button goes and the typing stays. Nothing else on the page depends on it.</em></li>
      <li><b>Where duty photos live</b><em>Drawn storage-agnostic. Size limits, who can delete one, and how long they are kept are all undecided — and "who can delete" is the one that matters, because a photo of a dirty floor is evidence until the person it is about removes it.</em></li>
      <li><b>Notifications</b><em>You asked for proper notifications for everything. Being worked out separately; the Profile row is a door to a screen that is not drawn.</em></li>
      <li><b>Bills — rent, electricity, Wi-Fi, the maid</b><em>Still split on WhatsApp, still out of scope. Two in-rules shapes exist (pay them from the kitty and raise the ₹2,000, or a second pot with its own holder) and it is a scope decision, not a design one.</em></li>
      <li><b>The product metadata fork</b><em>Category, minimum quantity, base unit and pack size have no writer anywhere in the shipped app. That is why Spending shows stores instead of categories and the fridge shows "7 left" rather than "1 L". The barcode scan would fix a lot of this at once, which is another reason the data test matters.</em></li>
      <li><b>Deep links into Zepto and Blinkit</b><em>Drawn on the shopping list as "Open in Blinkit". Whether the app lands on the search results or just its own home screen is <b>unverified</b> and needs one tap on a real phone.</em></li>
      <li><b>Compareify</b><em>It is <b>Comparify</b>, it is real, and it takes no payments — it hands you to Zepto. There is no card to add and no catalogue to buy.</em></li>
      <li><b>Motion</b><em>The + sheet's origin is specified above. ref-6's card-expanding-into-a-sheet is the language for the rest, and a still page cannot show it — the three places it goes (a pool entry, a duty row, a month card) are decided; the animation is not drawn.</em></li>
    </ul>
  </div>
</section>

<script>
(function(){
  var root=document.documentElement,btn=document.getElementById('modebtn'),lbl=document.getElementById('modelbl');
  var sys=matchMedia('(prefers-color-scheme: dark)');
  function cur(){return root.dataset.mode || (sys.matches?'dark':'light');}
  function paint(){lbl.textContent = cur()==='dark' ? 'Light' : 'Dark';}
  btn.addEventListener('click',function(){root.dataset.mode = cur()==='dark'?'light':'dark';paint();});
  sys.addEventListener('change',paint); paint();
  var links=[].slice.call(document.querySelectorAll('nav.idx a'));
  var obs=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){links.forEach(function(a){a.classList.toggle('on',a.getAttribute('href')==='#'+e.target.id)})}})},{rootMargin:'-10% 0px -80% 0px'});
  document.querySelectorAll('section.blk').forEach(function(s){obs.observe(s)});
})();
</script>
</body></html>`;

const target = path.join(__dirname, 'concept.html');
fs.writeFileSync(target, html);
console.log('wrote', target, html.length, 'bytes');

let bad = 0;
PAIRS.forEach(([name, a, b, min]) => {
  [['light', L], ['dark', D]].forEach(([mode, t]) => {
    const v = r2(t[a], t[b]);
    if (v < min) (bad++, console.log('FAIL', mode, name, v, '<', min));
  });
});
console.log(bad ? bad + ' contrast failures' : 'all ' + PAIRS.length * 2 + ' contrast pairs pass');
