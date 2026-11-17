import { useEffect, useRef, useState } from 'react';
import { copyText } from '@nocobase/app-client';
import { Check, TriangleAlert } from 'lucide-react';
import { $t } from '#i18n';
import { InfoTip } from '#components/reach/info-tip';
import { SourceLogo } from '#components/reach/source-logo';
import { Button } from '#components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { toast } from '#lib/toast';
import { cn } from '#lib/utils';
import {
  WECHAT_TITLE_BYTES,
  titleBytes,
  type WechatLayout,
} from '../../../shared/wechat-layout.js';
import { workshopRequest } from './model.js';
import { WechatArticle } from './wechat-article.js';

// What to make › WeChat layout (mockup v3 frame 3, last row; Content workshop PR 3): the article's body as it is,
// laid out for the WeChat editor and copied, with no task and no Agent. The body comes from the publishing target
// holding the article (`nrWorkshop.article`); without one the row says it cannot be read and offers nothing.

type ArticleText =
  { title: string; body: string; locale?: string } | { body: null };

/** The row at the end of What to make, for an article. */
export function WechatRow({
  projectId,
  url,
  title,
  layout,
  color,
}: {
  projectId: string;
  url: string;
  title: string;
  layout: WechatLayout;
  color: string;
}) {
  // Read once per address: Source language switches it.
  const [read, setRead] = useState<{ url: string; text?: ArticleText }>();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let live = true;
    workshopRequest<ArticleText>('article', projectId, { url, title }).then(
      (text) => {
        if (live) setRead({ url, text });
      },
      () => {
        if (live) setRead({ url, text: { body: null } });
      },
    );
    return () => {
      live = false;
    };
  }, [projectId, url, title]);
  const text = read?.url === url ? read.text : undefined;
  const article = text?.body ? text : null;
  return (
    <div
      className='flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4'
      data-form='wechat'
    >
      <SourceLogo source='wechat' size='sm' />
      <div className='min-w-0 flex-1'>
        <div className='text-sm font-semibold'>
          {$t('workshop.wechatLayout')}
        </div>
        {text && !article ? (
          <p
            className='flex items-center gap-1 text-xs text-muted-foreground'
            data-wechat-unreadable=''
          >
            {$t('workshop.wechatNoBody')}
            <InfoTip>{$t('workshop.wechatNoBodyHint')}</InfoTip>
          </p>
        ) : (
          <p className='text-xs text-muted-foreground'>
            {$t('workshop.wechatRowHint')}
          </p>
        )}
      </div>
      <Button
        type='button'
        variant='outline'
        size='sm'
        disabled={!article}
        onClick={() => setOpen(true)}
      >
        {$t('workshop.wechatPreview')}
      </Button>
      {open && article ? (
        <WechatPreview
          title={article.title}
          body={article.body}
          pageUrl={url}
          layout={layout}
          color={color}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

/** Copies the preview by selecting it, which keeps its HTML; for browsers without ClipboardItem (plain HTTP). */
function copySelection(element: HTMLElement): boolean {
  const selection = window.getSelection();
  if (!selection) return false;
  const range = document.createRange();
  range.selectNode(element);
  selection.removeAllRanges();
  selection.addRange(range);
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    selection.removeAllRanges();
  }
}

/**
 * Copies the body as HTML with its plain text beside it. `copyText` copies text only, so the HTML goes through
 * ClipboardItem, or through a selection of the preview where the browser has no ClipboardItem or refuses it.
 */
async function copyArticle(element: HTMLElement): Promise<boolean> {
  // Undefined outside a secure context (plain HTTP), whatever its type says.
  // eslint-disable-next-line no-restricted-properties -- copyText has no HTML counterpart; this owns the fallback.
  const clipboard = navigator.clipboard as Clipboard | undefined;
  if (
    typeof ClipboardItem !== 'undefined' &&
    typeof clipboard?.write === 'function'
  ) {
    try {
      await clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([element.outerHTML], { type: 'text/html' }),
          'text/plain': new Blob([element.innerText], { type: 'text/plain' }),
        }),
      ]);
      return true;
    } catch {
      // Permissions and browser policy may refuse even when the API exists.
    }
  }
  return copySelection(element);
}

/** The article at a phone's width, as the WeChat editor shows it, with Copy title and Copy body. */
export function WechatPreview({
  title,
  body,
  pageUrl,
  layout,
  color,
  onClose,
}: {
  title: string;
  body: string;
  pageUrl?: string;
  layout: WechatLayout;
  color: string;
  onClose: () => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const bytes = titleBytes(title);
  const long = bytes > WECHAT_TITLE_BYTES;
  const copyBody = async () => {
    const article = bodyRef.current?.querySelector<HTMLElement>(
      '[data-wechat-article]',
    );
    if (!article) return;
    if (await copyArticle(article))
      toast.success(() => $t('workshop.wechatBodyCopied'));
    else toast.error(() => $t('workshop.copyFailed'));
  };
  const copyTitle = async () => {
    if (await copyText(title)) toast.success(() => $t('workshop.copied'));
    else toast.error(() => $t('workshop.copyFailed'));
  };
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className='max-h-[92vh] overflow-y-auto sm:max-w-[480px]'>
        <DialogHeader>
          <DialogTitle>{$t('workshop.wechatLayout')}</DialogTitle>
          <DialogDescription>
            {$t('workshop.wechatPreviewHint', {
              0: layout.fontSize,
              1: layout.lineHeight,
            })}
          </DialogDescription>
        </DialogHeader>
        <p
          className={cn(
            'flex items-center gap-1.5 text-sm',
            long ? 'text-nr-ink-amber' : 'text-nr-ink-green',
          )}
          data-title-check={long ? 'long' : 'ok'}
        >
          {long ? (
            <TriangleAlert className='size-4' aria-hidden='true' />
          ) : (
            <Check className='size-4' aria-hidden='true' />
          )}
          {$t(long ? 'workshop.wechatTitleLong' : 'workshop.wechatTitleOk', {
            0: bytes,
            1: WECHAT_TITLE_BYTES,
          })}
        </p>
        <div
          className='mx-auto max-h-[60vh] w-[375px] max-w-full overflow-y-auto rounded-2xl border bg-white px-4 py-5 text-left'
          data-wechat-phone=''
        >
          <h1
            className='mb-4 text-[22px] leading-snug font-bold'
            style={{ color: '#1f1f1f' }}
          >
            {title}
          </h1>
          <div ref={bodyRef}>
            <WechatArticle
              body={body}
              layout={layout}
              color={color}
              pageUrl={pageUrl}
              referencesTitle={$t('workshop.wechatReferences')}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            onClick={() => void copyTitle()}
          >
            {$t('workshop.copyTitle')}
          </Button>
          <Button type='button' onClick={() => void copyBody()}>
            {$t('workshop.copyBody')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
