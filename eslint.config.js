// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  // RN <Text> renders raw strings; HTML entity escaping doesn't apply
  { rules: { "react/no-unescaped-entities": "off" } },
]);
