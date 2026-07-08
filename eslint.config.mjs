import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import importPlugin from 'eslint-plugin-import'
import vuePlugin from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript'
import globals from 'globals'

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  ...vuePlugin.configs['flat/recommended'],
  {
    plugins: {
      import: importPlugin,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2022,
      },
    },
    settings: {
      'import/resolver-next': [
        createTypeScriptImportResolver(),
      ],
      'import/core-modules': ['electron'],
    },
    rules: {
      ...importPlugin.configs.recommended.rules,
      // TypeScript handles these checks natively — disabling avoids false positives
      'import/no-unresolved': 'off',
      'import/named': 'off',
      'import/namespace': 'off',
      'import/default': 'off',
      'import/no-named-as-default-member': 'off',
      // Allow intentionally-unused values when prefixed with _
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },
  {
    // Test files legitimately use `any` in mock plumbing
    files: ['src/__tests__/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
        sourceType: 'module',
      },
    },
    rules: {
      // Stylistic rules that conflict with the existing codebase formatting;
      // correctness rules from flat/recommended stay enabled.
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/multiline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/html-indent': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/first-attribute-linebreak': 'off',
      'vue/attributes-order': 'off',
      // Router views and app-level singletons use single-word names by design
      'vue/multi-word-component-names': 'off',
    },
  },
  {
    // worker/ is a separate deployable (Cloudflare Worker) with its own
    // package.json, tsconfig, and Cloudflare-specific ambient types — lint
    // it via `npm run lint` inside worker/ instead.
    ignores: ['node_modules/**', 'dist/**', 'out/**', '.vite/**', 'worker/**'],
  },
)
