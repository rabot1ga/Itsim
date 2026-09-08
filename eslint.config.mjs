import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

/**
 * ESLint flat config.
 *
 * `npm run lint` used to be `tsc` only, while the README claimed a linter —
 * types were checked, dead code and footguns were not.
 *
 * Policy: catch real bugs, do not fight the existing style. Formatting is
 * Prettier's job (`npm run format`), so all stylistic rules are disabled here.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/artifacts/**',
      'packages/server/data/**',
      'packages/client/public/**',
      'packages/content/*.json',
      // E2E specs run only under Playwright (own config, browser context) — not app code
      'packages/e2e/**',
      // Scratch render scripts kept in the repo root while sprite decisions are open
      '*.tmp.mjs',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,

  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        AbortController: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        crypto: 'readonly',
      },
    },
    rules: {
      // The codebase is intentionally `any`-heavy at the content boundary
      // (JSON validated by Zod at runtime) — typing it twice buys nothing.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/no-empty-object-type': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Real footguns:
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-constant-binary-expression': 'error',
      'require-atomic-updates': 'off',
    },
  },

  // Browser code
  {
    files: ['packages/client/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        navigator: 'readonly',
        Image: 'readonly',
        HTMLElement: 'readonly',
        HTMLCanvasElement: 'readonly',
        HTMLDivElement: 'readonly',
        HTMLInputElement: 'readonly',
        SVGSVGElement: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        alert: 'readonly',
        performance: 'readonly',
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },

  // Tests
  {
    files: ['**/__tests__/**/*.ts', '**/*.test.ts'],
    languageOptions: {
      globals: { describe: 'readonly', it: 'readonly', expect: 'readonly', vi: 'readonly', beforeEach: 'readonly', afterEach: 'readonly', beforeAll: 'readonly', afterAll: 'readonly' },
    },
  }
);
