// @vitest-environment node
import { execFile } from 'node:child_process';
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import ts from 'typescript';
import { expect, it } from 'vitest';

it('resolves the compiled CLI distribution independently of the host root', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nocoreach-dist-config-'));
  try {
    const source = await readFile(
      new URL('../../server/config/agents.ts', import.meta.url),
      'utf8',
    );
    const compiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ESNext,
      },
    }).outputText;
    await symlink(
      fileURLToPath(new URL('../../node_modules', import.meta.url)),
      join(root, 'node_modules'),
      'dir',
    );
    const dir = join(root, 'dist/server/config');
    await mkdir(dir, { recursive: true });
    const moduleFile = join(dir, 'agents.mjs');
    await writeFile(moduleFile, compiled);
    const script = `
      import config from ${JSON.stringify(pathToFileURL(moduleFile).href)};
      const roots = [${JSON.stringify(root)}, ${JSON.stringify(join(root, 'dist'))}];
      console.log(JSON.stringify(roots.map(rootDir => config({paths:{root: p => rootDir + '/' + p}}).dist.dir)));
    `;
    const { stdout } = await promisify(execFile)(process.execPath, [
      '--input-type=module',
      '-e',
      script,
    ]);
    expect(JSON.parse(stdout)).toEqual([
      join(root, 'dist/runners'),
      join(root, 'dist/runners'),
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
