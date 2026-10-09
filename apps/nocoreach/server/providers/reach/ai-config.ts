import { readFile, writeFile, rename } from 'node:fs/promises';
import { parseDocument } from 'yaml';
import { resolveDefaultAppConfigFile } from '@nocobase/app-server/config';
import type { Application } from '@nocobase/app-server/application';
import { aiManagerToken } from '@nocobase/app-plugin-ai-employee/server';
interface ServiceInput {
  title: string;
  provider: string;
  options: Record<string, unknown>;
  enabledModels: { label: string; value: string }[];
  enabled: boolean;
}
let pending: Promise<void> = Promise.resolve();
// The native AI configuration is authoritative. Preserve every unrelated setting and comment.
export function configureReachAI(
  app: Application,
  name: string,
  input: ServiceInput,
): Promise<void> {
  const save = pending.then(() => saveConfiguration(app, name, input));
  pending = save.catch(() => {});
  return save;
}
async function saveConfiguration(
  app: Application,
  name: string,
  input: ServiceInput,
): Promise<void> {
  const file = resolveDefaultAppConfigFile(app.paths);
  const document = parseDocument(await readFile(file, 'utf8'));
  if (document.errors.length) throw new Error('应用配置文件无法解析，未保存');
  document.setIn(['ai', 'llmServices', name], input);
  const temporary = `${file}.nocoreach.tmp`;
  await writeFile(temporary, String(document), { mode: 0o600 });
  await rename(temporary, file);
  await app.config.reload();
  await app.container
    .resolve(aiManagerToken)
    .llmServiceManager.registerLLMService({
      ...input,
      name,
      enabledModels: { mode: 'custom', models: input.enabledModels },
    });
}
