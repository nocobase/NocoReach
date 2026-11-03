import { describe, expect, test } from 'vitest';
import {
  prRepo,
  repoForPage,
  repoUrlKey,
  repoUrlsInput,
  routeRepo,
  startedRepo,
  urlOwner,
} from '../../shared/repo-routing.js';

const repo = (id: string, urls: string[]) => ({
  id,
  repo: `nocobase/${id}`,
  baseBranch: 'main',
  allowedPaths: [],
  contentCheck: true,
  urls,
});
const website = repo('website', ['www.nocobase.com']);
const v3 = repo('website-v3', ['nocobase.com', 'docs.nocobase.com']);
const legacyDocs = repo('docs', ['www.nocobase.com/docs']);

describe('website source addresses', () => {
  test('are written as host and path, without scheme, query or trailing slash', () => {
    expect(repoUrlKey('https://Docs.NocoBase.com/guide/?a=1#x')).toBe(
      'docs.nocobase.com/guide',
    );
    expect(repoUrlKey('www.nocobase.com/')).toBe('www.nocobase.com');
    expect(repoUrlKey('http://localhost:3000')).toBeNull();
    expect(repoUrlKey('not an address')).toBeNull();
    expect(repoUrlsInput(['nocobase.com', 'https://nocobase.com/'])).toEqual([
      'nocobase.com',
    ]);
    expect(repoUrlsInput(['ok.com', 'no address'])).toBeNull();
    expect(repoUrlsInput(undefined)).toEqual([]);
  });

  test('a page goes to the longest address that serves it, on its own host only', () => {
    const repos = [website, v3, legacyDocs];
    expect(repoForPage(repos, 'https://www.nocobase.com/docs/api')).toEqual({
      repo: legacyDocs,
      url: 'www.nocobase.com/docs',
    });
    expect(repoForPage(repos, 'https://www.nocobase.com/docsearch')?.repo).toBe(
      website,
    );
    expect(repoForPage(repos, 'https://docs.nocobase.com/a')?.repo).toBe(v3);
    expect(repoForPage(repos, 'https://nocobase.com/')?.repo).toBe(v3);
    expect(repoForPage(repos, 'https://forum.nocobase.com/t/1')).toBeNull();
  });
});

describe('which repository a task changes', () => {
  test('one repository serves every page', () => {
    expect(routeRepo([website], ['https://elsewhere.example/x'])).toEqual({
      repo: website,
      by: 'single',
    });
  });

  test('several: the one serving the pages; pages of no repository do not count', () => {
    expect(
      routeRepo(
        [website, v3],
        ['https://docs.nocobase.com/a', 'https://forum.nocobase.com/t/1'],
      ),
    ).toEqual({
      repo: v3,
      by: 'page',
      page: 'https://docs.nocobase.com/a',
      url: 'docs.nocobase.com',
    });
  });

  test('several: none or different ones serving the pages leave the choice to a person', () => {
    expect(
      routeRepo([website, v3], ['https://forum.nocobase.com/t/1']),
    ).toEqual({ repo: null, by: 'none' });
    expect(routeRepo([website, v3], [])).toEqual({ repo: null, by: 'none' });
    expect(
      routeRepo(
        [website, v3],
        ['https://docs.nocobase.com/a', 'https://www.nocobase.com/b'],
      ),
    ).toEqual({ repo: null, by: 'mixed' });
    expect(routeRepo([], ['https://www.nocobase.com/b'])).toEqual({
      repo: null,
      by: 'none',
    });
  });

  test('a started task keeps the repository chosen at its start', () => {
    const kept = {
      repo: 'nocobase/website',
      baseBranch: 'release',
      allowedPaths: [],
      contentCheck: true,
    };
    expect(startedRepo([v3], { repo: kept }, [])).toBe(kept);
    expect(
      startedRepo([v3], { repo: null }, ['https://nocobase.com/']),
    ).toBeNull();
  });

  test('a task started before several repositories keeps the one its pull request is in', () => {
    const work = {
      results: [
        null,
        { pr: { url: 'https://github.com/nocobase/website/pull/188' } },
      ],
    };
    expect(startedRepo([website, v3], work, [])).toMatchObject({
      id: 'website',
      repo: 'nocobase/website',
    });
    // Even once it was removed: the pull request is still there.
    expect(startedRepo([v3], work, [])).toEqual({
      repo: 'nocobase/website',
      baseBranch: 'main',
      allowedPaths: [],
      contentCheck: true,
    });
    expect(
      startedRepo([website, v3], {}, ['https://docs.nocobase.com/a']),
    ).toMatchObject({ id: 'website-v3' });
    expect(prRepo('https://github.com/a/b/pull/3')).toBe('a/b');
    expect(prRepo('https://gitlab.com/a/b/pull/3')).toBeNull();
  });

  test('an address belongs to one repository', () => {
    expect(urlOwner([website, v3], 'docs.nocobase.com')).toBe(v3);
    expect(
      urlOwner([website, v3], 'docs.nocobase.com', 'website-v3'),
    ).toBeNull();
  });
});
