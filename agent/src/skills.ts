import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
// Skills that come with a claimed run: the step's own (required) and the ones the project turned on. They are written
// as a Claude Code plugin in a temporary folder outside the repository (loaded with --plugin-dir for this run only, so
// they can never be committed) and removed when the run ends. Files that come with a Skill are written, never run.
export type SkillItem = { name: string; description: string; required?: boolean; body?: string; files?: { path: string; text: string }[]; omitted?: boolean };
export type SkillFiles = { dir: string; skills: { name: string; description: string; required: boolean; file: string }[]; omitted: string[]; cleanup: () => Promise<void> };
const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const PLUGIN = 'nocoreach';
export async function writeSkills(items?: SkillItem[]): Promise<SkillFiles | null> {
  const usable = (items || []).filter(s => s.body && NAME.test(s.name) && s.name.length <= 64);
  if (!usable.length) return null;
  const dir = await mkdtemp(path.join(os.tmpdir(), 'nocoreach-skills-'));
  await mkdir(path.join(dir, '.claude-plugin'));
  await writeFile(path.join(dir, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: PLUGIN, version: '1.0.0', description: 'NocoReach 交给这次任务的 Skills' }, null, 2));
  const skills: SkillFiles['skills'] = [];
  for (const s of usable) {
    const root = path.join(dir, 'skills', s.name);
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, 'SKILL.md'), `---\nname: ${s.name}\ndescription: ${JSON.stringify(s.description)}\n---\n\n${s.body}\n`);
    for (const f of s.files || []) {
      const target = path.resolve(root, f.path);
      if (!target.startsWith(root + path.sep) || path.basename(target).toLowerCase() === 'skill.md') continue;
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, f.text);
    }
    skills.push({ name: s.name, description: s.description, required: Boolean(s.required), file: path.join(root, 'SKILL.md') });
  }
  return { dir, skills, omitted: (items || []).filter(s => s.omitted).map(s => s.name), cleanup: () => rm(dir, { recursive: true, force: true }) };
}
