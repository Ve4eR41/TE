const js = (() => require("@eslint/js"))();
const tseslint = (() => require("typescript-eslint"))();
const globals = (() => require("globals"))();

module.exports = (() =>
  tseslint.config(
    { ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**"] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
      files: ["**/*.{js,cjs,ts}"],
      rules: {
        "no-restricted-syntax": [
          "error",
          {
            selector: "ExportDefaultDeclaration",
            message: "Use named exports.",
          },
        ],
      },
    },
    {
      files: ["**/*.cjs"],
      languageOptions: { globals: globals.node },
      rules: { "@typescript-eslint/no-require-imports": "off" },
    },
    {
      files: ["packages/client/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              "@troll-vs-elves/server",
              "@troll-vs-elves/server/**",
              "@troll-vs-elves/shared/config/node",
              "node:*",
              "**/server/**",
              "**/shared/src/**",
            ],
          },
        ],
      },
    },
    {
      files: ["packages/server/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              "@troll-vs-elves/client",
              "@troll-vs-elves/client/**",
              "**/client/**",
              "**/shared/src/**",
            ],
          },
        ],
      },
    },
    {
      files: ["packages/shared/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              "@troll-vs-elves/client",
              "@troll-vs-elves/client/**",
              "@troll-vs-elves/server",
              "@troll-vs-elves/server/**",
              "**/client/**",
              "**/server/**",
            ],
          },
        ],
      },
    },
  ))();
