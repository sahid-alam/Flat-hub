# FlatHub design system: V2 "Card Stack"

Dark onyx canvas, flat colour blocks, monumental numerals, pill buttons, and month cards with giant month names.
Everything lives in `src/ui/kit.tsx`. Screens import from `@/ui/kit` and never hard-code colours or font families.

## Modes

- **Dark is the primary look** (Onyx & Brass). **Light is ivory** and follows the phone setting (`useColorScheme`).
- Block fills (stone, brass, sage) are the same in both modes and always carry onyx ink. That's why both modes feel like the same app.
- Web shell: `public/index.html` paints `#121214`, or `#F7F5F0` under `prefers-color-scheme: light`, before JS loads. The manifest, splash and Android icon background are `#121214`.

## Tokens (`tokens.dark` / `tokens.light`, read with `usePalette()`)

| Token | Dark | Light | Use |
|---|---|---|---|
| ground | #121214 | #F7F5F0 | screen background |
| surface | #1E1E21 | #FFFFFF | default block (Recent, forms) |
| raised | #2A2A2E | #EDE9E0 | one step up: top-ups block, chips, tiles |
| line | #74747B | #8A857B | interactive borders (≥3:1) |
| hair | #2E2E33 | #E4E0D6 | dividers only |
| edge | transparent | #E4E0D6 | surface block outline (light only) |
| ink | #EDEAE3 | #121214 | text |
| muted | #A39E94 | #5C574E | secondary text |
| accent | #C9A45C | #C9A45C | brass **fill** |
| accentText | #C9A45C | #7A5C22 | brass as text/icon (light needs the darker one) |
| onAccent | #121214 | #121214 | ink on brass |
| positive | #8FD0A6 | #1F7A4D | topped up, reimbursed, coupon −₹50 |
| negative | #F0A08C | #B3402A | failed saves and reversal rows **only** |
| mark | #C9A45C | #121214 | logo |
| solid / onSolid | #EDEAE3 / #121214 | #121214 / #F7F5F0 | default pill, toast |
| warnBg / warnFg | #2A2619 / #E6C890 | #F3EBDD / #6B4E12 | warm neutral bar ("Off by ₹14") |
| scrim | rgba(8,8,10,.66) | rgba(18,18,20,.40) | behind sheets |

Blocks (`tokens.block`): stone #E4E0D6, brass #C9A45C, sage #8FD0A6, onyx #121214, onyxMuted #2E2C28.

Checked contrast: ink/surface 13.8, muted/raised 5.4, line/raised 3.1, brass/raised 6.1, onyx on brass 8.0, stone 14.2 and sage 10.5, onyxMuted on brass 5.9, warnFg/warnBg 9.4 (dark) and 6.5 (light).
**Light caveat:** `positive` on `raised` is 4.39:1, so in light mode use positive text only on ground/surface. On raised, carry it with an icon plus ink text.

The old fridge-door names (`enamel`, `paper`, `inkSoft`, `rule`, `green`, `tomato`, `blue`, `orange`, `plum`, `onMagnet`) remain as aliases so untouched screens compile. New code uses the V2 names.

## Type

| Role | Font | Notes |
|---|---|---|
| Logo, month names | Righteous 400 (`MARK`) | Has no ₹ and no tabular digits, so never use it for amounts. |
| Amounts | Bricolage Grotesque 800 (`DISPLAY`; 700 is `DISPLAY_SEMI`) | Normal width, with no wdth axis on RN. Use `lining-nums tabular-nums`. The hero is 80px, card figures 40px, and row amounts 17–20px (`<T num>`). |
| UI | Manrope 500/600/700 (`UI['500'|'600'|'700']`) | Labels 15–17px, captions 13px, section caps 12px with 1.9px tracking. |

Weight is carried in the family name (`Manrope_600SemiBold`). **Never set `fontWeight`** with these fonts: web would synthesise a fake bold, and Android would fall back to the system font.
Format money with `formatINR` (Indian grouping, paise only when non-zero). On a hero, the ₹ is 0.6× size and top-aligned.

## Components (`@/ui/kit`)

- `Screen({ scroll?, padBottom? })` sets ground, a 16px gutter and a 560px max width. Use `padBottom` to clear a floating pill (e.g. 56 + 20).
- `Block({ tone?: 'surface'|'raised'|'stone'|'brass'|'sage', onPress?, accessibilityLabel?, style? })` is a 24px-radius flat block with no shadow. Stone, brass and sage switch the text inside to onyx automatically (ink context). With `onPress` it's a doorway with a 0.97 press scale.
- `Slip({ magnet?, style? })` is the legacy name for a surface Block. `magnet` is ignored.
- `T({ size?, weight?, soft?, color?, center?, num?, numberOfLines?, style? })` is text. `num` switches it to Bricolage 800 for amounts.
- `Heading` is Manrope 700 at 22px. `SectionLabel({ color? })` gives spaced caps (IN THE KITTY, RECENT).
- `Logo({ size?=36, color? })` stacks FLAT/HUB in Righteous: brass on dark, ink on light.
- `Hero({ paise, size?=80, color?, maxWidth?=300 })` is the giant amount with a small top-aligned ₹. It shrinks to fit the width. `MagnetNumerals({ paise, size? })` is an alias.
- `Position({ paise, size? })` shows a signed position: positive when the kitty owes you, ink otherwise. Never red.
- `Pill({ label, style? })` is an outlined, non-interactive capsule ("₹11,400 · 41 entries").
- `Chip({ kind: 'pool'|'pending'|'reimbursed'|'late', label? })` shows a status in words: Pool, Own pocket · pending, Reimbursed, added late.
- `Avatars({ mates: { name, done }[] })` shows initials with a ✓ or ○ badge, plus the legend. The order is always alphabetical, with no amounts.
- `Toast({ message, onUndo?, undoLabel?, style? })` uses the wording "Dahi ₹30 logged" plus Undo. Undo writes a reversal entry and never deletes. The caller positions it.
- `MonthCard({ month, pill, status, tone?='stone', onPress?, height?=200 })` is a statements-stack card. The month name is uppercase Righteous, sized to fit the width, and bleeds slightly off the bottom edge.
- `MagnetButton({ label, onPress, color?, icon?, disabled?, outline? })` is a pill of at least 56pt. `color="brass"` gives the one accent pill on a screen, `"negative"` a destructive action, and anything else the solid ink pill. When disabled it shows a raised fill with muted text and has real `disabled` set.
- `Choice({ options, value, onChange })` renders 48pt pill chips. The selected chip gets a check and an ink outline.
- `Tile({ title, detail?, on?, onPress })` is a favourite tile. They all share one raised fill, and the picked tile turns brass with a check.
- `Field`, `DateField`, `Row`, `Rule`, `ErrorText`, `StarToggle` and `Icon` are restyled with the same API as before.
- `useInk()` returns `{ ink, muted }` for the current block, for custom drawing inside blocks.

## Rules

1. **Accent once per screen.** Brass appears as the logo, one brass block, or one brass pill.
2. **Clay (`negative`) means error.** Use it only for failed saves and reversal rows. Never use it for decoration, favourite tiles, or the "Off by" bar. The off-by bar uses `warnBg`/`warnFg`, and while lines don't add up the Save button is disabled and reads **"Save once lines add up"**.
3. **Colour always comes with a word.** Chips, Matched/New product and ✓/○ all carry text.
4. **No leaderboard.** Top-ups are initials with ✓/○ in fixed alphabetical order, with no amounts, dates or sorting.
5. **Words.** Write "Pay"/"Get back", not "owe", and "Not yet", not "Overdue". The Statement footer reads "Total ₹11,400".
6. **Depth** comes from surface steps (ground → surface → raised). There are no drop shadows.
7. **Targets** are at least 48px and every button is a pill. Cards use a 20–28px radius (blocks 24, month cards 26, tiles 20).
8. **The floating + Add pill must not cover content.** Give the screen `padBottom` equal to the pill height plus its offset and the safe area.
9. **Month names** are sized to fit the card width and must never look truncated on the right. They bleed only off the bottom.
10. **Motion** is 150–250ms ease-out with a press scale of 0.97. Honour reduced motion. There is no shared-element card expand (it doesn't run on web) and no `navigator.vibrate`.
11. **Add / quick-add** use the existing modal routes (`spend`, `topup`, `import`) presented as bottom-sheet-style modals. There is no custom sheet.
12. **Statements** are a stack of `MonthCard`s, newest first. Tapping a card opens that month: spent, the Zepto vs Local split (two labelled values and one 2-segment bar), a Mate | Days | Share table in alphabetical order, and absences tagged "added late".
13. **Contrast** must be WCAG AA: text at least 4.5:1, borders and focus at least 3:1. Check any new pair before using it.

## Icons

The app icon, favicon, Apple touch and manifest icons show a brass **FH** monogram in Righteous on `#121214`. The splash shows the stacked FLAT/HUB mark in brass on `#121214`. They were drawn with PIL from the Righteous TTF in `node_modules/@expo-google-fonts/righteous`. The maskable 512 icon keeps the monogram inside the 80% safe circle, and the Android foreground keeps it inside the 66% safe zone.
