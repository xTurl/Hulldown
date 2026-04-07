import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import importPlugin from 'eslint-plugin-import'
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript'
import globals from 'globals'

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.recommended,
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
    },
  },
  {
    ignores: ['node_modules/**', 'dist/**', 'out/**', '.vite/**'],
  },
)
