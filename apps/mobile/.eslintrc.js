/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  extends: ["@WBMSG/eslint-config"],
  parserOptions: {
    project: "./tsconfig.json",
    tsconfigRootDir: __dirname,
  },
  env: { browser: true, es2022: true },
};
