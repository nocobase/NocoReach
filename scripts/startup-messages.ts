import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

const publicId = 'virtual:nocoreach-startup-messages';
const resolvedId = '\0' + publicId;

// Only shell copy belongs on the identity/startup path. Business pages prepare
// the complete, unchanged catalog before evaluating their component modules.
const prefixes = [
  'common.',
  'onlineAgent.',
  'me.',
  'reachData.',
  'projectSwitcher.',
  'navBadges.',
  'states.',
  'errors.',
];
const keys = new Set([
  'accessMembers.yourInvitations',
  'taskDetail.leaveWithDrafts',
  'taskDetail.previousDrafts',
  'taskDetail.previousDraftsHelp',
  'taskDetail.previousDraftText',
  'taskDetail.discardEarlierDraft',
  'taskDetail.discardDraftWarning',
  'taskDetail.discardDraft',
]);

export function startupMessagesPlugin(
  options: { appRoot?: string } = {},
): Plugin {
  let root: string;
  return {
    name: 'nocoreach-startup-messages',
    configResolved(config) {
      root = options.appRoot ?? config.root;
    },
    resolveId(id) {
      if (id === publicId) return resolvedId;
    },
    load(id) {
      if (id !== resolvedId) return;
      const read = (name: string): Record<string, string> => {
        const file = path.join(root, 'shared/i18n', name + '.json');
        this.addWatchFile(file);
        return JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>;
      };
      const select = (messages: Record<string, string>) =>
        Object.fromEntries(
          Object.entries(messages).filter(
            ([key]) =>
              keys.has(key) ||
              prefixes.some((prefix) => key.startsWith(prefix)),
          ),
        );
      const chinese = select(read('zh'));
      const english = select(read('en'));
      const legacy = Object.fromEntries(
        Object.entries(read('legacy-keys')).filter(([, key]) =>
          Object.hasOwn(chinese, key),
        ),
      );
      return Object.entries({ chinese, english, legacy })
        .map(
          ([name, value]) => `export const ${name} = ${JSON.stringify(value)};`,
        )
        .join('\n');
    },
    generateBundle(_options, bundle) {
      const deferred = new Set([
        ...['en', 'zh', 'legacy-keys'].map((name) =>
          path.join(root, 'shared/i18n', name + '.json'),
        ),
        path.join(root, 'client/extensions/nocobase-agent-chat/panel-body.tsx'),
      ]);
      const visited = new Set<string>();
      const visit = (file: string) => {
        if (visited.has(file)) return;
        visited.add(file);
        const chunk = bundle[file];
        if (chunk?.type !== 'chunk') return;
        for (const id of Object.keys(chunk.modules)) {
          if (deferred.has(id))
            this.error(
              `Startup imports a deferred business resource: ${path.relative(root, id)}`,
            );
        }
        chunk.imports.forEach(visit);
      };
      for (const chunk of Object.values(bundle)) {
        if (chunk.type === 'chunk' && chunk.isEntry) visit(chunk.fileName);
      }
    },
  };
}
