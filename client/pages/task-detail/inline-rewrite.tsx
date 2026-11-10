import {
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import type { Editor, JSONContent } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import {
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Square,
} from 'lucide-react';
import { $t } from '#i18n';
import { cn } from '#lib/utils';
import { Button } from '#components/ui/button';
import { Kbd } from '#components/ui/kbd';
import { apple } from './markdown-editor.js';
import {
  answerContent,
  rewriteKey,
  type Marks,
  type Phase,
  type RewriteHost,
} from './inline-rewrite-marks.js';

// Select part of the article body and say how to change it (2026-11-04 user request): AI rewrites only the selection,
// streamed in place under it, the old text struck through and the new one marked; the person accepts, discards or
// asks again, and every attempt stays to go back to. Nothing in the article changes until Accept, which ⌘Z undoes.

/**
 * The selection to rewrite: words within one paragraph as they are, or every block a wider selection touches. A whole
 * top-level paragraph counts as a block, so its rewrite shows as a paragraph of its own under the old one.
 */
function pick(editor: Editor) {
  const { state } = editor;
  const { $from, $to, empty } = state.selection;
  let { from, to } = state.selection;
  if (empty) return null;
  const whole =
    $from.depth === 1 && from === $from.start() && to === $from.end();
  if (
    !whole &&
    $from.sameParent($to) &&
    $from.parent.isTextblock &&
    $from.depth === $to.depth
  ) {
    const text = state.doc.textBetween(from, to);
    if (!text.trim()) return null;
    // The answer comes back trimmed, so the spaces around the selected words stay where they are.
    from += text.length - text.trimStart().length;
    to -= text.length - text.trimEnd().length;
    const slice = state.doc.slice(from, to);
    const markdown =
      editor.markdown?.serialize({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: (slice.content.toJSON() as JSONContent[] | null) ?? [],
          },
        ],
      }) ?? text;
    return { from, to, block: false, markdown: markdown.trim() };
  }
  const start = $from.before(1),
    end = $to.after(1);
  const slice = state.doc.slice(start, end);
  const markdown =
    editor.markdown?.serialize({
      type: 'doc',
      content: (slice.content.toJSON() as JSONContent[] | null) ?? [],
    }) ?? state.doc.textBetween(start, end, '\n\n');
  return markdown.trim()
    ? { from: start, to: end, block: true, markdown: markdown.trim() }
    : null;
}

type Attempt = { instruction: string; text: string };
type Session = {
  from: number;
  to: number;
  block: boolean;
  selection: string;
  attempts: Attempt[];
  index: number;
  phase: Phase;
  error?: string;
};

/**
 * The rewrite's controls over the editor: the "Rewrite with AI" button by a selection, the box to say how, and the
 * bar to accept, discard or ask again. Positioned in `frame`, the editor's relatively positioned box.
 */
export function InlineRewrite({
  editor,
  host,
  frame,
  startRef,
  blocked = false,
}: {
  editor: Editor;
  host: RewriteHost;
  frame: RefObject<HTMLDivElement | null>;
  /** Set to the function ⌘J calls. */
  startRef: RefObject<() => void>;
  /** Another box over the editor is open (the link box): no button by the selection, and ⌘J does nothing. */
  blocked?: boolean;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [input, setInput] = useState('');
  const sessionRef = useRef(session);
  useLayoutEffect(() => {
    sessionRef.current = session;
  });
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const wasEditableRef = useRef(true);
  const selection = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      empty: e.state.selection.empty,
      from: e.state.selection.from,
      to: e.state.selection.to,
      editable: e.isEditable,
      focused: e.isFocused,
    }),
  });
  const [spot, setSpot] = useState<{
    button?: { top: number; left: number };
    bar?: { top: number; left: number };
  }>({});
  // The text streams in through decorations, outside React: a render per frame moves the bar down with it.
  const [, redraw] = useReducer((n: number) => n + 1, 0);

  const show = (marks: Marks) =>
    editor.view.dispatch(editor.state.tr.setMeta(rewriteKey, { set: marks }));

  function start() {
    if (sessionRef.current || blocked || !editor.isEditable) return;
    const picked = pick(editor);
    if (!picked) return;
    wasEditableRef.current = editor.isEditable;
    editor.setEditable(false, false);
    setInput('');
    setSession({
      from: picked.from,
      to: picked.to,
      block: picked.block,
      selection: picked.markdown,
      attempts: [],
      index: 0,
      phase: 'ask',
    });
    show({
      from: picked.from,
      to: picked.to,
      block: picked.block,
      phase: 'ask',
      text: '',
    });
  }
  useLayoutEffect(() => {
    startRef.current = start;
  });

  function close(focus = true) {
    abortRef.current?.abort();
    abortRef.current = null;
    const s = sessionRef.current;
    show(null);
    setSession(null);
    setInput('');
    editor.setEditable(wasEditableRef.current, false);
    if (focus && s)
      editor.chain().focus().setTextSelection({ from: s.from, to: s.to }).run();
  }
  const closeRef = useRef(close);
  useLayoutEffect(() => {
    closeRef.current = close;
  });

  async function send(instruction: string) {
    const s = sessionRef.current;
    if (!s || !instruction.trim()) return;
    // The turns before, up to the attempt shown: "shorter" means shorter than that one.
    const history = s.attempts
      .slice(0, s.phase === 'ask' ? s.attempts.length : s.index + 1)
      .map((a) => ({ instruction: a.instruction, result: a.text }));
    const attempts = [...s.attempts, { instruction, text: '' }];
    const index = attempts.length - 1;
    const controller = new AbortController();
    abortRef.current = controller;
    setInput('');
    let next: Session = {
      ...s,
      attempts,
      index,
      phase: 'stream',
      error: undefined,
    };
    setSession(next);
    let text = '',
      frame = 0;
    const draw = () => {
      frame = 0;
      const now = sessionRef.current;
      if (!now) return;
      show({
        from: now.from,
        to: now.to,
        block: now.block,
        phase: 'stream',
        text,
      });
      redraw();
    };
    try {
      for await (const piece of host.stream(
        { selection: s.selection, instruction, history },
        controller.signal,
      )) {
        text += piece;
        if (!frame) frame = requestAnimationFrame(draw);
      }
    } catch (failure) {
      if (!controller.signal.aborted) {
        cancelAnimationFrame(frame);
        const now = sessionRef.current;
        if (!now) return;
        const kept = now.attempts.slice(0, -1);
        next = {
          ...now,
          attempts: kept,
          index: Math.max(0, kept.length - 1),
          phase: kept.length ? 'result' : 'ask',
          error:
            failure instanceof Error && failure.message
              ? failure.message
              : $t('articleEdit.rewriteFailed'),
        };
        setSession(next);
        setInput(instruction);
        show({
          from: now.from,
          to: now.to,
          block: now.block,
          phase: next.phase,
          text: kept.at(-1)?.text ?? '',
        });
        return;
      }
    }
    cancelAnimationFrame(frame);
    if (abortRef.current === controller) abortRef.current = null;
    const now = sessionRef.current;
    if (!now) return;
    text = text.trim();
    // Stopped before anything came: back to saying how.
    if (!text) {
      const kept = now.attempts.slice(0, -1);
      setSession({
        ...now,
        attempts: kept,
        index: Math.max(0, kept.length - 1),
        phase: kept.length ? 'result' : 'ask',
      });
      setInput(instruction);
      show({
        from: now.from,
        to: now.to,
        block: now.block,
        phase: kept.length ? 'result' : 'ask',
        text: kept.at(-1)?.text ?? '',
      });
      return;
    }
    const done = now.attempts.map((a, i) => (i === index ? { ...a, text } : a));
    setSession({ ...now, attempts: done, index, phase: 'result' });
    show({
      from: now.from,
      to: now.to,
      block: now.block,
      phase: 'result',
      text,
    });
  }

  function choose(index: number) {
    const s = sessionRef.current;
    if (!s || s.phase !== 'result' || index < 0 || index >= s.attempts.length)
      return;
    setSession({ ...s, index });
    show({
      from: s.from,
      to: s.to,
      block: s.block,
      phase: 'result',
      text: s.attempts[index].text,
    });
  }

  function accept() {
    const s = sessionRef.current;
    if (!s || s.phase !== 'result') return;
    const { content } = answerContent(
      editor,
      s.attempts[s.index].text,
      s.block,
    );
    show(null);
    setSession(null);
    setInput('');
    editor.setEditable(wasEditableRef.current, false);
    editor
      .chain()
      .focus()
      .insertContentAt({ from: s.from, to: s.to }, content)
      .run();
    host.onAccepted();
  }

  // Closed when the editor goes away or turns read-only from outside (someone else took the article).
  useEffect(() => () => abortRef.current?.abort(), []);

  // Where the button and the bar go: the button above the selection's first line, the bar in the room the decorations
  // keep for it under the paragraph or the new text, as tall as the bar, so it covers none of the article.
  useLayoutEffect(() => {
    const box = frame.current;
    if (!box) return;
    const place = () => {
      const origin = box.getBoundingClientRect();
      const left = 12;
      const next: typeof spot = {};
      const s = sessionRef.current;
      if (!s && !blocked && !selection.empty && selection.editable) {
        const at = editor.view.coordsAtPos(selection.from);
        next.button = { top: at.top - origin.top - 36, left };
      }
      if (s) {
        if (barRef.current)
          box.style.setProperty(
            '--nr-rewrite-room',
            `${barRef.current.offsetHeight}px`,
          );
        const room = box.querySelector('[data-room="rewrite"]');
        const widget = box.querySelector('[data-rewrite-new]');
        const end = editor.view.coordsAtPos(
          Math.min(s.to, editor.state.doc.content.size),
        );
        const top = room
          ? room.getBoundingClientRect().top
          : (widget?.getBoundingClientRect().bottom ?? end.bottom) + 8;
        next.bar = { top: top - origin.top, left };
      }
      setSpot((old) =>
        JSON.stringify(old) === JSON.stringify(next) ? old : next,
      );
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  });

  useEffect(() => {
    if (session?.phase === 'ask' || session?.phase === 'result')
      inputRef.current?.focus();
  }, [session?.phase, session?.index]);

  // Esc backs out wherever focus is, not only in the box (2026-11-09 user report: once the box lost focus nothing
  // closed it): it closes the box before anything is asked, stops a rewrite being written and discards one shown. Before
  // anything is asked, a press outside the bar closes it too, the click then doing what it would have done; once there
  // is a rewrite, only the bar's buttons and Esc close it, so a stray click does not lose it.
  const phase = session?.phase;
  useEffect(() => {
    if (!phase) return;
    const keydown = (event: globalThis.KeyboardEvent) => {
      // Left alone: an Esc a menu or dialog over the page took, or one that leaves an IME candidate list.
      if (
        event.key !== 'Escape' ||
        event.defaultPrevented ||
        event.isComposing ||
        event.keyCode === 229
      )
        return;
      event.preventDefault();
      if (phase === 'stream') abortRef.current?.abort();
      else closeRef.current();
    };
    const pointerdown = (event: PointerEvent) => {
      if (
        phase === 'ask' &&
        !barRef.current?.contains(event.target as Node | null)
      )
        closeRef.current(false);
    };
    document.addEventListener('keydown', keydown);
    document.addEventListener('pointerdown', pointerdown, true);
    return () => {
      document.removeEventListener('keydown', keydown);
      document.removeEventListener('pointerdown', pointerdown, true);
    };
  }, [phase]);

  const mod = apple() ? '⌘' : 'Ctrl';
  const hint = $t(
    phase === 'ask' ? 'articleEdit.rewriteAsk' : 'articleEdit.rewriteAgain',
  );
  const keys = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      if (input.trim()) void send(input.trim());
      else if (session?.phase === 'result') accept();
    }
  };

  return (
    <>
      {spot.button && !session && (
        <Button
          type='button'
          size='sm'
          variant='outline'
          className='absolute z-20 h-7 gap-1.5 rounded-full border-[color:var(--nr-ink-violet)]/40 bg-background px-2.5 text-xs shadow-sm'
          style={{ top: Math.max(0, spot.button.top), left: spot.button.left }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={start}
        >
          <Sparkles className='text-[color:var(--nr-ink-violet)]' />
          {$t('articleEdit.rewrite')}
          <Kbd>{`${mod} J`}</Kbd>
        </Button>
      )}
      {session && spot.bar && (
        <div
          ref={barRef}
          role='group'
          aria-label={$t('articleEdit.rewrite')}
          className='absolute z-20 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-1.5 rounded-xl border bg-background p-1.5 shadow-md'
          style={{ top: spot.bar.top, left: spot.bar.left }}
        >
          {session.phase === 'result' && (
            <>
              <Button type='button' size='sm' onClick={accept}>
                <Check />
                {$t('articleEdit.accept')}
                <Kbd className='bg-primary-foreground/20 text-primary-foreground'>
                  ↵
                </Kbd>
              </Button>
              <Button
                type='button'
                size='sm'
                variant='ghost'
                onClick={() => close()}
              >
                {$t('articleEdit.discard')}
                <Kbd>Esc</Kbd>
              </Button>
            </>
          )}
          {session.phase === 'stream' ? (
            <div className='flex min-w-72 items-center gap-2 px-2 text-sm text-muted-foreground'>
              <Sparkles className='size-4 text-[color:var(--nr-ink-violet)]' />
              <span role='status' className='flex-1'>
                {$t('articleEdit.rewriting')}
              </span>
              <Button
                type='button'
                size='icon-sm'
                className='rounded-full'
                aria-label={$t('articleEdit.stop')}
                title={$t('articleEdit.stop')}
                onClick={() => abortRef.current?.abort()}
              >
                <Square className='fill-current' />
              </Button>
            </div>
          ) : (
            <div className='flex min-w-72 flex-1 items-center gap-1.5 rounded-lg px-1.5'>
              {session.phase === 'ask' && (
                <Sparkles className='size-4 shrink-0 text-[color:var(--nr-ink-violet)]' />
              )}
              {/* As wide as its hint, laid under it unseen, so the whole hint shows where the editor has the room. */}
              <div className='grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)]'>
                <span
                  aria-hidden='true'
                  className='invisible col-start-1 row-start-1 overflow-hidden text-sm whitespace-pre'
                >
                  {hint}
                </span>
                <input
                  ref={inputRef}
                  size={1}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={keys}
                  aria-label={hint}
                  placeholder={hint}
                  className='col-start-1 row-start-1 h-8 w-full min-w-0 bg-transparent text-sm text-ellipsis outline-none placeholder:text-muted-foreground'
                />
              </div>
              <Button
                type='button'
                size='icon-sm'
                className='rounded-full'
                disabled={!input.trim()}
                aria-label={$t('articleEdit.send')}
                title={$t('articleEdit.send')}
                onClick={() => void send(input.trim())}
              >
                <ArrowUp />
              </Button>
            </div>
          )}
          {session.phase === 'ask' && (
            <Button
              type='button'
              size='sm'
              variant='ghost'
              onClick={() => close()}
            >
              {$t('articleEdit.cancel')}
              <Kbd>Esc</Kbd>
            </Button>
          )}
          {session.phase === 'result' && session.attempts.length > 0 && (
            <div className='flex items-center text-xs text-muted-foreground tabular-nums'>
              <Button
                type='button'
                size='icon-xs'
                variant='ghost'
                disabled={session.index === 0}
                aria-label={$t('articleEdit.previousAttempt')}
                onClick={() => choose(session.index - 1)}
              >
                <ChevronLeft />
              </Button>
              <span aria-live='polite'>
                {$t('articleEdit.attemptOf', {
                  0: session.index + 1,
                  1: session.attempts.length,
                })}
              </span>
              <Button
                type='button'
                size='icon-xs'
                variant='ghost'
                disabled={session.index >= session.attempts.length - 1}
                aria-label={$t('articleEdit.nextAttempt')}
                onClick={() => choose(session.index + 1)}
              >
                <ChevronRight />
              </Button>
            </div>
          )}
          {session.error && (
            <p
              role='alert'
              className={cn('basis-full px-2 pb-1 text-sm text-destructive')}
            >
              {session.error}
            </p>
          )}
        </div>
      )}
    </>
  );
}
