// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { TaskService } from '../../server/nocoreach/execution/service';
it('reads past the old task-list cap and keeps the same project filter for every page', async () => {
  const service = Object.create(TaskService.prototype) as TaskService;
  const find = vi.fn(
    ({
      filter,
      offset,
      limit,
    }: {
      filter: { projectId: string };
      offset: number;
      limit: number;
    }) => {
      expect(filter).toEqual({ projectId: 'project-a' });
      return Promise.resolve(
        Array.from(
          { length: Math.min(limit, Math.max(0, 5201 - offset)) },
          (_, i) => ({ id: offset + i }),
        ),
      );
    },
  );
  vi.spyOn(service, 'repo').mockReturnValue({ find });
  expect((await service.tasks('project-a')).length).toBe(5201);
  expect(find).toHaveBeenCalledTimes(27);
});
