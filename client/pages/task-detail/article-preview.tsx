import { useMemo, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ImageOff } from 'lucide-react';
import { $t } from '#i18n';
import { cn } from '#lib/utils';
import { siteUrl } from './article-text';
import './article-preview.css';

// An article as its readers will see it (2026-10-23 user request, as Medium and dev.to show a draft): the title, the
// description as the lede and the body rendered, images included, at a reading measure. Markdown is rendered without
// raw HTML, so anything the Agent or a person writes as HTML stays text.

export type ArticleText = {
  title?: string;
  description?: string;
  body?: string;
};

/** An image of the article, or its alternative text with "Could not load" where the image does not arrive. */
function ArticleImage({
  src,
  alt,
  title,
  pageUrl,
}: {
  src?: string;
  alt?: string;
  title?: string;
  pageUrl?: string;
}) {
  const url = siteUrl(src, pageUrl);
  // Per address, so a changed image starts again: loading (a grey frame holds its place), loaded or failed.
  const [state, setState] = useState<{
    url: string;
    loaded?: boolean;
    failed?: boolean;
  }>({ url: '' });
  const current = state.url === url ? state : { url };
  if (!url || current.failed)
    return (
      <span
        className='nr-article-missing'
        role='img'
        aria-label={alt || $t('articleTask.imageFailed')}
        title={src}
        data-image-failed=''
      >
        <ImageOff aria-hidden='true' className='size-5' />
        {alt ? <span>{alt}</span> : null}
        <span>{$t('articleTask.imageFailed')}</span>
      </span>
    );
  return (
    <img
      src={url}
      alt={alt || ''}
      title={title}
      loading='lazy'
      // The article's own site serves its images; the reviewer's address is not sent along.
      referrerPolicy='no-referrer'
      data-loading={current.loaded ? undefined : ''}
      onLoad={() => setState({ url, loaded: true })}
      onError={() => setState({ url, failed: true })}
    />
  );
}

/** Markdown with the article's reading typography; relative links and images are read against `pageUrl`. */
export function ArticleMarkdown({
  content,
  pageUrl,
}: {
  content: string;
  pageUrl?: string;
}) {
  // Stable across renders, so an image that failed keeps its placeholder while the text around it changes.
  const components = useMemo<Components>(
    () => ({
      // A relative link points into the article's site, as it will once published.
      a: ({ node: _node, href, ...props }) => (
        <a
          {...props}
          href={
            href && !/^([a-z][a-z0-9+.-]*:|#)/i.test(href)
              ? siteUrl(href, pageUrl) || href
              : href
          }
          target='_blank'
          rel='noreferrer'
        />
      ),
      img: ({ node: _node, src, alt, title }) => (
        <ArticleImage
          src={typeof src === 'string' ? src : undefined}
          alt={alt}
          title={title}
          pageUrl={pageUrl}
        />
      ),
    }),
    [pageUrl],
  );
  return (
    <div className='nr-article-body'>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

/** The whole article: title, lede and body. */
export function ArticlePreview({
  text,
  pageUrl,
  className,
}: {
  text: ArticleText;
  pageUrl?: string;
  className?: string;
}) {
  return (
    <article className={cn('nr-article', className)} data-article-preview=''>
      {text.title ? <h1>{text.title}</h1> : null}
      {text.description ? (
        <p className='nr-article-lede'>{text.description}</p>
      ) : null}
      {text.body?.trim() ? (
        <ArticleMarkdown content={text.body} pageUrl={pageUrl} />
      ) : (
        <p className='nr-article-empty'>{$t('articleTask.previewEmpty')}</p>
      )}
    </article>
  );
}
