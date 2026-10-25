// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import legacyFiles from '../../lint/legacy-files.json';

describe('classic-port lint boundary', () => {
  const eslint = new ESLint({ cwd: process.cwd() });

  it('keeps correctness checks on existing untyped services', async () => {
    const result = await eslint.lintText(
      '// @ts-nocheck\nconst unused = 1;\n',
      { filePath: 'server/nocoreach/signals.ts' },
    );
    expect(result[0].messages.map((message) => message.ruleId)).toContain(
      '@typescript-eslint/no-unused-vars',
    );
    expect(result[0].messages.map((message) => message.ruleId)).not.toContain(
      '@typescript-eslint/ban-ts-comment',
    );
  });

  it.each([
    'server/nocoreach/new-service.ts',
    'server/nocoreach/legacy/database.ts',
    'client/pages/strategy/model.ts',
  ])('retains type safety for %s', async (filePath) => {
    const config = await eslint.calculateConfigForFile(filePath);
    expect(config.rules['@typescript-eslint/no-unsafe-assignment'][0]).toBe(2);
    expect(config.rules['@typescript-eslint/ban-ts-comment'][0]).toBe(2);
  });

  it('keeps Hook checks and rejects new mixed component exports', async () => {
    const config = await eslint.calculateConfigForFile(
      'client/pages/new-page.tsx',
    );
    expect(config.rules['react-hooks/exhaustive-deps'][0]).toBeGreaterThan(0);
    expect(config.rules['react-hooks/set-state-in-effect'][0]).toBe(2);
    expect(config.rules['react-refresh/only-export-components'][0]).toBe(2);
    expect(
      config.rules['react-refresh/only-export-components'][1]
        ?.allowExportNames ?? [],
    ).toEqual([]);
  });

  it('only lists existing classic files that still need typing', async () => {
    expect(new Set(legacyFiles).size).toBe(legacyFiles.length);
    for (const file of legacyFiles) {
      expect(file).toMatch(/^(server|tests)\/nocoreach\/.*\.ts$/);
      expect(await readFile(file, 'utf8')).toMatch(/^\/\/ @ts-nocheck/m);
    }
  });
});
