# Why FlatHub feels like a website

Investigation, October 2026. Every claim below is either a file:line from this repo / `node_modules`,
or a number measured in a browser against a running build. Nothing here is opinion dressed as fact.

Production code was not touched. Two throwaway git worktrees were used and deleted.

---

## 0. The verdict on the expanding-pill tab bar (read this first)

The owner picked a floating capsule nav: the active tab is its own wide pill (filled circular icon
badge plus text label), the other four sit in a second capsule as icons only, and on every switch the
outgoing pill collapses into the group while the incoming one expands out of it, both capsules resizing.

> **BUILDABLE WITH THIS COMPROMISE: build it as a FLIP — fix the final layout in one pass, then carry
> all motion with `translateX`/`scaleX` — never by animating `width`.** Frame rate was never the
> constraint; all three constructions I built hold ~59fps at 6× CPU throttle. What breaks is that
> animating `width` on flex siblings makes the icon row bulge ~19px on every switch and snap **27.5px
> in a single frame** when someone taps twice quickly, where the FLIP build measured a flat **0px**.
> It needs a custom `tabBar`, which means re-adding `aria-label` / `aria-selected` / `role="tab"` by hand.

It is **not** an APK-only design. It will feel the same in the browser and in the APK, and the one
thing the APK adds — a real UI thread for the animation — is worth little for a bar this small.
**Cost: M** (~150 lines, one file).

Full evidence in [section D](#d-the-expanding-pill-tab-bar-in-full).

---

## 1. The headline: nothing in this app moves

```
$ grep -rn 'reanimated|Animated|withTiming|withSpring|LayoutAnimation|useSharedValue' src/
(no matches)
```

Zero animation code across 2,737 lines of UI. And on web, expo-router's `Stack` **cannot** animate,
by construction — so even the navigator's own transitions are absent.

### Measured, not assumed

| What I did | What happened |
|---|---|
| Clicked the Kitchen tab, sampled every frame for 400ms | Content swapped on **frame 0**. No transform, no opacity change. |
| Clicked Add → `/spend` (`presentation: 'modal'`), sampled 8 frames | "Add a spend" **fully rendered on frame 0**. No slide-up, no dim, no sheet. |
| Screenshotted `/spend` | A plain full-screen page with a chevron — visually identical to a push. The tab bar is simply gone. |
| `getComputedStyle` on every button and tab | `transition-duration: 0s`. The `scale(0.97)` press feedback is an instant jump. |
| `getComputedStyle` on the focused amount input | `outline: rgb(18,18,20) auto 2px` — the browser's own focus ring, a black rectangle on the ivory card. |
| `getComputedStyle` on the long-press-to-reverse row | `user-select: auto`, and no `-webkit-touch-callout` anywhere in the document. |
| `getComputedStyle` on html, body and the scroller | `overscroll-behavior: auto` on all three. |
| `navigator.serviceWorker.getRegistrations()` | `0`. |
| Cold reload, **production**, desktop warm wifi | LCP **686ms** (TTFB 244 + render delay 442). |
| Cold reload, **production**, 6× CPU + Slow 4G, 390×844 mobile | LCP **3,178ms** (TTFB 34 + render delay **3,144**). |

> A methodological note for whoever re-runs this: do **not** use `document.getAnimations().length` as
> evidence of "nothing is animating". React Native's `Animated` and Reanimated both mutate styles
> directly on web and never register a Web Animation, so that counter reads `0` even mid-flight. The
> frame-0 results above, and the per-frame transform samples in section D, are the real evidence.

---

## 2. Root cause, with file:line

- `react-native-screens/lib/module/components/ScreenStack.web.js` → `const ScreenStack = View`.
- `react-native-screens/lib/module/components/Screen.web.js` → toggles `display: none | flex`.
- `expo-router/build/layouts/Stack.web.js` → `_web-modal` → `BaseStack` → `StackClient`, the
  native-stack fork. So the `<Stack>` at `src/app/_layout.tsx:27` **is a `View` with display toggling**
  on web. `presentation: 'modal'` at `src/app/_layout.tsx:45,46,47,59` is a no-op.
- `expo-router/build/layouts/experimental-stack/index.web.js` explicitly falls back to that same Stack
  on web, with a comment saying so. Dead end.

**The escape hatch is already installed.** `expo-router/js-stack` is a published entry point
(`expo-router/package.json:55`) exposing the react-navigation JS *card* stack, vendored at
`expo-router/build/react-navigation/stack/`. It is built to animate on web:

- `.../stack/views/Stack/Card.js:56` — `const useNativeDriver = Platform.OS !== 'web'`
- `.../stack/views/Stack/CardStack.js:142-145` — animation defaults to `'none'` on web **by design**:
  *"Disable screen transition animation by default on web, windows and macos to match the native behavior."*
  It is opt-in; you must name an animation.
- Available names (`CardStack.js:49-63`): `default`, `fade`, `fade_from_bottom`, `fade_from_right`,
  `reveal_from_bottom`, `scale_from_center`, `slide_from_left`, `slide_from_right`, `slide_from_bottom`.

Tabs are the same story: `.../bottom-tabs/views/BottomTabView.js:65` handles web explicitly
(`useNativeDriver = Platform.OS !== 'web'`), `:112` defaults `animation: 'none'`, and presets `fade`
and `shift` exist. **That default has no platform guard, so tabs don't animate on the APK either.**

### Proof, from a throwaway worktree (created, measured, deleted)

| Change | Measured result |
|---|---|
| Tabs `animation: 'shift'` | Outgoing scene opacity 1→0 with translateX 0→−50px, incoming 50→0, over ~10 frames. |
| `/spend` `animation: 'slide_from_bottom'` | translateY **536.8 → 0** over ~20 frames (~330ms). A real sheet. |
| `/statement/[month]` `slide_from_right` | Incoming translateX **500 → 0**, outgoing parallax **0 → −125px** — the classic iOS 30%. |

Swipe-back, however, cannot work on web even with this: the file web resolves to,
`.../stack/views/GestureHandler.js`, exports `PanGestureHandler = Dummy` (a passthrough fragment) and
`GestureHandlerRootView = View`. `react-native-gesture-handler@2.32` is installed but the vendored
stack never imports it on web.

---

## 3. Cold start: the first impression, and it is a blank rectangle

`expo-splash-screen`'s non-native build is a **complete no-op**:

```js
// node_modules/expo-splash-screen/build/SplashScreen.js
export async function preventAutoHideAsync() { return false; }
export function hide() { }
export async function hideAsync() { }
```

So `src/app/_layout.tsx:15` and `:22` buy nothing on web, while `:95` (`if (!fontsLoaded) return null`)
and `:24` (`if (!ready) return null`) render nothing at all. The `app.json` splash config
(`backgroundColor: #121214`, `splash-icon.png`) applies only to native builds.

**What a flatmate actually sees on a mid-range Android on Indian mobile data:** I measured it rather
than guessing — 6× CPU throttle, Slow 4G, 390×844 mobile viewport, against production:

> **LCP 3,178ms. Render delay 3,144ms of that.** Over three seconds of flat `#121214`.

And that is the *optimistic* case: TTFB was only 34ms because the HTML came from cache. A genuinely
cold open adds DNS + TLS + TTFB on top. Contributing factors, all measured:

- The production bundle is a **single render-blocking file**: `entry-*.js`, **1.73 MiB raw / 475 KiB
  brotli**. `app.json` sets `web.output: "single"`, and `vercel.json` rewrites every path to
  `/index.html`, so every cold open and every deep link downloads the whole thing before anything paints.
- Chrome's FontDisplay insight reports **620ms of FCP available** from font loading alone — the six
  `@expo-google-fonts` faces gate the first paint through `_layout.tsx:95`.
- Zero service workers, so none of this is cached for the second open either.

**Yes — this is a large part of why it feels like a web page rather than an app.** A native app shows
its icon and splash in ~100ms because the OS draws them before any code runs. FlatHub shows a dark
void for three seconds and then snaps to a finished screen. That is exactly the shape of a slow website.

---

## A. Fixable in our code, on web — ranked by perceived quality per unit of effort

### A1 — Turn on the transitions already sitting in the bundle · **S** · web + APK
*The biggest win per unit of effort by a wide margin, and the frame data above proves it works.*

- **Symptom a flatmate would describe:** "Screens just blink. Tapping Add doesn't open anything, it
  replaces everything."
- **Cause:** `src/app/_layout.tsx:27` and `src/app/(tabs)/_layout.tsx:35`, plus the web defaults at
  `CardStack.js:142-145` and `BottomTabView.js:112`.
- **Fix:**
  1. `animation: 'shift'` in the tab `screenOptions` — **one line, and it helps the APK too**, since
     the `'none'` default there has no platform guard.
  2. **Platform-split the Stack import.** Add `src/ui/stack.ts` (re-exports `Stack` from `expo-router`)
     and `src/ui/stack.web.ts` (re-exports from `expo-router/js-stack`); Metro picks by platform.
     Then `animation: 'slide_from_right'` in the Stack `screenOptions` and `animation: 'slide_from_bottom'`
     on the three modal screens. ~8 lines total.
- **Do not swap the import globally.** `_layout.tsx` is shared, so a bare
  `import { Stack } from 'expo-router/js-stack'` would replace the APK's native
  UINavigationController / Fragment transitions with JS-driven ones — a regression on the very build
  that is meant to fix all this.
- **Unverified, check before shipping:** I never screenshotted the probe's header.
  `headerShadowVisible` and `headerBackButtonDisplayMode` (`_layout.tsx:31,33`) are native-stack
  options and may not carry over; `headerLeft: Back` does. Also, the slide-up `/spend` is still a
  full-screen card, not a dimmed-parent sheet — `CardStyleInterpolators.forModalPresentationIOS` is
  exported from `js-stack` if that look is wanted.

### A2 — Long-press is fighting iOS · **S** · web-only
*A functional bug on the one gesture the app teaches, not polish. Hence rank 2.*

- **Symptom:** "Holding an entry to reverse it just selects the text and pops up Copy / Look Up."
- **Cause:** `src/ui/activity.tsx:86-92` sets `onLongPress` and an `accessibilityHint` of
  "Long-press to reverse", but the row measures `user-select: auto` and there is no
  `-webkit-touch-callout: none` anywhere in the document. iOS races the app's 500ms long-press against
  its own selection magnifier and callout menu.
- **Fix:** in `public/index.html`, `#root { -webkit-user-select: none; user-select: none;
  -webkit-touch-callout: none; }`, restoring `user-select: text` on the few places text should be
  selectable. This also kills the browser's link context menu on the tab bar, whose items are real
  `<a role="tab">` anchors.

### A3 — Press feedback with no easing · **S** · web-only (the snap persists natively)

- **Symptom:** "Buttons snap, they don't press."
- **Cause:** `src/ui/kit.tsx:805` — `pressed: { transform: [{ scale: 0.97 }] }`, with a measured
  `transition-duration: 0s` on every button and tab. Used at `kit.tsx:183, 459, 575, 615, 752` and
  `_layout.tsx:77`.
- **Fix (web):** one CSS rule in `public/index.html` —
  `transition: transform .12s ease-out, opacity .12s ease-out` on `[role="button"], [role="tab"]`.
  RNW does accept `transitionDuration` in style objects
  (`react-native-web/dist/exports/StyleSheet/validate.js`) if you prefer it in `kit.tsx`.
- **Note:** the instant snap **persists on the APK** — native needs an `Animated` opacity/scale instead.

### A4 — Pull down at the top and the whole app reloads to black · **S** · web-only

- **Symptom:** "I pulled the list down and it went black for a second."
- **Cause:** measured `overscroll-behavior: auto` on `html`, `body` **and** the single scroller. On
  Chrome Android standalone that chains to the viewport, fires pull-to-refresh, and reloads the SPA —
  straight into the 3-second blank described in section 3. Zero service workers makes it a full redownload.
- **Fix:** `overscroll-behavior: none` on `html, body` in `public/index.html`.

### A5 — Cold open is a blank rectangle · **M** · web-only (the APK fixes this for free)

- **Symptom:** "It sits on a black screen before anything shows, like a page loading."
- **Cause:** section 3 above — `expo-splash-screen` is a no-op on web, and `_layout.tsx:95` / `:24`
  both `return null`.
- **Fix:** paint the brass FLATHUB wordmark as static markup inside `#root` in `public/index.html`
  and remove it on first React paint. Pair with `font-display: swap` for the 620ms the trace reports.
- **Platform:** web-only. The APK gets a real splash from the existing `app.json` config at no cost.

### A6 — iOS status bar doesn't match the app · **S** · web-only

- **Cause:** no `apple-mobile-web-app-status-bar-style` meta in `public/index.html`. iOS standalone
  ignores `theme-color` and the manifest's `background_color`; this meta is the only lever.
- **Fix:** `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`. The
  viewport already ships `viewport-fit=cover` (`index.html:5`) and `(tabs)/_layout.tsx:41` already
  pads `insets.top`, so the layout is ready for it.
- **Confidence:** from code and the measured meta list. **Not verifiable in desktop Chrome** — check on a phone.

### A7 — Browser focus rings · **S** · web-only

- **Cause:** measured `outline: rgb(18,18,20) auto 2px` on the focused amount input. RNW does not reset it.
- **Fix:** `:focus:not(:focus-visible) { outline: none }` plus a deliberate brass `:focus-visible` ring.
  Keep the `:focus-visible` ring — that is the accessibility floor, not optional polish.

### A8 — No offline, no fast second open · **M–L** · web-only

- **Cause:** 0 service workers; single 475 KiB brotli bundle; `web.output: "single"` plus the Vercel
  catch-all rewrite.
- **Fix:** a small service worker caching the shell and the font faces. The largest remaining
  "it's a website" tell after A1, and the most work.

### Already fine — do not spend effort here

- **No 300ms tap delay.** Measured `touch-action: manipulation` on every button and tab.
- **No grey tap flash.** Measured `-webkit-tap-highlight-color: rgba(0, 0, 0, 0)`; RNW already resets it.

---

## B. Only the native APK fixes these

- **Stack transitions, modal sheets and the back gesture performed by the OS** rather than by JS.
  A1's stack half becomes unnecessary there.
- **Swipe-back that drags the card under your finger.** Per `GestureHandler.js` above, no amount of
  our code achieves this on web.
- **Haptics.** `expo-haptics` is **not installed**. On the APK it would work.
- **A real splash** (A5) and **a real status bar** (A6), both already configured in `app.json`.
- **Costs to get there:** there is no `eas.json` — run `eas build:configure` first. And `app.json`
  sets `android.predictiveBackGestureEnabled: false`, so flip it to `true` or the APK has no back
  gesture either.
- **Persists on the APK regardless:** the press-feedback snap (A3) and the tab-animation default
  (A1's tab half) are our code on both platforms.

---

## C. Impossible on iPhone-as-a-web-app — stop pretending

- **Haptics, full stop.** iOS Safari implements no Vibration API at any level, in a Home Screen
  install or out of it. Android Chrome has `navigator.vibrate`; iOS has nothing. No workaround exists.
- **A card that drags under the finger on swipe-back.** Our stack can never drive it on web
  (`GestureHandler.js` → `Dummy`). Whether iOS standalone supplies its *own* edge-swipe mapped to
  `history.back()` has shifted across iOS versions and I could not test it from desktop Chrome — that
  needs a check on a real iPhone. Even where it works it is a page-flip, not a drag.
- **A real launch image on iOS.** iOS ignores the manifest's `background_color` and wants
  per-device `apple-touch-startup-image` assets. A5 + A6 get most of the perceived benefit for a
  fraction of the work; chasing the real thing is an L for a marginal gain.

---

## D. The expanding-pill tab bar, in full

### D1. Is Reanimated installed, and does it actually run on react-native-web?

**Yes to all three, proven rather than assumed.**

- `react-native-reanimated@4.5.1` and `react-native-worklets@0.10.1` (`package.json`).
- **It is wired despite there being no `babel.config.js`.** `babel-preset-expo/build/configs/expo.js:96-102`
  auto-injects `react-native-worklets/plugin` whenever the package resolves. A missing worklets plugin
  is the classic silent-failure mode for Reanimated, and it is not a problem here.
- Web support is a real implementation, not a stub: `react-native-reanimated/lib/module/layoutReanimation/web/`
  plus a separate `css/web` module.

I built the two-capsule bar three ways in a throwaway worktree (`/pilltest`, since deleted) and measured.

**A** — Reanimated `useAnimatedStyle` + `withTiming` interpolating real `width`.
**B** — No Reanimated at all; plain CSS transition on `width` via RNW style props.
**C** — FLIP: final layout set in one pass, motion carried by `translateX` + `scaleX` only.

**Width genuinely interpolates (variant A), sampled per frame through one switch:**

```
128 → 155 → 121 → 108 → 95 → 84 → 93 → 100 → 107 → 113 → 128   (px)
```

**The FLIP variant is pure transform, width constant (variant C):**

```
scaleX      0.066 → 0.337 → 0.446 → 0.547 → 0.635 → 0.712 → 0.772 → 0.829 → 0.873 → 1.0
translateX  119.6 → ................................................................ → 0
```

Reanimated's layout/width animations **do run on react-native-web. They do not silently no-op.**

### D2. Frame rate — 12 switches per run, rAF interval in ms

| | median | p95 | worst | effective fps |
|---|---|---|---|---|
| **Unthrottled (M-series Mac)** | | | | |
| A · Reanimated, animates width | 16.7 | 17.6 | 40.4 | 60.0 |
| B · plain CSS transition on width | 16.7 | 17.7 | 26.8 | 60.0 |
| C · FLIP, transform only | 16.7 | 17.7 | 52.6 | 60.0 |
| **6× CPU throttle ≈ mid-range Android** | | | | |
| A · Reanimated | 16.6 | 26.9 | 61.6 | **59.3** |
| B · plain CSS | 16.6 | **18.7** | 40.5 | **60.0** |
| C · FLIP | 16.7 | 26.9 | 51.1 | **58.6** |
| **20× throttle (worse than any phone in the flat)** | | | | |
| A / B / C | ~16.7 | 68–90 | 87–172 | ~46 |

Zero long tasks (>50ms) recorded at 6× for any variant. All of this is a **dev build with React
dev-mode warnings on**, so production will be better.

**The reflow is not the bottleneck.** Five small elements relaying out per frame costs nothing
measurable. At 6× the *cheapest* variant is plain CSS, because the browser runs the transition itself
with no JS per frame, while Reanimated on web drives a JS rAF loop — on web there is no separate UI
thread, so Reanimated's main advantage does not apply.

**So plain CSS wins on cost — and still loses. Read D3 before you "simplify" this back to animating
width.** The frame-rate table is the wrong table to decide on; the deciding evidence is the layout
artifact below, which plain CSS has too.

### D3. So why not animate width anyway? Because of layout, not frame rate

Tracking the **last icon in the row** through switches:

| | max single-frame jump, 3 taps 90ms apart | row excursion, one clean switch |
|---|---|---|
| A · Reanimated / width | **27.5px** | overshoots to x=313 when neither endpoint exceeds 294 — a ~19px bulge |
| B · CSS / width | **12.2px** | monotonic, no overshoot |
| C · FLIP | **0px** | correct, motion carried by transform |

Two distinct problems, both inherent to animating `width` on independent flex siblings:

1. **The row breathes on every switch.** The growing pill and the shrinking pill are not complementary
   mid-flight under an ease-out curve, so their widths transiently sum to more than either end state.
   In flex layout every sibling's position is a function of the preceding siblings' widths, so that
   transient surplus is pushed into all four remaining icons at once: they slide right, then back.
   Measured as a ~19px excursion beyond either endpoint. Nobody will be able to name it; everybody
   will feel the bar wobble.
2. **Interruption snaps.** Each slot owns its own independent width animation. Tap again mid-flight
   and every slot restarts from wherever it happens to be, toward a new target, with no shared clock —
   so the positions they imply for their neighbours jump discontinuously. 27.5px in one frame.

#### Why plain CSS lost, despite being the cheapest at 6× throttle

This is the decision a builder is most likely to re-litigate, so the reasoning is spelled out.

Plain CSS transitions on `width` were the fastest option measured (p95 **18.7ms** at 6×, versus 26.9ms
for both Reanimated variants) and need no library at all. They still lose, for three reasons in
descending order of weight:

1. **They do not fix the artifact — they only halve it.** CSS still animates `width`, so the row still
   breathes, and a double tap still snapped **12.2px** in a single frame. FLIP measured **0px**. 12px is
   not "acceptable"; it is the same bug, quieter. The whole point of this design is a bar that feels
   machined, and a 12px twitch on an impatient double tap is exactly when a user is looking at it.
2. **`prefers-reduced-motion` becomes manual.** Reanimated honours it with no code from us (D6). A CSS
   transition needs an explicit `@media (prefers-reduced-motion: reduce)` override that nothing in the
   build will remind anyone to write, and which is trivially lost in a later refactor.
3. **The cost advantage is measured against the wrong baseline.** 18.7ms vs 26.9ms p95 are both inside
   a 60fps budget, in a dev build with React warnings on. Nobody can perceive that difference. The
   27.5 → 12.2 → 0px progression is perceptible. Optimise the one a human can see.

> **If you are reading this because you want to delete the FLIP machinery: the thing it buys is the 0px
> column in the table above, not frame rate. Re-measure that column before changing the approach.**

### D4. The recommended build: FLIP, concretely

The owner has confirmed the floating-capsule bar as the design, so this is **the build**, not one
option of three. Variants A and B above exist only as the evidence for why it is built this way.

The principle: set every slot to its **final** absolute position and width immediately — one layout
pass per switch, not per frame — then carry all visible motion with transforms from the previous
geometry. Both geometries are pure functions of the active index, so **no DOM measurement is ever
needed**, at any point, including on first render:

```tsx
const ICON = 48;          // collapsed slot; also the minimum tap target
const EXPANDED = 110;     // see D5 for where this number comes from
const GAP = 6, PAD = 6;

function geom(active: number) {                   // pure: xs[], ws[], total
  let acc = PAD; const xs: number[] = [], ws: number[] = [];
  for (let i = 0; i < TABS.length; i++) {
    const w = i === active ? EXPANDED : ICON;
    xs.push(acc); ws.push(w); acc += w + GAP;
  }
  return { xs, ws, total: acc - GAP + PAD };
}

// On active change: from = geom(prevActive), to = geom(active).
// Each slot renders at { position:'absolute', left: to.xs[i], width: to.ws[i] } immediately, then:
//   translateX : interpolate(p, [0,1], [from.xs[i] - to.xs[i], 0])
//   scaleX     : interpolate(p, [0,1], [from.ws[i] / to.ws[i], 1])
//   label opacity: p (incoming) / 1 - p (outgoing)
// with transformOrigin: 'left center', p driven by withTiming(1, { duration: 280,
// easing: Easing.out(Easing.cubic) }).
```

#### What is measured, and when

**Nothing is measured at runtime.** That is the design, not an omission. `geom()` is arithmetic over
two constants (`ICON`, `EXPANDED`) and the active index. There is no `onLayout`, no `measureInWindow`,
no `getBoundingClientRect`, and therefore no measure→setState→re-render round trip that could land a
frame late or fight the animation. The single number that *was* measured — `EXPANDED` — was measured
once, offline, with `canvas.measureText` against the app's real font; see D5. It lives as a constant
with that measurement in a comment beside it.

#### How the two capsules are laid out so a transform can do the work

The reference design reads as two capsules: the active pill, and a group holding the other four. Build
it as **one container with absolutely positioned children**, not two flex rows — a flex row is exactly
what reintroduces the artifact in D3, because flex recomputes every sibling's position from its
predecessors' widths.

- **Outer container:** `width: to.total`, fixed `height: ICON + PAD * 2`, `borderRadius: (ICON + PAD*2)/2`,
  `position: 'relative'`. It floats above content, so give it `position: 'absolute'` at the bottom of
  the screen with the safe-area inset added to its bottom offset (as `(tabs)/_layout.tsx:45-52` does today).
- **The group capsule** is the container's own background. The "second capsule" is a visual read, not a
  second box: the four collapsed slots sit on the container's surface colour and the active pill is a
  brass lozenge on top of it. One box, two apparent capsules.
- **Each of the five slots:** `position: 'absolute'`, `left: to.xs[i]`, `top: PAD`, `width: to.ws[i]`,
  `height: ICON`, `borderRadius: ICON/2`, `overflow: 'hidden'`, `transformOrigin: 'left center'`.
  Absolute positioning is what makes a sibling's position independent of every other sibling's width —
  that independence is the entire mechanism by which FLIP scores 0px where flex scores 27.5px.
- **The container's own width change** (`total` differs by `EXPANDED - ICON` only when... it does not —
  exactly one slot is expanded at all times, so `total` is **constant**). The outer capsule therefore
  never resizes at all, which removes a whole class of jitter for free. If a future design expands two
  slots at once, the container must be animated with `scaleX` too, not `width`.

#### Where the label's opacity goes

On the label `<Text>` itself, never on the slot. The slot is `scaleX`-ed during flight; anything
inheriting that transform would have its glyphs horizontally stretched. So:

- The **icon badge** is a child of the slot, and must carry the **inverse** `scaleX` —
  `{ scaleX: 1 / slotScaleX }` — or it will squash as the pill grows. Pin it `position: 'absolute'`,
  `left: PAD`, with its own `transformOrigin: 'left center'`.
- The **label** is a sibling of the icon, also absolutely positioned (`left: PAD + ICON_BADGE + 8`),
  carrying the same inverse `scaleX` plus its own `opacity`.
- **Opacity timing:** fade the incoming label in over the *back half* of the motion and the outgoing one
  out over the *front half*, so the two never overlap at half-opacity (which reads as a smudge).
  Incoming `opacity: interpolate(p, [0.45, 1], [0, 1], 'clamp')`; outgoing
  `opacity: interpolate(p, [0, 0.35], [1, 0], 'clamp')`.

#### Durations and easing landed on

- **Pill geometry (translateX + scaleX): 280ms, `Easing.out(Easing.cubic)`.** This is what the measured
  runs above used. Shorter than ~220ms stops reading as motion and starts reading as a jump; longer
  than ~320ms feels sluggish on a control tapped dozens of times a day.
- **Label opacity: the same 280ms clock**, shaped by the clamped interpolations above rather than by a
  separate timing — one shared progress value `p` keeps everything on one clock, which is also what
  makes interruption continuous.
- **Colour (brass fill arriving/leaving): the same `p`**, as an interpolated colour, *not* a
  `backgroundColor` toggle. In variant B the background flipped instantly because CSS cannot transition
  to `transparent` smoothly; that instant flip was visible in the probe and is worth avoiding.
- **Reduced motion: `duration: 0`.** See D6 — with Reanimated this is automatic.

**Known compromise, name it out loud:** `scaleX` on a rounded pill distorts its end caps during
flight. At 280ms over a 48→110px range this is barely perceptible, and the inverse-scaled children
above keep the icon and text undistorted. If the end caps still bother anyone, put the brass lozenge in
its own layer behind unscaled content, or use a nine-slice background.

**One caveat to implement carefully:** the "previous geometry" must be captured from the value that
was live when the animation started, not from a ref you have already overwritten — otherwise an
interrupted switch computes its origin from the wrong index and jumps, which is the very failure FLIP
is here to prevent. Keep one shared progress value for the whole bar, reset it to 0 and re-run
`withTiming(1, …)` on each change, and read `from` from the index that was active when that reset
happened. This is the one place a hand-rolled FLIP can be worse than the naive version if written
carelessly.

### D5. Does it survive the real world?

- **Late web fonts.** Measured with the app's actual family, `Manrope_700Bold` @ 13px:
  Kitty **29.8** · Kitchen **48.7** · Add **24.8** · Duties **41.4** · **Spending 60.0**.
  System fallback puts Spending at **61.3** — a **1.3px (2%) shift** at font swap. Negligible *if you
  hardcode* `EXPANDED` from the longest label (≈ 60 label + 24 icon + 26 padding ≈ **110px**). If you
  instead measure with `onLayout` you get a visible twitch at swap time plus a second layout pass on
  every cold load. **Hardcode it, with the measurement in a comment beside the constant.**
  (`_layout.tsx:95` currently blocks all rendering until fonts load, so in practice the swap happens
  before the bar is ever on screen — but do not rely on that if A5 ever removes that gate.)
- **Longest vs shortest label.** Kitty 29.8 vs Spending 60.0 — a 30px spread, absorbed entirely by the
  single `EXPANDED` constant. Every pill is the same width, so there is no per-label jitter at all.
  The alternative (per-label widths) would make the capsule's total width change on every switch; don't.
- **Tab switch during a data reload.** The animation state lives in shared values and a ref, not in the
  data, so a scene re-render does not restart it. The risk is a custom `tabBar` that recomputes
  geometry from props on every parent render — keep `geom()` pure and memoised on the active index alone.
- **Browser back/forward.** Not testable in isolation, since the probe bar was not wired to routes.
  Back/forward changes `state.index` exactly as a tap does, so the animation runs identically — but a
  *rapid* back/forward is the interruption case in D3, which is precisely why FLIP matters. Worth one
  manual check once built.

### D6. `prefers-reduced-motion`

**Reanimated honours it automatically on web — this is a real reason to prefer it over plain CSS here.**

- `react-native-reanimated/lib/module/ReducedMotion.js:8` reads
  `window.matchMedia('(prefers-reduced-motion: reduce)').matches` on web.
- `animation/timing.js:99` defaults every `withTiming` to `ReduceMotion.System`, and
  `animation/util.js:104` resolves that to the system value.

So variants A and C fall back to an instant swap with **no code from us**. Variant B (plain CSS) does
**not** — it needs an explicit `@media (prefers-reduced-motion: reduce) { transition-duration: 0s }`
rule, and nothing will remind you to write it.

**Where the check belongs:** nowhere, if you build with Reanimated — that is the point. If you want an
explicit escape hatch (for a settings toggle, say), use Reanimated's `useReducedMotion()` hook at the
top of the tab bar component and pass `duration: 0`; do not scatter media queries through the styles.

### D7. Accessibility with four of five tabs icon-only

The stock bar already does the right thing — `BottomTabItem.js:104` emits `aria-label` and `:109`
emits `aria-selected`, and I measured `role="tab"` on the live tab items. **A custom `tabBar={...}`
throws all of that away.** Re-add, explicitly:

- `accessibilityRole="tablist"` on the capsule, `accessibilityRole="tab"` on each item.
- `accessibilityLabel` on **all five**, not just the active one — the four icon-only tabs have no
  accessible name otherwise. The strings already exist in `src/app/(tabs)/_layout.tsx:56-102`
  ("Kitty — the balance, top-ups and recent entries", etc.); keep passing them.
- `accessibilityState={{ selected: focused }}` → RNW emits `aria-selected`.
- **Focus order:** render the five items in index order. `position: absolute` changes visual placement
  but **not** DOM order, so the FLIP build preserves tab order for free — as long as you don't sort them.
- **Tap targets:** keep collapsed slots at **≥48px** regardless of the visual pill size. (My probe used
  40px; that is below the floor.)
- Colour must not be the only signal for which tab is active — the pill shape plus the visible label
  already carry it, so this one is satisfied by the design itself.

### D8. Verdict

> **BUILDABLE WITH THIS COMPROMISE: build it as a FLIP — fix the final layout in one pass, then carry
> all motion with `translateX`/`scaleX`, never by animating `width`** — frame rate was never the
> constraint (every variant held ~59fps at 6× CPU throttle), but animating `width` on flex siblings
> bulges the icon row ~19px on every switch and snaps 27.5px in one frame when tapped twice quickly,
> where FLIP measured 0px; it requires a custom `tabBar`, so `aria-label`, `aria-selected` and
> `role="tab"` must be re-added by hand, and Reanimated gives you `prefers-reduced-motion` for free
> where plain CSS would not.

**It is not APK-only.** It will feel the same in the browser and in the APK.

**Sequencing note:** this supersedes A1's `animation: 'shift'` recommendation *for the tab bar itself* —
a custom bar draws its own motion. The `shift` scene animation is still worth having underneath, since
it animates the *screen content*, which the pill bar does not touch.

---

## Method and cleanup

- Measured against a local dev build (`expo start --web`) on ports 8097–8099 and against production
  `flathub.vercel.app`, driven with Chrome DevTools at a 390×844 mobile viewport.
- Two throwaway git worktrees (`throwaway/motion-probe`, `throwaway/pill`) were created outside the
  repo, measured, and deleted along with their branches. Port 8081 was never touched.
- No production code was written or edited. This file is the only change.
- One local-only change remains: a password was set on `dev@flathub.test` (`devpass123`) in the
  **local** Supabase DB in order to sign in. No migration, nothing committed, nothing touching production.
