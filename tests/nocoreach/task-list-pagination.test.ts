// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { TaskService } from '../../server/nocoreach/execution/service';
type Find = {
  filter: { projectId?: string; id?: { $in: string[] } };
  fields?: string[];
  sort?: string[];
  limit?: number;
  offset?: number;
};
it('reads past the old task-list cap: the project ids once in order, then the rows by key', async () => {
  const service = Object.create(TaskService.prototype) as TaskService;
  // Newest first, as the database orders them; the key reads also return a row of another project.
  const ids = Array.from({ length: 5201 }, (_, i) => String(9000 - i));
  const find = vi.fn((options: Find) => {
    expect(options.offset).toBeUndefined();
    if (options.filter.projectId)
      return Promise.resolve(ids.map((id) => ({ id })));
    const keys = options.filter.id!.$in;
    expect(keys.length).toBeLessThanOrEqual(200);
    return Promise.resolve([
      ...[...keys].reverse().map((id) => ({ id, projectId: 'project-a' })),
      { id: keys[0], projectId: 'project-b' },
    ]);
  });
  vi.spyOn(service, 'repo').mockReturnValue({ find });
  const tasks = await service.tasks('project-a');
  expect(tasks.map((t) => t.id)).toEqual(ids);
  expect(tasks.every((t) => t.projectId === 'project-a')).toBe(true);
  expect(find).toHaveBeenCalledTimes(1 + Math.ceil(5201 / 200));
  expect(find.mock.calls[0]![0]).toEqual({
    filter: { projectId: 'project-a' },
    fields: ['id'],
    sort: ['-createdAt', '-id'],
  });
});
