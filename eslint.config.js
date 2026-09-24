import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import pluginVue from "eslint-plugin-vue";
import json from "@eslint/json";
import markdown from "@eslint/markdown";
import css from "@eslint/css";
import { defineConfig } from "eslint/config";

const vue2CompatibilityRules = Object.fromEntries(
  Object.keys(pluginVue.configs["flat/essential"].at(-1).rules)
    .filter((rule) => rule.startsWith("vue/no-deprecated-"))
    .map((rule) => [rule, "off"]),
);

export default defineConfig([
  { ignores: ["frontend/src/theme/**", "frontend/src/utils/qrcode.js"] },
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,vue}"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, __BUILD_VERSION__: "readonly" },
    },
    rules: {
      "@typescript-eslint/no-this-alias": "off",
    },
  },
  tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,vue}"],
    rules: { "@typescript-eslint/no-this-alias": "off" },
  },
  {
    files: ["backend/src/**/*.test.ts", "captcha-service/src/**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/ban-ts-comment": "off",
    },
  },
  ...pluginVue.configs["flat/essential"].map((config) => ({
    ...config,
    files: config.files || ["**/*.vue"],
  })),
  {
    files: ["**/*.vue"],
    rules: {
      ...vue2CompatibilityRules,
      "vue/multi-word-component-names": "off",
      "@typescript-eslint/no-this-alias": "off",
    },
  },
  {
    files: ["**/*.vue"],
    languageOptions: {
      parserOptions: { parser: tseslint.parser, ecmaFeatures: { jsx: true } },
    },
  },
  { files: ["**/*.json"], plugins: { json }, language: "json/json", extends: ["json/recommended"] },
  { files: ["**/*.jsonc"], plugins: { json }, language: "json/jsonc", extends: ["json/recommended"] },
  { files: ["**/*.json5"], plugins: { json }, language: "json/json5", extends: ["json/recommended"] },
  { files: ["**/*.md"], plugins: { markdown }, language: "markdown/commonmark", extends: ["markdown/recommended"] },
  {
    files: ["**/*.css"],
    plugins: { css },
    language: "css/css",
    extends: ["css/recommended"],
  },
  { files: ["frontend/src/utils/qrcode.js", "frontend/src/utils/patterns.js"], rules: { "no-useless-escape": "off" } },
]);
