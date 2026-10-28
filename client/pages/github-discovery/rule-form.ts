import { ruleSchema } from '../../../shared/github-discovery-validation.js';
import type { DiscoveryRule } from './api.js';
export type RuleForm = {
  name: string;
  queries: string;
  dependencies: string;
  files: string;
  json: string;
  exclusions: string;
  includeForks: boolean;
  includeArchived: boolean;
  includeTemplates: boolean;
  intervalHours: number;
  batchSize: number;
};
const lines = (text: string) =>
  text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
export function formOf(rule: DiscoveryRule): RuleForm {
  return {
    ...rule,
    queries: rule.queries
      .map((q) => `${q.kind === 'code' ? 'code' : 'repo'}: ${q.query}`)
      .join('\n'),
    dependencies: rule.dependencies
      .map((d) => `${d.name} | ${d.range}`)
      .join('\n'),
    files: rule.files
      .map((f) => f.path + (f.contains ? ` | ${f.contains}` : ''))
      .join('\n'),
    json: rule.json
      .map((j) => `${j.path} | ${j.field} | ${j.equals}`)
      .join('\n'),
    exclusions: [...rule.excludeOwners, ...rule.excludeRepositories].join('\n'),
  };
}
export function parseForm(form: RuleForm, rule: DiscoveryRule) {
  const queries = lines(form.queries).map((line) => {
    const m = line.match(/^(repo|code):\s*(.*)$/);
    return {
      kind:
        m?.[1] === 'repo' ? 'repositories' : m?.[1] === 'code' ? 'code' : '',
      query: m?.[2] || '',
    };
  });
  const input = {
    ...rule,
    name: form.name,
    queries,
    dependencies: lines(form.dependencies).map((l) => {
      const [name, ...ranges] = l.split('|').map((s) => s.trim());
      const range = ranges.join('|');
      return { name, range };
    }),
    files: lines(form.files).map((l) => {
      const [path, ...rest] = l.split('|').map((s) => s.trim());
      return { path, contains: rest.join('|') };
    }),
    json: lines(form.json).map((l) => {
      const [path, field, ...rest] = l.split('|').map((s) => s.trim());
      return { path, field, equals: rest.join('|') };
    }),
    excludeOwners: lines(form.exclusions).filter((s) => !s.includes('/')),
    excludeRepositories: lines(form.exclusions).filter((s) => s.includes('/')),
    includeForks: form.includeForks,
    includeArchived: form.includeArchived,
    includeTemplates: form.includeTemplates,
    intervalHours: form.intervalHours,
    batchSize: form.batchSize,
  };
  const result = ruleSchema.safeParse(input);
  return result.success
    ? { rule: result.data, invalid: [] }
    : {
        rule: null,
        invalid: [
          ...new Set(
            result.error.issues.map((i) =>
              String(i.path[0]).startsWith('exclude')
                ? 'exclusions'
                : String(i.path[0]),
            ),
          ),
        ],
      };
}
