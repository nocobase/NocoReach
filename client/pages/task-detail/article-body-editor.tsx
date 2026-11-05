import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Extension, mergeAttributes, type Editor } from '@tiptap/core';
import { Image, type ImageOptions } from '@tiptap/extension-image';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
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
import { createUuid } from '@nocobase/app-client';
import { $t } from '#i18n';
import { cn } from '#lib/utils';
import { Button } from '#components/ui/button';
import { Kbd } from '#components/ui/kbd';
import { TooltipProvider } from '#components/ui/tooltip';
import {
  mergeExtensions,
  richTextExtensions,
} from '#components/rich-text-markdown';
import {
  TASK_IMAGE_ACCEPT,
  TASK_IMAGE_TYPES,
  taskImageOf,
  taskImageRef,
} from '../../../shared/task-images.js';
import {
  readMarkdown,
  writeMarkdown,
  type MarkdownSource,
} from './faithful-markdown.js';
import { InlineRewrite } from './inline-rewrite.js';
import {
  InlineRewriteMarks,
  type RewriteHost,
} from './inline-rewrite-marks.js';
import { apple, TOOL_LABELS, ToolButton } from './markdown-editor.js';
import { siteUrl } from './article-text.js';
import {
  ArticleImageNotesContext,
  imageProblem,
  taskImageSrc,
  useImageUpload,
} from './task-images-model.js';
import './article-preview.css';
import './article-editor.css';

// The article body edited as it reads (2026-11-04 user request, as NocoBase 2's Markdown Vditor field and NocoBase
// 3's rich text editor): what the reviewer sees is the article, and they change it in place. The toolbar keeps the
// Markdown editor's buttons and shortcuts (#371). What is saved is still the article's Markdown, with every block
// nobody touched exactly as it was (faithful-markdown.ts).

type ArticleImageOptions = ImageOptions & {
  /** Where the browser loads an image from; the Markdown keeps the article's own address. */
  resolve: (src: string) => string;
  /** The review note for a new task image (where it came from), or none. */
  note: (src: string) => string;
};

/** Images as the article shows them, with the review note a new image has, as the preview does. */
const ArticleImage = Image.extend<ArticleImageOptions>({
  addOptions() {
    return {
      ...this.parent!(),
      resolve: (src: string) => src,
      note: () => '',
    };
  },
  renderHTML({ node, HTMLAttributes }) {
    const src = String(node.attrs.src ?? '');
    const image = [
      'img',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        src: this.options.resolve(src),
      }),
    ] as const;
    const note = this.options.note(src);
    return note
      ? [
          'span',
          { class: 'nr-article-figure' },
          image,
          [
            'span',
            { class: 'nr-article-image-note', 'data-review-only': '' },
            note,
          ],
        ]
      : image;
  },
});

/** ⌘K (Ctrl elsewhere) opens the link box, as in the Markdown editor. */
const LinkKey = Extension.create<{ open: () => void }>({
  name: 'nrLinkKey',
  addOptions: () => ({ open: () => {} }),
  addKeyboardShortcuts() {
    return {
      'Mod-k': () => {
        this.options.open();
        return true;
      },
    };
  },
});

const stem = (name: string) => name.replace(/\.[^.]+$/, '');
const blob = (src: string) => src.startsWith('blob:');

type Tool = {
  label: string;
  icon: LucideIcon;
  key?: string;
  run: (editor: Editor) => void;
  active: (editor: Editor) => boolean;
};

/** The Markdown editor's toolbar, in its order; the link button opens the link box instead. */
const TOOLS: Tool[] = [
  {
    label: TOOL_LABELS.bold,
    icon: Bold,
    key: 'B',
    run: (e) => e.chain().focus().toggleBold().run(),
    active: (e) => e.isActive('bold'),
  },
  {
    label: TOOL_LABELS.italic,
    icon: Italic,
    key: 'I',
    run: (e) => e.chain().focus().toggleItalic().run(),
    active: (e) => e.isActive('italic'),
  },
  {
    label: TOOL_LABELS.link,
    icon: Link,
    key: 'K',
    run: () => {},
    active: (e) => e.isActive('link'),
  },
  {
    label: TOOL_LABELS.numbered,
    icon: ListOrdered,
    run: (e) => e.chain().focus().toggleOrderedList().run(),
    active: (e) => e.isActive('orderedList'),
  },
  {
    label: TOOL_LABELS.bulleted,
    icon: List,
    run: (e) => e.chain().focus().toggleBulletList().run(),
    active: (e) => e.isActive('bulletList'),
  },
  {
    // ## → ### → body text, as the Markdown toolbar does.
    label: TOOL_LABELS.heading,
    icon: Heading,
    run: (e) => {
      const chain = e.chain().focus();
      if (e.isActive('heading', { level: 2 }))
        chain.setHeading({ level: 3 }).run();
      else if (e.isActive('heading')) chain.setParagraph().run();
      else chain.setHeading({ level: 2 }).run();
    },
    active: (e) => e.isActive('heading'),
  },
  {
    label: TOOL_LABELS.quote,
    icon: Quote,
    run: (e) => e.chain().focus().toggleBlockquote().run(),
    active: (e) => e.isActive('blockquote'),
  },
  {
    // Words selected within a paragraph become inline code; otherwise the paragraph becomes a code block.
    label: TOOL_LABELS.code,
    icon: Code,
    run: (e) => {
      const { from, to, $from, $to } = e.state.selection;
      const chain = e.chain().focus();
      if (from !== to && $from.sameParent($to) && !e.isActive('codeBlock'))
        chain.toggleCode().run();
      else chain.toggleCodeBlock().run();
    },
    active: (e) => e.isActive('code') || e.isActive('codeBlock'),
  },
];

/** The link being edited: the range it covers (the selection, or the whole link the cursor is in) and its address. */
type LinkEdit = { from: number; to: number; href: string; existing: boolean };

export function ArticleBodyEditor({
  value,
  onChange,
  readOnly,
  takesImages,
  pageUrl,
  rewrite,
  onUploading,
  className,
  id,
  'aria-label': ariaLabel,
  'aria-invalid': invalid,
  'aria-describedby': describedBy,
}: {
  value: string;
  onChange: (markdown: string) => void;
  readOnly?: boolean;
  /** Whether the toolbar offers images and pasted or dropped ones are uploaded. */
  takesImages?: boolean;
  /** The article's page on its site, for its relative images. */
  pageUrl?: string;
  /** Select → rewrite with AI; not offered without it. */
  rewrite?: RewriteHost;
  /** Whether images are still uploading; the body is not handed back until they are in. */
  onUploading?: (uploading: boolean) => void;
  className?: string;
  /** The editable area's id, so a problem with the body can focus it. */
  id?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}) {
  const upload = useImageUpload();
  const notes = useContext(ArticleImageNotesContext);
  const [problem, setProblem] = useState('');
  const [pending, setPending] = useState(0);
  const [link, setLink] = useState<LinkEdit | null>(null);
  const [href, setHref] = useState('');
  const frameRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const startRewriteRef = useRef<() => void>(() => {});
  const sourceRef = useRef<MarkdownSource | null>(null);
  const emittedRef = useRef(value);
  const pendingRef = useRef(0);
  // The latest props for the editor's callbacks, which are fixed when it is made.
  const liveRef = useRef({ onChange, pageUrl, notes, takesImages, readOnly });

  const openLink = () => {
    const e = editorRef.current;
    if (!e || !e.isEditable) return;
    if (e.isActive('link')) {
      const attrs = e.getAttributes('link');
      e.chain().extendMarkRange('link').run();
      const { from, to } = e.state.selection;
      setLink({ from, to, href: String(attrs.href ?? ''), existing: true });
      setHref(String(attrs.href ?? ''));
    } else {
      const { from, to } = e.state.selection;
      setLink({ from, to, href: '', existing: false });
      setHref('');
    }
  };
  const openLinkRef = useRef(openLink);

  /** Shown at once from the file, then pointed at the uploaded copy; one that fails is taken out again. */
  const addImages = (e: Editor, files: File[], at?: number) => {
    if (!liveRef.current.takesImages || !e.isEditable) return;
    const problems: string[] = [];
    const accepted = files.filter((file) => {
      const why = imageProblem(file, 0, Infinity);
      if (why && !problems.includes(why)) problems.push(why);
      return !why;
    });
    setProblem(problems.join(' '));
    for (const file of accepted) {
      const local = URL.createObjectURL(file);
      const node = {
        type: 'image',
        attrs: { src: local, alt: stem(file.name) },
      };
      // Counted first, so the insert itself does not hand back the body with the file's local address.
      pendingRef.current++;
      setPending((n) => n + 1);
      const chain = e.chain().focus();
      (at === undefined
        ? chain.insertContent(node)
        : chain.insertContentAt(at, node)
      ).run();
      const swap = (src: string | null) => {
        pendingRef.current--;
        if (e.isDestroyed) return;
        let tr = e.state.tr;
        e.state.doc.descendants((n, pos) => {
          if (n.type.name !== 'image' || n.attrs.src !== local) return true;
          const mapped = tr.mapping.map(pos);
          tr = src
            ? tr.setNodeMarkup(mapped, undefined, { ...n.attrs, src })
            : tr.delete(mapped, mapped + n.nodeSize);
          return false;
        });
        if (tr.docChanged) e.view.dispatch(tr);
        URL.revokeObjectURL(local);
        // Handed back now that no image is waiting, with whatever was typed meanwhile.
        emitRef.current(e);
      };
      upload(file, createUuid())
        .then(
          (image) => swap(image.ref),
          () => {
            swap(null);
            setProblem($t('taskImages.uploadFailed', { 0: file.name }));
          },
        )
        .finally(() => setPending((n) => n - 1));
    }
  };
  const addRef = useRef(addImages);

  /** The body handed back as Markdown, unless an image is still uploading (its address is not the article's yet). */
  const emit = (e: Editor) => {
    if (pendingRef.current > 0) return;
    // A change can come before the editor says it is ready (onCreate waits a tick): the source is what it was made from.
    sourceRef.current ??= readMarkdown(e, emittedRef.current);
    const markdown = writeMarkdown(e, sourceRef.current);
    if (markdown === emittedRef.current) return;
    emittedRef.current = markdown;
    liveRef.current.onChange(markdown);
  };
  const emitRef = useRef(emit);

  // The extensions' callbacks read the latest handlers when the editor calls them, never while rendering.
  // eslint-disable-next-line react-hooks/refs
  const [extensions] = useState(() =>
    mergeExtensions(
      richTextExtensions({
        files: {
          allowedMimeTypes: [...TASK_IMAGE_TYPES],
          onPaste: (e, files) => addRef.current(e, files),
          onDrop: (e, files, at) => addRef.current(e, files, at),
        },
      }),
      [
        ArticleImage.configure({
          resolve: (src) => {
            if (blob(src)) return src;
            const task = taskImageOf(src);
            return task
              ? taskImageSrc(taskImageRef(task.id, task.ext))
              : siteUrl(src, liveRef.current.pageUrl) || src;
          },
          note: (src) =>
            liveRef.current.notes?.get(taskImageOf(src)?.id || '') ?? '',
        }),
        LinkKey.configure({ open: () => openLinkRef.current() }),
        InlineRewriteMarks.configure({
          start: () => startRewriteRef.current(),
        }),
      ],
    ),
  );

  const attributes: Record<string, string> = {
    class: cn(
      'nr-article nr-article-body nr-article-editor max-w-none px-5 py-4 outline-none',
      className,
    ),
    role: 'textbox',
    'aria-multiline': 'true',
    ...(id ? { id } : {}),
    ...(ariaLabel ? { 'aria-label': ariaLabel } : {}),
    ...(invalid ? { 'aria-invalid': 'true' } : {}),
    ...(describedBy ? { 'aria-describedby': describedBy } : {}),
    ...(readOnly ? { 'aria-readonly': 'true' } : {}),
  };
  const attributesKey = JSON.stringify(attributes);
  const editor = useEditor({
    extensions,
    content: value,
    contentType: 'markdown',
    editable: !readOnly,
    shouldRerenderOnTransaction: false,
    editorProps: { attributes },
    onCreate: ({ editor: e }) => {
      sourceRef.current = readMarkdown(e, value);
      emittedRef.current = value;
    },
    onUpdate: ({ editor: e }) => emitRef.current(e),
  });
  const editorRef = useRef(editor);
  // The latest props and handlers for the editor's callbacks, which are fixed when it is made.
  useLayoutEffect(() => {
    liveRef.current = { onChange, pageUrl, notes, takesImages, readOnly };
    openLinkRef.current = openLink;
    addRef.current = addImages;
    emitRef.current = emit;
    editorRef.current = editor;
  });

  // A body from outside (another version, the draft discarded): shown, and read again as the source to keep.
  useEffect(() => {
    if (!editor || value === emittedRef.current) return;
    editor.commands.setContent(value, {
      contentType: 'markdown',
      emitUpdate: false,
    });
    sourceRef.current = readMarkdown(editor, value);
    emittedRef.current = value;
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(!readOnly, false);
  }, [editor, readOnly]);

  useEffect(() => onUploading?.(pending > 0), [onUploading, pending]);

  // A problem shown or cleared, or the editor turned read-only, after it was made.
  useEffect(() => {
    if (editor && !editor.isDestroyed)
      editor.setOptions({
        editorProps: {
          ...editor.options.editorProps,
          attributes: JSON.parse(attributesKey) as Record<string, string>,
        },
      });
  }, [editor, attributesKey]);

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? Object.fromEntries(TOOLS.map((tool) => [tool.label, tool.active(e)]))
        : {},
  });

  // The link box goes under the text it links.
  const [linkSpot, setLinkSpot] = useState<{
    top: number;
    left: number;
  } | null>(null);
  useLayoutEffect(() => {
    const box = frameRef.current;
    if (!link || !editor || !box) {
      setLinkSpot(null);
      return;
    }
    const origin = box.getBoundingClientRect();
    const at = editor.view.coordsAtPos(
      Math.min(link.to, editor.state.doc.content.size),
    );
    setLinkSpot({ top: at.bottom - origin.top + 8, left: 12 });
  }, [link, editor]);
  useEffect(() => {
    if (link) linkRef.current?.focus();
  }, [link]);

  const applyLink = (remove = false) => {
    if (!editor || !link) return;
    const address = href.trim();
    const chain = editor
      .chain()
      .focus()
      .setTextSelection({ from: link.from, to: link.to });
    if (remove || !address) chain.extendMarkRange('link').unsetLink().run();
    else if (link.from === link.to)
      chain
        .insertContent({
          type: 'text',
          text: address,
          marks: [{ type: 'link', attrs: { href: address } }],
        })
        .run();
    else chain.extendMarkRange('link').setLink({ href: address }).run();
    setLink(null);
  };
  const linkKeys = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      applyLink();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setLink(null);
      editor?.commands.focus();
    }
  };

  const mod = apple() ? '⌘' : 'Ctrl';
  return (
    <div className='flex min-w-0 flex-col gap-1.5'>
      <div
        ref={frameRef}
        data-article-editor=''
        className={cn(
          'relative min-w-0 rounded-lg border border-input transition-colors',
          !readOnly &&
            'focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50',
        )}
      >
        {!readOnly && editor && (
          <div
            role='toolbar'
            aria-label={$t('markdownEditor.toolbar')}
            // Under the card's or the page's sticky bar, so the buttons stay in reach down a long article.
            className='sticky top-[var(--nr-sticky-head,0px)] z-[9] flex flex-wrap items-center gap-0.5 rounded-t-lg border-b bg-muted px-1.5 py-1 text-foreground'
          >
            <TooltipProvider>
              {TOOLS.map((tool) => {
                const label = $t(tool.label);
                const Icon = tool.icon;
                return (
                  <ToolButton
                    key={tool.label}
                    label={label}
                    disabled={false}
                    pressed={Boolean(state?.[tool.label])}
                    onClick={() =>
                      tool.label === TOOL_LABELS.link
                        ? openLink()
                        : tool.run(editor)
                    }
                    tip={
                      <>
                        {label}
                        {tool.key && <Kbd>{`${mod} ${tool.key}`}</Kbd>}
                      </>
                    }
                  >
                    <Icon />
                  </ToolButton>
                );
              })}
              {takesImages && (
                <>
                  <input
                    ref={pickerRef}
                    type='file'
                    multiple
                    accept={TASK_IMAGE_ACCEPT}
                    hidden
                    onChange={(event) => {
                      const files = Array.from(event.target.files ?? []);
                      event.target.value = '';
                      if (files.length) addRef.current(editor, files);
                    }}
                  />
                  <ToolButton
                    label={$t('taskImages.add')}
                    disabled={false}
                    onClick={() => pickerRef.current?.click()}
                    tip={$t('taskImages.add')}
                  >
                    <ImagePlus />
                  </ToolButton>
                </>
              )}
            </TooltipProvider>
          </div>
        )}
        <EditorContent editor={editor} />
        {editor && rewrite && !readOnly && (
          <InlineRewrite
            editor={editor}
            host={rewrite}
            frame={frameRef}
            startRef={startRewriteRef}
          />
        )}
        {link && linkSpot && !readOnly && (
          <div
            role='group'
            aria-label={$t('markdownEditor.link')}
            className='absolute z-20 flex w-[min(28rem,calc(100%-1.5rem))] items-center gap-1.5 rounded-xl border bg-background p-1.5 shadow-md'
            style={linkSpot}
          >
            <input
              ref={linkRef}
              value={href}
              onChange={(event) => setHref(event.target.value)}
              onKeyDown={linkKeys}
              inputMode='url'
              aria-label={$t('articleEdit.linkAddress')}
              placeholder='https://'
              className='h-8 min-w-0 flex-1 rounded-md bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground'
            />
            <Button type='button' size='sm' onClick={() => applyLink()}>
              {$t('articleEdit.linkApply')}
            </Button>
            {link.existing && (
              <Button
                type='button'
                size='sm'
                variant='ghost'
                onClick={() => applyLink(true)}
              >
                {$t('articleEdit.linkRemove')}
              </Button>
            )}
          </div>
        )}
      </div>
      {pending > 0 && (
        <p role='status' className='text-sm text-muted-foreground'>
          {$t('articleEdit.uploading')}
        </p>
      )}
      {problem && (
        <p role='alert' className='text-sm text-destructive'>
          {problem}
        </p>
      )}
    </div>
  );
}
