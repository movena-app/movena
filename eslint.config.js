import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '.offline-markdown-preview/**',
      'coverage*/**',
      'dist/**',
      'node_modules/**',
      'playwright-report/**',
      'src-tauri/target/**',
      'test-results/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: [
      'src/**/*.{ts,tsx}',
      'tests/**/*.{ts,tsx}',
      'tests/ui/**/*.{ts,tsx}',
      'tests/desktop/**/*.{ts,tsx}',
    ],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@tauri-apps/*'],
              message: 'Use the typed desktopApi or tauriApi boundary instead.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['scripts/**/*.mjs', 'config/**/*.{js,ts}', '*.config.{js,ts}', '*.conf.ts', 'vite*.ts'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.node },
    },
  },
  {
    files: ['src/platform/**/*.ts', 'tests/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['tests/**/*.{ts,tsx}'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  {
    files: ['src/shared/i18n/i18n.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
);
