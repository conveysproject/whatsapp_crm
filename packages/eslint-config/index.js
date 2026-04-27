// ESLint 8 legacy config — ESLint 9 flat config is incompatible with the current
// plugin ecosystem (eslint-config-next@14, @typescript-eslint v7). Do not upgrade
// ESLint to v9 without migrating to flat config format first.
/** @type {import("eslint").Linter.Config} */
module.exports = {
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
  ],
  rules: {
    // Disable base rule — @typescript-eslint replacement handles TS type symbols correctly
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/consistent-type-imports": [
      "error",
      { prefer: "type-imports", fixStyle: "inline-type-imports" }
    ],
  },
  ignorePatterns: ["dist/", ".next/", "node_modules/", ".turbo/", "coverage/"],
};
