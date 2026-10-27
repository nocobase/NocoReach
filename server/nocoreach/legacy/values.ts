import { RepositoryError, type CollectionDefinition } from '@nocobase/db';

/** SQLite does not enforce VARCHAR bounds; validate before writing on every engine. */
export function validateStringLengths(
  collection: CollectionDefinition | undefined,
  values: Record<string, unknown>,
): void {
  for (const field of collection?.fields ?? []) {
    const value = values[field.name];
    if (
      (field.type !== 'string' && field.type !== 'char') ||
      typeof value !== 'string'
    )
      continue;
    const limit = field.length ?? 255;
    // SQL lengths count characters, not JavaScript UTF-16 code units.
    if ([...value].length > limit)
      throw new RepositoryError(
        'INVALID_MUTATION',
        `Field "${field.name}" allows at most ${limit} characters.`,
        {
          collection: collection?.name,
          field: field.name,
          path: ['values', field.name],
        },
      );
  }
}
