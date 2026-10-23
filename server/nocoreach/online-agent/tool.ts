import type { z } from 'zod';

/** What the model is told about a tool; it does not depend on who calls it. */
export interface OnlineToolSpec {
  description: string;
  input: z.ZodType;
}
export interface OnlineTool extends OnlineToolSpec {
  name: string;
  execute(args: unknown): Promise<unknown>;
}
/** Who a tool call acts for, from the Agents plugin's tool context, never from model input. */
export interface OnlineBinding {
  ownerId: string;
  projectId: string | null;
  /** One model turn: the same input within it is one business request. */
  turnId: string;
  signal: AbortSignal;
}
