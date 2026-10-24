import {
  useDeferredValue,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { $t } from '#i18n';
import { cn } from '#lib/utils';
import { useMediaQuery } from '#hooks/use-media-query';
import { Segmented } from '#components/reach/segmented';
import { Textarea } from '#components/ui/textarea';

// Markdown written with its rendering in view (2026-10-23 user request, as dev.to's editor): side by side from 1024px,
// Write and Preview tabs below that. The preview follows the text as it is typed.

export function MarkdownEditor({
  value,
  preview,
  className,
  ...textarea
}: Omit<ComponentProps<'textarea'>, 'value' | 'children'> & {
  value: string;
  /** What the text looks like rendered; given the text after typing settles. */
  preview: (value: string) => ReactNode;
}) {
  const wide = useMediaQuery('(min-width: 1024px)');
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const shown = useDeferredValue(value);
  const editor = (
    <Textarea
      {...textarea}
      value={value}
      className={cn(
        'field-sizing-fixed h-[32rem] resize-y font-mono leading-6',
        className,
      )}
    />
  );
  const rendered = (
    <div
      className='h-[32rem] min-w-0 overflow-y-auto'
      aria-label={$t('markdownEditor.preview')}
      role='region'
      data-markdown-preview=''
    >
      {preview(shown)}
    </div>
  );
  if (wide)
    return (
      <div className='grid min-w-0 grid-cols-2 gap-6'>
        {editor}
        <div className='min-w-0 border-l pl-6'>{rendered}</div>
      </div>
    );
  return (
    <div className='flex min-w-0 flex-col gap-2'>
      <Segmented
        label={$t('markdownEditor.mode')}
        value={tab}
        onChange={(id) => setTab(id as 'write' | 'preview')}
        options={[
          { id: 'write', label: $t('markdownEditor.write') },
          { id: 'preview', label: $t('markdownEditor.preview') },
        ]}
        className='self-start'
      />
      {tab === 'write' ? editor : rendered}
    </div>
  );
}
