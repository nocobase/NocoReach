/** Material references resolve only within the immutable input of the producing run. */
export const taskResultMaterials = [
  'context',
  'sources',
  'knowledge',
  'skills',
] as const;
export type TaskResultMaterial = (typeof taskResultMaterials)[number];
export type TaskResultSource =
  | { title: string; url: string; material?: never }
  | { title: string; material: TaskResultMaterial; url?: never };
