// @ts-nocheck
import { TOPICS_MAX, uniqueTopics } from '../../shared/followed-topics.js';
import { memoryOf, topicsOf } from './execution/memory.js';
// Followed topics (2026-11-10 decision): one list in Project knowledge › Memory, searched by Reddit, Hacker News,
// YouTube, Trends, GitHub hot topics and AI questions besides the product name. This service reads the list for the
// sources, moves the lists those sources kept before into it once, and tells them when it changed.
//
// The move (`migrate`, at every start until each project has the list): AI questions' topics, then Trends' followed
// keywords, then GitHub hot topics' topics, repeats counted once (low-code and Low code are one topic). Nothing is
// dropped: a project that followed more than TOPICS_MAX keeps them all and is asked to trim the list, and the sources
// search the first TOPICS_MAX meanwhile. Each source keeps what it read for a topic that stays in the list.
class FollowedTopics {
  constructor(p) {
    this.p = p;
  }
  // The topics a source searches: the first TOPICS_MAX, or null while the project's lists have not been moved here.
  async of(id) {
    const project = await this.p.projects.get(String(id)).catch(() => null);
    const list = topicsOf(project);
    return list ? list.slice(0, TOPICS_MAX) : null;
  }
  // What each source followed before the shared list, in the order above.
  async legacy(id) {
    const read = async (fn) => {
      try {
        return (await fn()) || null;
      } catch {
        return null;
      }
    };
    const ai = await read(() => this.p.aiQuestions?.state(id)),
      trends = await read(() => this.p.trends?.state(id)),
      github = await read(() => this.p.githubTrends?.state(id));
    return uniqueTopics([
      ...(ai?.topics || []).map((t) => t.keyword),
      ...(trends?.keywords || []).map((k) => k.keyword),
      ...(github?.topics || []),
    ]);
  }
  // Once per project: the sources' lists become the project's followed topics. A project without any gets an empty list,
  // so the move is not tried again; one that fails is tried at the next start.
  async migrate() {
    let moved = 0;
    for (const project of await this.p.projects.all()) {
      if (topicsOf(project)) continue;
      const id = String(project.id);
      try {
        const topics = await this.legacy(id);
        await this.p.projects.update(id, (cur) =>
          topicsOf(cur)
            ? cur
            : { ...cur, memory: { ...memoryOf(cur), topics } },
        );
        if (topics.length) moved++;
      } catch (e) {
        this.p.app?.logger?.warn?.('NocoReach followed topics were not moved', {
          projectId: id,
          message: e?.message,
        });
      }
    }
    return moved;
  }
  // After the list changed in Memory: the sources that read on a schedule pick up a new topic at their next run; the
  // ones that keep a copy of the list (Trends, AI questions, GitHub hot topics) take it now and read new topics.
  changed(id) {
    for (const source of [
      this.p.trends,
      this.p.aiQuestions,
      this.p.githubTrends,
    ])
      if (source?.topicsChanged)
        Promise.resolve()
          .then(() => source.topicsChanged(String(id)))
          .catch((e) =>
            this.p.app?.logger?.warn?.(
              'NocoReach followed topics did not reach a source',
              { projectId: String(id), message: e?.message },
            ),
          );
  }
}
export { FollowedTopics };
