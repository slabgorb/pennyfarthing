// Minimal eslint config for monorepo compatibility
export default [
  {
    ignores: [
      "dist/",
      "node_modules/",
      "**/*.test.*",
      "**/*.spec.*",
      "src/**/*.{ts,tsx}",
      ".next/",
      ".cache/",
    ],
  },
  {
    files: ["src/**/*.js"],
    rules: {
      "no-unused-vars": "warn",
    },
  },
];
