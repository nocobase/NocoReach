/* eslint-disable react-refresh/only-export-components -- the article editor shares the toolbar's labels and keys */
import {
  useDeferredValue,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  Bold,
  Code,
  Heading,
  ImagePlus,
  Italic,
  Link,
  List,
  ListOrdered,
  Quote,
  type LucideIcon,
} from 'lucide-react';
import { $t } from '#i18n';
import { cn } from '#lib/utils';
import { useMediaQuery } from '#hooks/use-media-query';
import { Segmented } from '#components/reach/segmented';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from '#components/ui/input-group';
import { Kbd } from '#components/ui/kbd';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '#components/ui/tooltip';
import {
  formatMarkdown,
  type MarkdownEdit,
  type MarkdownStyle,
} from './markdown-format.js';
import { TASK_IMAGE_ACCEPT } from '../../../shared/task-images.js';

// Markdown written with its rendering in view (2026-10-23 user request, as dev.to's editor): side by side from 1024px,
// Write and Preview tabs below that. The preview follows the text as it is typed. A toolbar over the text formats it
// (2026-11-04 user request, as dev.to's editor: the buttons say what can be done instead of a line of hints under the
// box), and ⌘B, ⌘I and ⌘K (Ctrl elsewhere) make the selection bold, italic or a link, as GitHub's comment box does.
// Where the box takes images, the toolbar's image button picks them; pasting or dropping them works as well.

const KEYS: Record<string, MarkdownStyle> = {
  b: 'bold',
  i: 'italic',
  k: 'link',
};

/** The toolbar, in dev.to's order. */
const TOOLS: { style: MarkdownStyle; icon: LucideIcon; key?: string }[] = [
  { style: 'bold', icon: Bold, key: 'B' },
  { style: 'italic', icon: Italic, key: 'I' },
  { style: 'link', icon: Link, key: 'K' },
  { style: 'numbered', icon: ListOrdered },
  { style: 'bulleted', icon: List },
  { style: 'heading', icon: Heading },
  { style: 'quote', icon: Quote },
  { style: 'code', icon: Code },
];
export const TOOL_LABELS: Record<MarkdownStyle, string> = {
  bold: 'markdownEditor.bold',
  italic: 'markdownEditor.italic',
  link: 'markdownEditor.link',
  numbered: 'markdownEditor.numberedList',
  bulleted: 'markdownEditor.bulletedList',
  heading: 'markdownEditor.heading',
  quote: 'markdownEditor.quote',
  code: 'markdownEditor.code',
};

export const apple = () => /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
/** ⌘ on Apple devices, where Ctrl+B and Ctrl+K move the cursor and delete a line; Ctrl elsewhere. */
function command(event: KeyboardEvent) {
  return apple()
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

/**
 * A toolbar button, named in its tooltip; a click leaves the cursor in the text instead of taking focus from it.
 * `pressed` shows a style already applied where the cursor is (the article editor, which shows formatting).
 */
export function ToolButton({
  label,
  tip,
  disabled,
  pressed,
  onClick,
  children,
}: {
  label: string;
  tip: ReactNode;
  disabled: boolean;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <InputGroupButton
            size='icon-sm'
            aria-label={label}
            aria-pressed={pressed}
            className='aria-pressed:bg-muted'
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={onClick}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}

export function MarkdownEditor({
  value,
  preview,
  className,
  onKeyDown,
  onImages,
  ...textarea
}: Omit<ComponentProps<'textarea'>, 'value' | 'children'> & {
  value: string;
  /** What the text looks like rendered; given the text after typing settles. */
  preview: (value: string) => ReactNode;
  /** Images picked with the toolbar's image button, to put in at the cursor of `box`; no button without it. */
  onImages?: (box: HTMLTextAreaElement, files: File[]) => void;
}) {
  const wide = useMediaQuery('(min-width: 1024px)');
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const shown = useDeferredValue(value);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  const locked = Boolean(textarea.disabled || textarea.readOnly);
  const format = (style: MarkdownStyle) => {
    const box = boxRef.current;
    if (!box || box.readOnly || box.disabled) return;
    box.focus();
    apply(
      box,
      formatMarkdown(box.value, box.selectionStart, box.selectionEnd, style),
    );
  };
  const mod = apple() ? '⌘' : 'Ctrl';
  const toolbar = (
    <InputGroupAddon
      align='block-start'
      role='toolbar'
      aria-label={$t('markdownEditor.toolbar')}
      aria-controls={textarea.id}
      className='cursor-default gap-0.5 rounded-t-lg border-b bg-muted/50 px-1.5 py-1 text-foreground'
    >
      <TooltipProvider>
        {TOOLS.map(({ style, icon: Icon, key }) => {
          const label = $t(TOOL_LABELS[style]);
          return (
            <ToolButton
              key={style}
              label={label}
              disabled={locked}
              onClick={() => format(style)}
              tip={
                <>
                  {label}
                  {key && <Kbd>{`${mod} ${key}`}</Kbd>}
                </>
              }
            >
              <Icon />
            </ToolButton>
          );
        })}
        {onImages && (
          <ToolButton
            label={$t('taskImages.add')}
            disabled={locked}
            onClick={() => pickerRef.current?.click()}
            tip={$t('taskImages.add')}
          >
            <ImagePlus />
          </ToolButton>
        )}
      </TooltipProvider>
    </InputGroupAddon>
  );
  const editor = (
    <InputGroup className='h-auto'>
      {onImages && (
        // Hidden rather than visually hidden, so the frame does not focus it on a click beside the buttons.
        <input
          ref={pickerRef}
          type='file'
          multiple
          accept={TASK_IMAGE_ACCEPT}
          hidden
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = '';
            const box = boxRef.current;
            if (!box || !files.length) return;
            box.focus();
            onImages(box, files);
          }}
        />
      )}
      {toolbar}
      <InputGroupTextarea
        {...textarea}
        ref={boxRef}
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
          // The frame's `flex-1` would otherwise size the box by its content instead of this height.
          'field-sizing-fixed h-[32rem] flex-none resize-y px-3 font-mono leading-6',
          className,
        )}
      />
    </InputGroup>
  );
  const rendered = (height: string) => (
    <div
      className={cn('min-w-0 overflow-y-auto', height)}
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
        {/* As tall as the box beside it, however it is resized. */}
        <div className='relative min-w-0 border-l'>
          {rendered('absolute inset-y-0 right-0 left-6')}
        </div>
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
      {tab === 'write' ? editor : rendered('h-[32rem]')}
    </div>
  );
}
