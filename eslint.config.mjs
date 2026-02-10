import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      // Unused vars as warnings for now - clean up gradually
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      // Allow any for now - can tighten later
      '@typescript-eslint/no-explicit-any': 'warn',
      // Allow require in certain contexts
      '@typescript-eslint/no-require-imports': 'off',
      // No useless escapes - off for regex patterns
      'no-useless-escape': 'off',
      // Allow control chars in regex - needed for ANSI escape sequences
      'no-control-regex': 'off',
    },
  },
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/release/**',
      '**/*.js',  // Only lint TypeScript files
      '**/tiptap.bundle.js',
    ],
  }
);
