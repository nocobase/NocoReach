import {
  Fragment,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Extension, mergeAttributes, type Editor } from '@tiptap/core';
import { Image, type ImageOptions } from '@tiptap/extension-image';
import type { Node as PMNode } from '@tiptap/pm/model';
import { EditorState, Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bold,
  Code,
  Heading,
  ImagePlus,
  Italic,
  Link,
  List,
  ListOrdered,
  Quote,
  Table2,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { createUuid } from '@nocobase/app-client';
import { $t } from '#i18n';
import { cn } from '#lib/utils';
import { Button } from '#components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';
import { InputGroupButton } from '#components/ui/input-group';
import { Kbd } from '#components/ui/kbd';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '#components/ui/tooltip';
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
import {
  hasText,
  ImageTransfers,
  PASTED,
  settled,
  waiting,
  type Transfer,
} from './article-image-transfers.js';
import { headerRowFirst } from './article-table.js';
import { InlineRewrite } from './inline-rewrite.js';
import {
  boxRoom,
  InlineRewriteMarks,
  type RewriteHost,
} from './inline-rewrite-marks.js';
import { apple, TOOL_LABELS, ToolButton } from './markdown-editor.js';
import { siteUrl } from './article-text.js';
import {
  ArticleImageNotesContext,
  imageProblem,
  taskImageSrc,
  useImageImport,
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

/**
 * Images as the article shows them, with the review note a new image has, as the preview does. Each names the
 * article's address for it (`data-nr-src`), so one copied within the editor keeps that address rather than the one the
 * browser loaded, and is not taken for an image from another site; one on its way in carries its transfer
 * (article-image-transfers.ts).
 */
const ArticleImage = Image.extend<ArticleImageOptions>({
  addOptions() {
    return {
      ...this.parent!(),
      resolve: (src: string) => src,
      note: () => '',
    };
  },
  addAttributes() {
    return {
      ...this.parent?.(),
      src: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute('data-nr-src') ?? element.getAttribute('src'),
      },
      transfer: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-nr-transfer'),
        renderHTML: (attributes) =>
          attributes.transfer
            ? { 'data-nr-transfer': String(attributes.transfer) }
            : {},
      },
    };
  },
  renderHTML({ node, HTMLAttributes }) {
    const src = String(node.attrs.src ?? '');
    const image = [
      'img',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        src: this.options.resolve(src),
        'data-nr-src': src,
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

/** The text the open link box links, marked while the box has focus, and where it keeps its room; or none. */
type LinkMarks = { from: number; to: number } | null;
const linkBoxKey = new PluginKey<LinkMarks>('nrLinkBox');

/**
 * ⌘K (Ctrl elsewhere) opens the link box, as in the Markdown editor. While it is open, the text it links stays marked
 * and the box keeps room under its paragraph (`boxRoom`), so it covers none of the article.
 */
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
  addProseMirrorPlugins() {
    return [
      new Plugin<LinkMarks>({
        key: linkBoxKey,
        state: {
          init: () => null,
          apply(tr, marks) {
            const meta = tr.getMeta(linkBoxKey) as
              { set: LinkMarks } | undefined;
            if (meta) return meta.set;
            if (!marks || !tr.docChanged) return marks;
            return {
              from: tr.mapping.map(marks.from, 1),
              to: tr.mapping.map(marks.to, -1),
            };
          },
        },
        props: {
          decorations(state) {
            const marks = linkBoxKey.getState(state);
            if (!marks) return DecorationSet.empty;
            const to = Math.min(marks.to, state.doc.content.size);
            return DecorationSet.create(state.doc, [
              ...(marks.from < to
                ? [
                    Decoration.inline(marks.from, to, {
                      class: 'nr-link-picked',
                    }),
                  ]
                : []),
              boxRoom(state, to, 'link'),
            ]);
          },
        },
      }),
    ];
  },
});

const stem = (name: string) => name.replace(/\.[^.]+$/, '');
const blob = (src: string) => src.startsWith('blob:');

/** A pasted `data:` image as a file to upload, or null when it does not read as one. */
function dataFile(src: string): File | null {
  const match = /^data:([^;,]*)((?:;[^;,]*)*),(.*)$/s.exec(src);
  if (!match) return null;
  try {
    const raw = match[2].includes(';base64')
      ? atob(match[3])
      : decodeURIComponent(match[3]);
    const type = match[1] || 'text/plain';
    return new File(
      [Uint8Array.from(raw, (c) => c.charCodeAt(0))],
      `image.${type.split('/')[1] || 'bin'}`,
      { type },
    );
  } catch {
    return null;
  }
}

/** An address that names its host (http, https or protocol-relative), as a URL; null for any other. */
function webAddress(src: string): URL | null {
  if (!/^(https?:)?\/\//i.test(src)) return null;
  try {
    return new URL(src, 'https://x.invalid');
  } catch {
    return null;
  }
}

/** The editor's state as it is, with nothing to undo: a body put in from outside is where undoing stops. */
function restart(e: Editor) {
  const { doc, selection, plugins } = e.state;
  e.view.updateState(EditorState.create({ doc, selection, plugins }));
}

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

type TableCommand =
  | 'addRowBefore'
  | 'addRowAfter'
  | 'addColumnBefore'
  | 'addColumnAfter'
  | 'deleteRow'
  | 'deleteColumn'
  | 'deleteTable';
type TableAction = {
  label: string;
  icon: LucideIcon;
  command: TableCommand;
  destructive?: boolean;
};

/** What the Table menu does to the table the cursor is in: rows and columns in, then out. */
const TABLE_ACTIONS: TableAction[][] = [
  [
    {
      label: 'articleEdit.tableRowAbove',
      icon: ArrowUp,
      command: 'addRowBefore',
    },
    {
      label: 'articleEdit.tableRowBelow',
      icon: ArrowDown,
      command: 'addRowAfter',
    },
    {
      label: 'articleEdit.tableColumnLeft',
      icon: ArrowLeft,
      command: 'addColumnBefore',
    },
    {
      label: 'articleEdit.tableColumnRight',
      icon: ArrowRight,
      command: 'addColumnAfter',
    },
  ],
  [
    { label: 'articleEdit.tableDeleteRow', icon: X, command: 'deleteRow' },
    {
      label: 'articleEdit.tableDeleteColumn',
      icon: X,
      command: 'deleteColumn',
    },
    {
      label: 'articleEdit.tableDelete',
      icon: Trash2,
      command: 'deleteTable',
      destructive: true,
    },
  ],
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
  const copy = useImageImport();
  const notes = useContext(ArticleImageNotesContext);
  const [problem, setProblem] = useState('');
  const [pending, setPending] = useState(0);
  const [link, setLink] = useState<LinkEdit | null>(null);
  const [href, setHref] = useState('');
  const frameRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const linkBoxRef = useRef<HTMLDivElement>(null);
  const startRewriteRef = useRef<() => void>(() => {});
  const sourceRef = useRef<MarkdownSource | null>(null);
  const emittedRef = useRef(value);
  // Every image on its way in, by its transfer's id (article-image-transfers.ts).
  const [transfers] = useState(() => new Map<string, Transfer>());
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

  /** One more thing that went wrong with images, after any already shown. */
  const tell = (why: string) =>
    setProblem((old) =>
      !why || old.includes(why) ? old : [old, why].filter(Boolean).join(' '),
    );
  const propose = (run: () => Promise<string>, why: string, local?: string) => {
    const id = createUuid();
    transfers.set(id, { state: 'proposed', run, problem: why, local });
    return id;
  };

  /** A transfer whose image went in, run; when it ends its image is put right (`settled`) and the body handed back. */
  const start = (e: Editor, id: string) => {
    const t = transfers.get(id);
    if (!t || t.state !== 'proposed') return;
    t.state = 'running';
    setPending((n) => n + 1);
    void Promise.resolve()
      .then(t.run)
      .then(
        (ref) => {
          t.state = 'done';
          t.ref = ref;
        },
        () => {
          t.state = 'failed';
          tell(t.problem);
        },
      )
      .finally(() => {
        setPending((n) => n - 1);
        if (t.local) URL.revokeObjectURL(t.local);
        if (e.isDestroyed) return;
        const tr = settled(e.state, transfers);
        if (tr) e.view.dispatch(tr);
        emitRef.current(e);
      });
  };
  const startRef = useRef(start);

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
    if (!accepted.length) return;
    const nodes = accepted.map((file) => {
      const local = URL.createObjectURL(file);
      return {
        type: 'image',
        attrs: {
          src: local,
          alt: stem(file.name),
          transfer: propose(
            () => upload(file, createUuid()).then((image) => image.ref),
            $t('taskImages.uploadFailed', { 0: file.name }),
            local,
          ),
        },
      };
    });
    const chain = e.chain().focus();
    (at === undefined
      ? chain.insertContent(nodes)
      : chain.insertContentAt(at, nodes)
    ).run();
  };
  const addRef = useRef(addImages);

  /**
   * A pasted image's way in: one from this editor (a copy) or the article's own site stays as it is, a task image is
   * pointed at by its own address, a `data:` image is uploaded and one from another site copied by the server; one
   * with an address that cannot be read (a local file, another page's `blob:`) is taken out with a message.
   */
  const decide = (node: PMNode): Record<string, unknown> | null => {
    const id = node.attrs.transfer as string | null;
    if (!id || (id !== PASTED && transfers.has(id))) return null;
    const src = String(node.attrs.src ?? '').trim();
    const task = taskImageOf(src);
    if (task) return { src: taskImageRef(task.id, task.ext), transfer: null };
    const fail = (why: string) => ({
      transfer: propose(() => Promise.reject(new Error(why)), why),
    });
    if (src.startsWith('data:')) {
      if (!liveRef.current.takesImages)
        return fail($t('articles.provider.imagesUnsupported'));
      const file = dataFile(src);
      if (!file) return fail($t('taskImages.pasteFailed'));
      const why = imageProblem(file, 0, Infinity);
      return why
        ? fail(why)
        : {
            transfer: propose(
              () => upload(file, createUuid()).then((image) => image.ref),
              $t('taskImages.uploadFailed', { 0: file.name }),
            ),
          };
    }
    const web = webAddress(src);
    if (!web) {
      // A site-relative address is the article's site's own; any other scheme names something only the source had.
      return /^[a-z][a-z0-9+.-]*:/i.test(src) && liveRef.current.takesImages
        ? fail($t('taskImages.pasteFailed'))
        : { transfer: null };
    }
    const site = webAddress(liveRef.current.pageUrl || '')?.host;
    if (!liveRef.current.takesImages || web.host === site)
      return { transfer: null };
    return {
      transfer: propose(
        () => copy(web.href, createUuid()).then((image) => image.ref),
        $t('taskImages.copyFailed', { 0: web.hostname }),
      ),
    };
  };
  const decideRef = useRef(decide);

  /**
   * Image files pasted on their own (a screenshot, Copy image in a browser) are uploaded as files, and the HTML that
   * may come with them is left out, so the image goes in once. With text, what was copied is the HTML, whose images
   * come in by address.
   */
  const paste = (e: Editor, event: ClipboardEvent) => {
    setProblem('');
    const data = event.clipboardData;
    const files = Array.from(data?.files ?? []).filter((file) =>
      file.type.startsWith('image/'),
    );
    if (!files.length || !liveRef.current.takesImages) return false;
    const html = data?.getData('text/html') ?? '';
    if (html && hasText(html)) return false;
    addRef.current(e, files);
    return true;
  };
  const pasteRef = useRef(paste);

  /** The body handed back as Markdown, unless an image is still on its way in (its address is not the article's yet). */
  const emit = (e: Editor) => {
    if (waiting(e.state.doc)) return;
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
        // Pasted files are the editor's own to take (ImageTransfers), so a copied image does not also come in by
        // its address from the HTML beside it.
        files: {
          allowedMimeTypes: [...TASK_IMAGE_TYPES],
          onDrop: (e, files, at) => addRef.current(e, files, at),
        },
      }),
      [
        ArticleImage.configure({
          allowBase64: true,
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
        ImageTransfers.configure({
          transfers,
          start: (e, id) => startRef.current(e, id),
          decide: (node) => decideRef.current(node),
          paste: (e, event) => pasteRef.current(e, event),
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
    startRef.current = start;
    decideRef.current = decide;
    pasteRef.current = paste;
    emitRef.current = emit;
    editorRef.current = editor;
  });

  // A body from outside (the edits saved earlier, another version, the draft discarded): shown, and read again as the
  // source to keep. It is not a step to undo: undoing past it would bring back the body it replaced, which the next
  // save would keep (2026-11-12 user report), so the history starts again from it.
  useEffect(() => {
    if (!editor || value === emittedRef.current) return;
    editor.commands.setContent(value, {
      contentType: 'markdown',
      emitUpdate: false,
    });
    restart(editor);
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
    selector: ({ editor: e }): Record<string, boolean> =>
      e
        ? {
            ...Object.fromEntries(
              TOOLS.map((tool) => [tool.label, tool.active(e)]),
            ),
            table: e.isActive('table'),
          }
        : {},
  });

  // The link box goes under the paragraph of the text it links, in room the article keeps for it as tall as the box,
  // so the text after it moves down instead of being covered (2026-11-09, as the rewrite bar does).
  const [linkSpot, setLinkSpot] = useState<{
    top: number;
    left: number;
  } | null>(null);
  useLayoutEffect(() => {
    const box = frameRef.current;
    if (!editor || editor.isDestroyed) return;
    const marks = link && !readOnly ? { from: link.from, to: link.to } : null;
    const now = linkBoxKey.getState(editor.state);
    if (now?.from !== marks?.from || now?.to !== marks?.to)
      editor.view.dispatch(editor.state.tr.setMeta(linkBoxKey, { set: marks }));
    if (!link || !box) {
      setLinkSpot(null);
      return;
    }
    const place = () => {
      const origin = box.getBoundingClientRect();
      const room = box.querySelector('[data-room="link"]');
      const top = room
        ? room.getBoundingClientRect().top
        : editor.view.coordsAtPos(
            Math.min(link.to, editor.state.doc.content.size),
          ).bottom + 8;
      setLinkSpot({ top: top - origin.top, left: 12 });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [link, editor, readOnly]);
  useLayoutEffect(() => {
    if (linkBoxRef.current)
      frameRef.current?.style.setProperty(
        '--nr-link-room',
        `${linkBoxRef.current.offsetHeight}px`,
      );
  });
  // Once the box is drawn, which is a render after it opens, where its room is known.
  const linkShown = Boolean(link && linkSpot);
  useEffect(() => {
    if (link && linkShown) linkRef.current?.focus();
  }, [link, linkShown]);

  // While the link box is open, Esc closes it wherever focus is (left alone when a menu or dialog took it, or while an
  // IME is composing), and a press outside it closes it with the selection kept, the click then doing what it would
  // have done.
  const linkOpen = Boolean(link);
  useEffect(() => {
    if (!linkOpen) return;
    const keydown = (event: globalThis.KeyboardEvent) => {
      if (
        event.key !== 'Escape' ||
        event.defaultPrevented ||
        event.isComposing ||
        event.keyCode === 229
      )
        return;
      event.preventDefault();
      setLink(null);
      editor?.commands.focus();
    };
    const pointerdown = (event: PointerEvent) => {
      if (!linkBoxRef.current?.contains(event.target as Node | null))
        setLink(null);
    };
    document.addEventListener('keydown', keydown);
    document.addEventListener('pointerdown', pointerdown, true);
    return () => {
      document.removeEventListener('keydown', keydown);
      document.removeEventListener('pointerdown', pointerdown, true);
    };
  }, [linkOpen, editor]);

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
              {state?.table && (
                // Rows and columns of the table the cursor is in (2026-11-12 user report: a table could not grow or
                // shrink); shown only there, as the menu has nothing to do elsewhere.
                <DropdownMenu>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <DropdownMenuTrigger
                          render={
                            <InputGroupButton
                              size='icon-sm'
                              aria-label={$t('articleEdit.table')}
                              className='data-popup-open:bg-muted'
                            />
                          }
                        />
                      }
                    >
                      <Table2 />
                    </TooltipTrigger>
                    <TooltipContent>{$t('articleEdit.table')}</TooltipContent>
                  </Tooltip>
                  <DropdownMenuContent
                    className='w-auto min-w-48'
                    // Back to the article, where the cursor was, rather than to the button.
                    finalFocus={() => editor.view.dom}
                  >
                    {TABLE_ACTIONS.map((group, i) => (
                      <Fragment key={group[0].command}>
                        {i > 0 && <DropdownMenuSeparator />}
                        {group.map((action) => {
                          const Icon = action.icon;
                          return (
                            <DropdownMenuItem
                              key={action.command}
                              variant={
                                action.destructive ? 'destructive' : 'default'
                              }
                              disabled={!editor.can()[action.command]()}
                              onClick={() =>
                                editor
                                  .chain()
                                  .focus()
                                  [action.command]()
                                  .command(headerRowFirst)
                                  .run()
                              }
                            >
                              <Icon />
                              {$t(action.label)}
                            </DropdownMenuItem>
                          );
                        })}
                      </Fragment>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
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
            blocked={Boolean(link)}
            startRef={startRewriteRef}
          />
        )}
        {link && linkSpot && !readOnly && (
          <div
            ref={linkBoxRef}
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
            <Button
              type='button'
              size='sm'
              variant='ghost'
              onClick={() => {
                setLink(null);
                editor?.commands.focus();
              }}
            >
              {$t('articleEdit.cancel')}
              <Kbd>Esc</Kbd>
            </Button>
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
