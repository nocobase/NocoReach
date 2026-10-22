/** French, Spanish and Portuguese use the CLDR `many` category for whole millions.
 * Their count labels use the same wording as `other`; keep i18next from falling back
 * to English when the upstream catalog supplies only `one` and `other`.
 */
export function withPluralForms<T>(resource: T): T {
  if (!resource || typeof resource !== 'object' || Array.isArray(resource))
    return resource;
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(resource)) {
    output[key] = withPluralForms(value);
    if (key.endsWith('_other') && typeof value === 'string') {
      const many = `${key.slice(0, -6)}_many`;
      if (!(many in resource)) output[many] = value;
    }
  }
  return output as T;
}
