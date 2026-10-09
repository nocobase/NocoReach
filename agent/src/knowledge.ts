import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
// 知识库 (项目知识) that comes with a claimed run: written to a temporary folder outside the repository, so it can never
// be committed, and removed when the run ends. Claude Code is allowed to read that folder.
export type KnowledgeItem = { id: string; title: string; category: string; text?: string; omitted?: boolean };
export type KnowledgeFiles = { dir: string; files: { file: string; title: string; category: string }[]; omitted: string[]; cleanup: () => Promise<void> };
export const categoryNames: Record<string, string> = { competitor: '竞品', customer: '客户', product: '产品', industry: '行业', other: '其他' };
const safe = (s: string) => s.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'item';
export async function writeKnowledge(items?: KnowledgeItem[]): Promise<KnowledgeFiles | null> {
  if (!items?.some(x => x.text)) return null;
  const dir = await mkdtemp(path.join(os.tmpdir(), 'nocoreach-knowledge-'));
  const files: KnowledgeFiles['files'] = [];
  for (const it of items) {
    if (!it.text) continue;
    const category = categoryNames[it.category] || '其他', file = `${String(files.length + 1).padStart(2, '0')}-${safe(it.title)}.md`;
    await writeFile(path.join(dir, file), `# ${it.title}\n\n分类：${category}\n\n${it.text}\n`);
    files.push({ file, title: it.title, category });
  }
  return { dir, files, omitted: items.filter(x => !x.text).map(x => x.title), cleanup: () => rm(dir, { recursive: true, force: true }) };
}
