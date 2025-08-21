const { defineConfig, globalIgnores } = require("eslint/config");

const tsParser = require("@typescript-eslint/parser");
const typescriptEslint = require("@typescript-eslint/eslint-plugin");
const filenameConvention = require("eslint-plugin-filename-convention");
const js = require("@eslint/js");

const { FlatCompat } = require("@eslint/eslintrc");

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

module.exports = defineConfig([
  {
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {},
    },

    extends: compat.extends("plugin:@typescript-eslint/recommended"),

    plugins: {
      "@typescript-eslint": typescriptEslint,
      "filename-convention": filenameConvention,
    },

    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/explicit-function-return-type": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "no-console": "warn",
      "no-debugger": "warn",
      "no-duplicate-imports": "error",
      "filename-convention/kebab-case": "error",
    },
  },
  globalIgnores(["dist/**/*", "node_modules/**/*"]),
]);
