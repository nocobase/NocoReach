import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import locales from '../../client/locales';
import ProjectKnowledgePage from '../../client/pages/project-knowledge/index';
import KnowledgeAddDialog from '../../client/pages/project-knowledge/knowledge-add';
import KnowledgeTab from '../../client/pages/project-knowledge/knowledge-base';
import KnowledgeItemDrawer from '../../client/pages/project-knowledge/knowledge-item';
import MemoryTab from '../../client/pages/project-knowledge/memory';
import MemoryEditDialog from '../../client/pages/project-knowledge/memory-edit';

// The 项目知识 routes as client/nocoreach-routes.ts declares them, without the lazy loading and the page gates.
export async function mountProjectKnowledge(path = '/project') {
  const runtime = new I18nRuntime({
    defaultLocale: 'zh-CN',
    locales: ['zh-CN', 'en-US'],
    applicationNamespace: 'nocoreach',
  });
  runtime.registerApplicationNamespace('nocoreach', locales);
  await runtime.init();
  const router = createMemoryRouter(
    [
      {
        path: '/project',
        Component: ProjectKnowledgePage,
        children: [
          {
            path: 'memory',
            Component: MemoryTab,
            children: [{ path: ':section/edit', Component: MemoryEditDialog }],
          },
          {
            path: 'knowledge',
            Component: KnowledgeTab,
            children: [
              { path: 'new', Component: KnowledgeAddDialog },
              { path: ':itemId', Component: KnowledgeItemDrawer },
            ],
          },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  render(
    <I18nProvider runtime={runtime}>
      <RouterProvider router={router} />
    </I18nProvider>,
  );
  return router;
}
