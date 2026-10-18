import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, test, vi } from 'vitest';
import { useProject } from '../../client/pages/reach-data.js';
import { ChatMarkdown } from '../../client/extensions/nocobase-agent-chat/chat-markdown.js';

const projects = [
  { id: 1, name: 'First' },
  { id: 2, name: 'Second' },
];
vi.mock('../../client/pages/workspace-cache', () => ({
  useWorkspaceCache: () => ({
    peek: () => projects,
    load: async () => projects,
  }),
}));
function SelectedProject() {
  const { project, error } = useProject();
  return <div>{project?.name || error}</div>;
}
afterEach(() => {
  cleanup();
  localStorage.clear();
});

test('task links retain deployment base and project query in Markdown', () => {
  render(
    <ChatMarkdown content='[市场调研](/nested/main/actions/42?projectId=2)' />,
  );
  expect(screen.getByRole('link', { name: '市场调研' })).toHaveAttribute(
    'href',
    '/nested/main/actions/42?projectId=2',
  );
});

test('a task deep link loads its authorized project instead of the previously selected project', () => {
  localStorage.setItem('nocoreach:project', '1');
  render(
    <MemoryRouter initialEntries={['/actions/42?projectId=2']}>
      <SelectedProject />
    </MemoryRouter>,
  );
  expect(screen.getByText('Second')).toBeInTheDocument();
  expect(localStorage.getItem('nocoreach:project')).toBe('2');
});

test.each(['3', 'invalid'])(
  'an inaccessible or invalid linked project %s does not fall back',
  (projectId) => {
    render(
      <MemoryRouter initialEntries={[`/actions/42?projectId=${projectId}`]}>
        <SelectedProject />
      </MemoryRouter>,
    );
    expect(screen.queryByText('First')).not.toBeInTheDocument();
    expect(screen.queryByText('Second')).not.toBeInTheDocument();
  },
);
