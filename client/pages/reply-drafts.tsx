import { $t } from '#i18n';
// 起草社区回复 (2026-10-08 user decision): the Agent writes one section per post — title, link, what is asked, the docs
// it used, a docs gap if any, then the reply. Here each post is a card with the reply, 复制 Markdown 原文 and 打开原帖; you post it
// yourself (NocoReach does not post anywhere). When the document does not follow the format, the page shows it as text.
import type { ReactElement } from 'react';
import { toast } from '#lib/toast';
import { ExternalLink, Copy } from 'lucide-react';
import { Button } from '#components/ui/button';
import { Tag } from '#components/reach/tag';
import { Markdown } from './doc-view.js';

export type ReplyDraft = {
  title: string;
  url: string;
  asking: string;
  refs: string;
  gap: string;
  reply: string;
};
const FIELD: Record<string, keyof ReplyDraft> = {
  链接: 'url',
  link: 'url',
  在问: 'asking',
  asking: 'asking',
  引用: 'refs',
  references: 'refs',
  reference: 'refs',
  文档缺口: 'gap',
  'doc gap': 'gap',
  'docs gap': 'gap',
};
const none = (v: string) => !v || /^(无|没有|none|n\/a|-)$/i.test(v.trim());
export const REPLY_PLAYBOOK = 'community-reply';
export function parseReplies(content: string): ReplyDraft[] {
  const out: ReplyDraft[] = [];
  for (const block of String(content || '')
    .split(/^##\s+(?!#)/m)
    .slice(1)) {
    const [head, ...rest] = block.split('\n'),
      title = head.trim(),
      body = rest.join('\n');
    const [meta, ...replyParts] = body.split(/^###\s+(?:回复|Reply)\s*$/im);
    if (!replyParts.length) continue;
    const d: ReplyDraft = {
      title,
      url: '',
      asking: '',
      refs: '',
      gap: '',
      reply: replyParts.join('\n').trim(),
    };
    for (const line of meta.split('\n')) {
      const m = line.match(/^\s*[-*]\s*([^：:]+)[：:]\s*(.*)$/);
      const key = m && FIELD[m[1].trim().toLowerCase()];
      if (key && key !== 'reply' && key !== 'title') d[key] = m[2].trim();
    }
    if (d.reply) out.push(d);
  }
  return out;
}
export function ReplyDrafts({ items }: { items: ReplyDraft[] }): ReactElement {
  const copy = (d: ReplyDraft) =>
    void navigator.clipboard
      ?.writeText(d.reply)
      .then(() => toast.success(() => $t('replyDrafts.markdownCopied')))
      .catch(() => toast.error(() => $t('replyDrafts.notCopySelectTextCopy')));
  return (
    <div
      className='flex min-w-0 max-w-full flex-col divide-y'
      aria-label={$t('replyDrafts.replyDrafts')}
      role='list'
    >
      {items.map((d, i) => (
        <section
          key={`${d.title}:${d.reply}`}
          role='listitem'
          className='min-w-0 max-w-full py-4 text-sm first:pt-0 last:pb-0'
          data-reply={i}
        >
          <h3 className='font-heading text-sm font-semibold'>{d.title}</h3>
          {d.asking ? (
            <p className='mt-1 text-sm text-muted-foreground'>
              {$t('replyDrafts.asking', { 0: d.asking })}
            </p>
          ) : null}
          <div className='mt-2 min-w-0 border-l-2 pl-3'>
            <Markdown content={d.reply} />
          </div>
          <div className='mt-2 flex flex-wrap items-center gap-2'>
            <Button size='sm' variant='outline' onClick={() => copy(d)}>
              <Copy />
              {$t('replyDrafts.copyMarkdown')}
            </Button>
            {/^https?:\/\//.test(d.url) ? (
              <Button
                size='sm'
                variant='ghost'
                render={<a href={d.url} target='_blank' rel='noreferrer' />}
              >
                {$t('replyDrafts.openPost')}
                <ExternalLink />
              </Button>
            ) : null}
            {!none(d.refs) ? (
              <span className='min-w-0 text-sm text-muted-foreground [overflow-wrap:anywhere]'>
                {$t('common.references', { 0: d.refs })}
              </span>
            ) : null}
          </div>
          {!none(d.gap) ? (
            <div className='mt-2 min-w-0'>
              <Tag tone='amber'>{$t('replyDrafts.docsGap')}</Tag>
              <p className='mt-1 whitespace-pre-wrap text-sm text-muted-foreground [overflow-wrap:anywhere]'>
                {d.gap}
              </p>
            </div>
          ) : null}
        </section>
      ))}
    </div>
  );
}
