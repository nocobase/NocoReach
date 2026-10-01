// Light content check run before pushing: metadata files must be valid JSON, changed Markdown must not be empty,
// and language versions of a page are listed when only some of them changed (a warning, not a failure).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
export function contentCheck(work: string, files: string[]): { ok: boolean; summary: string } {
  const problems: string[] = [], warnings: string[] = [];
  for (const f of files) {
    const full = join(work, f);
    if (!existsSync(full)) continue;
    if (f.endsWith('.json')) { try { JSON.parse(readFileSync(full, 'utf8')); } catch { problems.push(`${f} 不是有效的 JSON`); } }
    if (/\.mdx?$/.test(f) && !readFileSync(full, 'utf8').trim()) problems.push(`${f} 是空文件`);
  }
  const dirs = [...new Set(files.filter(f => /\/index(\.[a-z-]+)?\.mdx?$/.test(f)).map(dirname))];
  for (const d of dirs) {
    const langs = existsSync(join(work, d)) ? readdirSync(join(work, d)).filter(n => /^index(\.[a-z-]+)?\.mdx?$/.test(n)) : [];
    const changed = files.filter(f => dirname(f) === d).map(f => basename(f));
    const untouched = langs.filter(n => !changed.includes(n));
    if (changed.length && untouched.length) warnings.push(`${d}：改了 ${changed.join('、')}，未改 ${untouched.join('、')}`);
  }
  const summary = [problems.length ? `未通过：${problems.join('；')}` : `内容检查通过（${files.length} 个文件）`, ...(warnings.length ? [`其他语言版本未同步：${warnings.join('；')}`] : [])].join('\n');
  return { ok: problems.length === 0, summary };
}
