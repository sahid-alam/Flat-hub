# FlatHub design system: V3

A warm near-black canvas, soft cards with 24px corners, Bricolage numerals for money, and pill buttons.
Brass is the only metallic and appears once per screen. The palette is the one he accepted in
`docs/design/concept.html`; every hex in this file is lifted from `docs/design/concept-gen.js` rather
than re-picked by eye, and every ratio below is measured by `docs/design/tokens-contrast.js`.

Everything lives in `src/ui/kit.tsx`. Screens import from `@/ui/kit` and never hard-code colours or font families.

## Modes

- **Both modes are first class.** Dark is a warm near-black (not the V2 onyx); light is a warm ivory. The
  phone setting picks one (`useColorScheme`).
- Block fills (stone, brass, sage) are the same in both modes and always carry onyx ink. That is why both
  modes feel like the same app.
- Web shell: `public/index.html` paints `#15130F`, or `#F6F3EE` under `prefers-color-scheme: light`, before
  JS loads. Those two hexes are the `ground` token — keep them in step or the app flashes the wrong canvas.

## Tokens (`tokens.dark` / `tokens.light`, read with `usePalette()`)

| Token | Dark | Light | Use |
|---|---|---|---|
| ground | #15130F | #F6F3EE | screen background |
| surface | #221F19 | #FFFFFF | default card (Recent, forms) |
| raised | #2C2821 | #EDE8DF | one step up: chips, tiles, the nav's resting capsule |
| sunk | #38332B | #E3DCCF | one step above raised: a field inside a raised block, a bar's track |
| line | #857C6C | #8A8275 | interactive borders (≥3:1) |
| hair | #302C25 | #E4DED2 | dividers only |
| edge | transparent | #E4DED2 | surface card outline (light only) |
| ink | #F2EDE3 | #1A1714 | text |
| muted | #ACA394 | #5E574C | secondary text |
| accent | #C9A45C | #C9A45C | brass **fill** |
| accentText | #DCBE80 | #7A5C22 | brass as text/icon (each mode needs its own) |
| onAccent | #15130F | #1A1714 | ink on brass |
| positive | #7FCB9F | #196740 | topped up, reimbursed, "Get back", coupon −₹50 |
| positiveBg | #17291E | #E4F1E8 | fill behind a positive badge; `positive` is the text on it |
| negative | #F0998A | #A83421 | failed saves and reversal rows **only** |
| negativeBg | #2F1B16 | #F8E3DE | fill behind a clay badge |
| onNegative | #15130F | #F6F3EE | ink on the destructive pill |
| mark | #C9A45C | #1A1714 | logo |
| solid / onSolid | #F2EDE3 / #15130F | #1A1714 / #F6F3EE | default pill, toast |
| warnBg / warnFg | #2D2616 / #E6C184 | #F6EBD6 / #6B4E12 | warm neutral bar ("Off by ₹14") |
| navActive / navRest | #302C25 / #1E1B16 | #FFFFFF / #EAE4D9 | the floating nav's two capsules |
| scrim | rgba(5,4,3,.64) | rgba(26,23,20,.5) | behind sheets |

Blocks (`tokens.block`): stone #E3DCCF, brass #C9A45C, sage #7FCB9F, onyx #1A1714, onyxMuted #3A342B.

### Measured contrast

Printed by `node docs/design/tokens-contrast.js`, which exits non-zero if a pair misses its minimum.
Body text needs 4.5:1; large text and interactive borders need 3:1. Change a token, re-run it, paste
the table back here.

| Pair | Light | Dark | Min |
|---|---|---|---|
| Body text on the canvas | 16.13 | 15.90 | 4.5 |
| Body text on a card | 17.85 | 14.08 | 4.5 |
| Body text on a chip or tile | 14.63 | 12.56 | 4.5 |
| Body text on a sunk field | 13.09 | 10.74 | 4.5 |
| Secondary text on the canvas | 6.45 | 7.44 | 4.5 |
| Secondary text on a card | 7.13 | 6.59 | 4.5 |
| Secondary text on a chip or tile | 5.85 | 5.88 | 4.5 |
| Secondary text on a sunk field | 5.23 | 5.02 | 4.5 |
| Brass as text on the canvas | 5.61 | 10.35 | 4.5 |
| Brass as text on a card | 6.21 | 9.17 | 4.5 |
| Brass as text on a chip or tile | 5.09 | 8.18 | 4.5 |
| Ink on the brass pill | 7.61 | 7.91 | 4.5 |
| Ink on the default pill | 16.13 | 15.90 | 4.5 |
| Ink on the destructive pill | 5.97 | 8.51 | 4.5 |
| "Get back" green on the canvas | 6.21 | 9.67 | 4.5 |
| "Get back" green on a card | 6.87 | 8.56 | 4.5 |
| "Get back" green on a chip or tile | 5.63 | 7.64 | 4.5 |
| "Get back" green on its own badge | 5.91 | 7.98 | 4.5 |
| Clay on a card | 6.61 | 7.53 | 4.5 |
| Clay on a chip or tile | 5.41 | 6.72 | 4.5 |
| Clay on its own badge | 5.36 | 7.47 | 4.5 |
| "Off by" text on its warm bar | 6.53 | 8.80 | 4.5 |
| Active tab label on its capsule | 17.85 | 11.90 | 4.5 |
| Resting tab icon on its capsule | 5.64 | 6.88 | 3.0 |
| Interactive border on the canvas | 3.43 | 4.50 | 3.0 |
| Interactive border on a card | 3.80 | 3.99 | 3.0 |
| Interactive border on a chip or tile | 3.11 | 3.56 | 3.0 |
| Divider on a card (no AA minimum) | 1.34 | 1.18 | — |

| Pair (both modes) | Ratio | Min |
|---|---|---|
| Onyx ink on a stone block | 13.09 | 4.5 |
| Onyx muted on a stone block | 9.03 | 4.5 |
| Onyx ink on a brass block | 7.61 | 4.5 |
| Onyx muted on a brass block | 5.25 | 4.5 |
| Onyx ink on a sage block | 9.30 | 4.5 |
| Onyx muted on a sage block | 6.42 | 4.5 |
| "Get back" green on a stone block | 5.04 | 4.5 |

Three notes on the numbers:

- **V2's light caveat is gone.** `positive` on `raised` was 4.39:1 in V2 and is 4.36:1 at the concept's
  `#1F7A4D`. Light `positive` is two steps darker at `#196740`, which clears AA on ground, surface, raised,
  sunk and its own badge — so "Get back" green needs no rule about where it may sit. This is the one hex
  that is not the concept's.
- **`line` is not for `sunk`.** Interactive borders measure 3.11–4.50:1 on ground, surface and raised, but
  2.79:1 (light) and 3.04:1 (dark) on `sunk`. A field inside a raised block gets its edge from the fill
  step, not from a border.
- **`accent` is a fill, never text in light mode** (2.12:1 on ground). `accentText` is the readable brass.

## Type

| Role | Font | Notes |
|---|---|---|
| Logo, month names | Righteous 400 (`MARK`) | No ₹ and no tabular digits, so never use it for amounts. |
| Amounts | Bricolage Grotesque 800 (`DISPLAY`; 700 is `DISPLAY_SEMI`) | Use `lining-nums tabular-nums`. |
| UI | Manrope 500/600/700/800 (`UI['500'…'800']`) | 800 carries headings and section caps. |

The scale came down about 10–15% from V2 — a notch, not a collapse:

| Role | V2 | V3 |
|---|---|---|
| Hero amount (`Hero`, `MagnetNumerals`) | 80 | **68** |
| Amount field (`Field big`) | 34 | **30** |
| Card figure (screens pass this to `Hero`) | 40 | **34** |
| `Heading` | 22 | **20** (Manrope 800, −0.4 tracking) |
| Row label, date field | 17 | **15.5** |
| Row amount, tile detail (`<T num>`) | 17 | **15.5** |
| Body / default `<T>` | 17 | **15** |
| Button label | 17 | **15.5** |
| Input text | 18 | **16.5** |
| Choice chip | 16 | **14.5** |
| Tile title | 16 | **14.5** |
| Field label, month-card status | 15 | **13.5** |
| Toast, error text | 15 | **14** |
| Caption, legend (`soft`) | 13 | **12** |
| Avatar name | 12 | **11** |
| Status chip (`Chip`) | 12 | **11.5** |
| Section caps (`SectionLabel`) | 12 / 1.9 tracking | **11.5 / 1.4** (Manrope 800) |

Weight is carried in the family name (`Manrope_600SemiBold`). **Never set `fontWeight`** with these fonts:
web would synthesise a fake bold, and Android would fall back to the system font. A new weight also has to
be loaded in `src/app/_layout.tsx` — that is where `Manrope_800ExtraBold` is registered.

Format money with `formatINR` (Indian grouping, paise only when non-zero). On a hero, the ₹ is 0.6× size
and top-aligned.

## Components (`@/ui/kit`)

- `Screen({ scroll?, padBottom? })` sets ground, a 16px gutter and a 560px max width. Use `padBottom` to clear a floating pill (e.g. 56 + 20).
- `Block({ tone?: 'surface'|'raised'|'stone'|'brass'|'sage', onPress?, accessibilityLabel?, style? })` is a 24px-radius flat block with no shadow. Stone, brass and sage switch the text inside to onyx automatically (ink context). With `onPress` it's a doorway with a 0.97 press scale.
- `Slip({ magnet?, style? })` is the legacy name for a surface Block. `magnet` is ignored.
- `T({ size?, weight?, soft?, color?, center?, num?, numberOfLines?, style? })` is text, 15px by default. `num` switches it to Bricolage 800 for amounts.
- `Heading` is Manrope 800 at 20px. `SectionLabel({ color? })` gives spaced caps (IN THE KITTY, RECENT).
- `Logo({ size?=36, color? })` stacks FLAT/HUB in Righteous: brass on dark, ink on light.
- `Hero({ paise, size?=68, color?, maxWidth?=300 })` is the big amount with a small top-aligned ₹. It shrinks to fit the width. `MagnetNumerals({ paise, size? })` is an alias.
- `Position({ paise, size? })` shows a signed position: positive when the kitty owes you, ink otherwise. Never red.
- `Pill({ label, style? })` is an outlined, non-interactive capsule ("₹11,400 · 41 entries").
- `Chip({ kind: 'pool'|'pending'|'reimbursed'|'late', label? })` shows a status in words: Pool, Own pocket · pending, Reimbursed, added late.
- `Avatars({ mates: { name, done }[] })` shows initials with a ✓ or ○ badge, plus the legend. The order is always alphabetical, with no amounts.
- `Toast({ message, onUndo?, undoLabel?, style? })` uses the wording "Dahi ₹30 logged" plus Undo. Undo writes a reversal entry and never deletes. The caller positions it.
- `MonthCard({ month, pill, status, tone?='stone', onPress?, height?=200 })` is a statements-stack card. The month name is uppercase Righteous, sized to fit the width, and bleeds slightly off the bottom edge.
- `MagnetButton({ label, onPress, color?, icon?, disabled?, outline? })` is a pill of at least 56pt. `color="brass"` gives the one accent pill on a screen, `"negative"` a destructive action (its label is `onNegative`, because onyx on clay is only 2.70:1 in light), and anything else the solid ink pill. When disabled it shows a raised fill with muted text and has real `disabled` set.
- `Choice({ options, value, onChange, fill?, label? })` renders 48pt pill chips. The selected chip gets a check and an ink outline. `fill` makes it a segmented switch (three options at most).
- `Tile({ title, detail?, on?, onPress })` is a favourite tile. They all share one raised fill, and the picked tile turns brass with a check.
- `Field`, `DateField`, `Row`, `Rule`, `ErrorText`, `StarToggle` and `Icon` keep the same API as before.
- `Screen({ footer })` pins its footer under the scroll and above the keyboard, so the button that commits a long form never scrolls away. `Sheet({ title, onClose, footer? })` is the one-question bottom sheet (rule 11); its default footer is Done. A settings screen is `Row`s that read back their answers, each opening a `Sheet`.
- `useInk()` returns `{ ink, muted, positive }` for the current block, for custom drawing inside blocks. A filled block keeps one fill in both modes, so `positive` is the block's readable green (onyx on brass and sage), not the palette's.

### The shell and Home (V3)

- **`CapsuleNav`** (`src/ui/navbar.tsx`) is the floating nav: one `navRest` capsule holding four absolutely positioned slots — Home · Fridge · Duties · Spending — with the active one expanded to a `navActive` pill carrying a filled `solid` icon badge and its label, and the + as a separate `solid` circle outside it. It floats 12pt above the safe area, inset from the edges, with content passing behind it and no shadow (rule 6). **Every slot is `position: 'absolute'`; it must never become a flex row** — a slot's position depending on its neighbours' widths is what made the measured row bulge 19px and snap 27.5px. `geom()` is pure arithmetic over four constants, so nothing is measured at runtime, and because exactly one slot is expanded the capsule's width never changes. Being a custom `tabBar`, it re-emits by hand everything the stock bar gave for free: `tablist`/`tab` roles, a spoken name on all four (they are icon-only), `aria-selected` (react-native-web 0.21 drops `accessibilityState.selected`, so the ARIA prop is passed explicitly), 48pt slots whatever the visual width, and DOM order left in design order so focus order survives.
- **`AddSheet`** (`src/ui/addsheet.tsx`) — see rule 11.
- **`StatTile({ cap, big | paise, sub, positive?, brass?, onPress? })`** is one of Home's three snapshot tiles. Pass `paise` for money: it draws with `Hero`, which shrinks the digits to the tile, because a five-figure kitty in a third of a 390pt screen truncates at any fixed size and a truncated rupee figure is a lie. The brass one is the kitty and is the screen's single accent.
- **`AlertCard({ title, detail, action, onPress })`** — Home shows **exactly one, or none**. Priority: the treasurer's "to pay back", then "to get back", then "your top-up isn't in yet".
- **`SummaryCard({ lines })`** draws `src/domain/summary.ts`'s output and renders nothing at all when there are no lines.
- **`TodayCard`**, **`Section`** and **`Strip`** are Home's remaining parts; `Strip` is the one horizontally scrolling row Quick add was shrunk into (`<QuickAdd compact />`).

The old fridge-door names (`enamel`, `paper`, `inkSoft`, `rule`, `green`, `tomato`, `blue`, `orange`,
`plum`, `onMagnet`) remain as aliases, repointed at the new palette, so untouched screens still compile.
New code uses the names in the table above.

## Rules

1. **Accent once per screen.** Brass appears as the logo, one brass block, or one brass pill.
2. **Clay (`negative`) means error.** Use it only for failed saves and reversal rows. Never for decoration, favourite tiles, or the "Off by" bar. The off-by bar uses `warnBg`/`warnFg`, and while lines don't add up the Save button is disabled and reads **"Save once lines add up"**.
3. **Colour always comes with a word.** Chips, Matched/New product and ✓/○ all carry text.
4. **No leaderboard.** Top-ups are initials with ✓/○ in fixed alphabetical order, with no amounts, dates or sorting.
5. **Words.** Write "Pay"/"Get back", not "owe", and "Not yet", not "Overdue". The Statement footer reads "Total ₹11,400".
6. **Depth** comes from surface steps (ground → surface → raised → sunk). There are no drop shadows.
7. **Targets** are at least 48px and every button is a pill. Cards use a 20–28px radius (blocks 24, month cards 26, tiles 20).
8. **The floating nav must not cover content.** Every tab screen passes `padBottom={TAB_BAR}` (72 = the capsule's 60 plus the 12 it floats); `Screen` adds the safe-area inset itself. `TAB_BAR` in kit must stay equal to `NAV_HEIGHT` in `src/ui/navbar.tsx`.
9. **Month names** are sized to fit the card width and must never look truncated on the right. They bleed only off the bottom.
10. **Motion** is 150–280ms ease-out with a press scale of 0.97. Honour reduced motion — Reanimated's `withTiming` does it for free (`ReduceMotion.System`), a CSS transition does not. Screens animate: `src/ui/stack.ts` / `stack.web.ts` platform-split so web gets `expo-router/js-stack`, which can animate, with `slide_from_right` on pushes and `slide_from_bottom` on modals, and `animation: 'shift'` on the tabs. There is no shared-element card expand (it doesn't run on web) and no `navigator.vibrate`.
11. **Add / quick-add.** The + in the floating nav opens **one custom sheet** — four labelled tiles that hand off to the existing modal routes (`spend`, `topup`, `import`, `shopping`). It grows out of the + circle (`transformOrigin` derived from the nav's own constants, nothing measured), because the owner asked for the animation to come from the button; a bottom-edge slide does not. It is the only sheet that grows from a button. Other bottom sheets are kit's `Sheet` (and Put away, built the same way): a single question that covers the screen instead of pushing anything on it, with the answer applied as it is picked, so closing never loses anything. Use one for picking one setting, as Edit duty's rows do. A whole form still uses a modal route. A radial or arc menu is rejected, and **destinations never go in it** (PATTERNS §7): the kitty is reached from Home's brass tile, the profile from the avatar.
12. **Statements** are a stack of `MonthCard`s, newest first. Tapping a card opens that month: spent, the Zepto vs Local split (two labelled values and one 2-segment bar), a Mate | Days | Share table in alphabetical order, and absences tagged "added late".
13. **Contrast** must be WCAG AA: text at least 4.5:1, borders and focus at least 3:1, in both modes. Add any new pair to `docs/design/tokens-contrast.js` and run it — don't eyeball it.

## Icons

The app icon, favicon, Apple touch and manifest icons show a brass **FH** monogram in Righteous on
`#121214`, and the splash shows the stacked FLAT/HUB mark in brass on the same. **These are still V2's
onyx and no longer match `ground` (#15130F).** They were drawn with PIL from the Righteous TTF in
`node_modules/@expo-google-fonts/righteous`; redrawing them on the new canvas is a separate job. The
maskable 512 icon keeps the monogram inside the 80% safe circle, and the Android foreground keeps it
inside the 66% safe zone.
