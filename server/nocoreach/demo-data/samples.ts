import type { DemoImportContext } from '@nocobase/app-plugin-demo-mode/server/tokens';

import type { DemoHost } from './host.js';
import { demoSteps } from './steps.js';

/** Shared business generator. Callers supply identities, clock and progress; no lifecycle or seed history is changed. */
export async function generateNocoReachSamples(
  host: DemoHost,
  context: DemoImportContext,
): Promise<void> {
  const steps = demoSteps(host, context.language);
  const total = steps.reduce((sum, step) => sum + (step.weight ?? 1), 0) || 1;
  let done = 0;
  for (const step of steps) {
    const weight = step.weight ?? 1;
    await step.run({
      ...context,
      get data() {
        return context.data;
      },
      progress: (fraction) =>
        context.progress(
          (done + Math.max(0, Math.min(1, fraction)) * weight) / total,
        ),
    });
    done += weight;
    await context.progress(done / total);
  }
}
