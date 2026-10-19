import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  createMemoryRouter,
  RouterProvider,
  useBlocker,
  useLocation,
} from 'react-router';
import { afterEach, expect, test, vi } from 'vitest';
import { MarkdownView } from '../../client/components/markdown-view.js';

vi.mock('@nocobase/app-client', () => ({
  resolveAppBase: () => '/nested/main/',
}));
afterEach(cleanup);
function Location() {
  const location = useLocation();
  return <p>{location.pathname + location.search + location.hash}</p>;
}
function Guarded() {
  const blocker = useBlocker(true);
  return (
    <>
      <MarkdownView content='[任务](/nested/main/actions/42?projectId=2#result)' />
      {blocker.state === 'blocked' && (
        <button onClick={() => blocker.proceed()}>Continue</button>
      )}
    </>
  );
}
function setup(element: React.ReactElement) {
  const router = createMemoryRouter(
    [
      { path: '/chat', element },
      { path: '/actions/:id', element: <Location /> },
    ],
    { basename: '/nested/main', initialEntries: ['/nested/main/chat'] },
  );
  render(<RouterProvider router={router} />);
}

test.each([
  '/nested/main/actions/42?projectId=2#result',
  `${window.location.origin}/nested/main/actions/42?projectId=2#result`,
])('internal URL %s navigates in the same application', async (href) => {
  setup(<MarkdownView content={`[任务](${href})`} />);
  const link = screen.getByRole('link', { name: '任务' });
  expect(link).not.toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute(
    'href',
    '/nested/main/actions/42?projectId=2#result',
  );
  fireEvent.click(link);
  expect(
    await screen.findByText('/actions/42?projectId=2#result'),
  ).toBeInTheDocument();
});

test('internal navigation obeys the existing router draft blocker', async () => {
  setup(<Guarded />);
  fireEvent.click(screen.getByRole('link', { name: '任务' }));
  expect(
    await screen.findByRole('button', { name: 'Continue' }),
  ).toBeInTheDocument();
  expect(
    screen.queryByText('/actions/42?projectId=2#result'),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(
    await screen.findByText('/actions/42?projectId=2#result'),
  ).toBeInTheDocument();
});

test.each([
  'https://example.com/page',
  '/nested/main-other/actions/42',
  '/nested/main/projects',
  '/nested/main/actions',
  '/nested/main/actions/42/results',
  '/nested/main/api/files/download',
  '/nested/main/assets/example.pdf',
])('URL %s stays a browser link', (href) => {
  setup(<MarkdownView content={`[来源](${href})`} />);
  expect(screen.getByRole('link', { name: '来源' })).toHaveAttribute(
    'target',
    '_blank',
  );
});
