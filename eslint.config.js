import { createApplicationConfig } from '@nocobase/dev-config/eslint';
import legacyFiles from './lint/legacy-files.json' with { type: 'json' };
import refreshExports from './lint/refresh-exports.json' with { type: 'json' };

const config = createApplicationConfig({
  tsconfigRootDir: import.meta.dirname,
  // React's own Hooks plugin owns these checks; the second implementation
  // otherwise reports the same dependency/effect twice.
  rules: {
    '@eslint-react/exhaustive-deps': 'off',
    '@eslint-react/set-state-in-effect': 'off',
  },
  ignores: [
    '.extension-state/**',
    'client-old/**',
    'public/r/**',
    'storage/**',
  ],
});

// Classic services and their ported tests deliberately retain @ts-nocheck
// (docs/DEVELOPMENT.md). Keep syntax/correctness checks, but do not interpret
// their untyped records as TypeScript safety failures. This explicit inventory
// does not exempt new files or typed adapters under server/nocoreach/legacy.
const typescriptPlugin = config.find(
  (entry) => entry.plugins?.['@typescript-eslint'],
).plugins['@typescript-eslint'];

export default [
  ...config,
  // These established modules colocate reusable table/render helpers with their
  // components. Vite can reload their importers; new mixed exports stay checked.
  ...Object.entries(refreshExports).map(([file, names]) => ({
    name: `nocoreach/refresh-exports/${file}`,
    files: [file],
    rules: {
      'react-refresh/only-export-components': [
        'error',
        { allowExportNames: names },
      ],
    },
  })),
  {
    name: 'nocoreach/classic-port',
    files: legacyFiles,
    languageOptions: {
      parserOptions: { project: false, projectService: false },
    },
    rules: {
      ...Object.fromEntries(
        Object.entries(typescriptPlugin.rules)
          .filter(([, rule]) => rule.meta.docs?.requiresTypeChecking)
          .map(([name]) => [`@typescript-eslint/${name}`, 'off']),
      ),
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/ban-ts-comment': ['error', { 'ts-nocheck': false }],
    },
  },
];
