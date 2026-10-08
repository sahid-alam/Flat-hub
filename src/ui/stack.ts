// Native: expo-router's own Stack, which is react-native-screens' native stack — a real
// UINavigationController / Fragment transition, which is better than anything JS can draw.
// The web build takes stack.web.ts instead; see docs/NATIVE_FEEL.md §A1 for why.
// Types for the whole app come from THIS file, so an option only the native stack accepts
// (headerShadowVisible, headerBackButtonDisplayMode) still typechecks and is simply ignored on web.
export { Stack } from 'expo-router';
