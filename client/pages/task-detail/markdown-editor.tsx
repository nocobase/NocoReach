import {
  useDeferredValue,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { $t } from '#i18n';
import { cn } from '#lib/utils';
import { useMediaQuery } from '#hooks/use-media-query';
import { Segmented } from '#components/reach/segmented';
import { Textarea } from '#components/ui/textarea';
import {
  formatMarkdown,
  type MarkdownEdit,
  type MarkdownStyle,
} from './markdown-format.js';

// Markdown written with its rendering in view (2026-10-23 user request, as dev.to's editor): side by side from 1024px,
// Write and Preview tabs below that. The preview follows the text as it is typed. ⌘B, ⌘I and ⌘K (Ctrl elsewhere)
// make the selection bold, italic or a link (2026-11-04 user request, as GitHub's comment box).

const KEYS: Record<string, MarkdownStyle> = {
  b: 'bold',
  i: 'italic',
  k: 'link',
};

/** ⌘ on Apple devices, where Ctrl+B and Ctrl+K move the cursor and delete a line; Ctrl elsewhere. */
function command(event: KeyboardEvent) {
  const apple = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
  return apple
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
}

/** `insertText` (or `delete`) on the focused box, as typing would, which joins the browser's undo history. */
function typeText(text: string) {
  try {
    return (
      typeof document.execCommand === 'function' &&
      document.execCommand(text ? 'insertText' : 'delete', false, text)
    );
  } catch {
    return false;
  }
}
/** Write the edit so ⌘Z takes it back; where the browser lacks the command, set the value and announce it as input. */
function apply(box: HTMLTextAreaElement, edit: MarkdownEdit) {
  box.setSelectionRange(edit.from, edit.to);
  if (!typeText(edit.text)) {
    box.setRangeText(edit.text, edit.from, edit.to);
    box.dispatchEvent(new Event('input', { bubbles: true }));
  }
  box.setSelectionRange(...edit.select);
}

export function MarkdownEditor({
  value,
  preview,
  className,
  onKeyDown,
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
      onKeyDown={(event) => {
        onKeyDown?.(event);
        const style = KEYS[event.key.toLowerCase()];
        if (
          !style ||
          event.defaultPrevented ||
          event.altKey ||
          event.shiftKey ||
          event.nativeEvent.isComposing ||
          !command(event)
        )
          return;
        event.preventDefault();
        const box = event.currentTarget;
        if (box.readOnly || box.disabled) return;
        apply(
          box,
          formatMarkdown(
            box.value,
            box.selectionStart,
            box.selectionEnd,
            style,
          ),
        );
      }}
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
