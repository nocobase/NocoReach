import { ChangeView } from '../change-view';
import { fieldChange } from './article-model';
import { text } from './styles.js';

/**
 * One field's two versions. The address and the status are a single word, so they read inline ("Status Published →
 * Draft") rather than as a diff block with its own tab (2026-10-24 user report); text fields keep the diff.
 */
export function FieldDiff({
  path,
  before,
  after,
}: {
  path: string;
  before: string;
  after: string;
}) {
  const c = fieldChange(path, before, after);
  if (path !== 'slug' && path !== 'status') return <ChangeView changes={[c]} />;
  return (
    <p className={text.body}>
      <span className='text-muted-foreground'>{c.path}</span> {c.before || '—'}{' '}
      → {c.after || '—'}
    </p>
  );
}
