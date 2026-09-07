const { FlatCompat } = require("@eslint/eslintrc");

const compat = new FlatCompat({ baseDirectory: __dirname });

module.exports = [
  {
    ignores: ["node_modules/**", ".expo/**", "server/**"]
  },
  ...compat.extends("expo")
];
