module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2022: true
  },
  parser: "vue-eslint-parser",
  parserOptions: {
    parser: "@typescript-eslint/parser",
    ecmaVersion: "latest",
    sourceType: "module",
    extraFileExtensions: [".vue"]
  },
  plugins: ["@typescript-eslint", "vue"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended", "prettier"],
  rules: {
    "no-undef": "off",
    "max-lines": ["warn", { max: 800, skipBlankLines: true, skipComments: true }],
    "max-lines-per-function": ["warn", { max: 150, skipBlankLines: true, skipComments: true, IIFEs: true }]
  },
  ignorePatterns: [".nuxt", ".output", "dist"]
};
