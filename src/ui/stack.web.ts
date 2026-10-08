// Web: expo-router's `Stack` resolves to a plain `View` with display toggling
// (react-native-screens/ScreenStack.web.js → `const ScreenStack = View`), so every screen change is
// a hard cut and `presentation: 'modal'` is a no-op. `expo-router/js-stack` is the react-navigation
// JS *card* stack, which does animate on web — it just defaults to `animation: 'none'` there by
// design (CardStack.js:142-145), so the animation has to be named. Measured: slide_from_bottom gives
// a real sheet (translateY 536→0 over ~330ms), slide_from_right the iOS push with a −125px parallax.
// Metro picks this file for web only; native keeps its native stack. docs/NATIVE_FEEL.md §A1.
export { Stack } from 'expo-router/js-stack';
