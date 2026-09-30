import tseslint from "typescript-eslint";
export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "dist-ios/**",
      "ios/App/App/public/**",
      "node_modules/**",
      ".local/**",
      ".wrangler/**",
      "output/**",
      "playwright-report/**",
      "test-results/**",
      "worker-configuration.d.ts",
      "shared/database.types.ts",
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
);
