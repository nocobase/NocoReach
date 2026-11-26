import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  absoluteUrl,
  isWechatLink,
  styleObject,
  wechatStyles,
  type WechatLayout,
  type WechatStyles,
} from '../../../shared/wechat-layout.js';

// An article's body as the WeChat editor will keep it (Content workshop › What to make › WeChat layout): Markdown
// rendered with raw HTML left out, every element's style written inline (the editor drops classes and stylesheets), links
// other than WeChat's own turned into numbered references listed at the end (the editor makes them unclickable), and
// code blocks written with line breaks and fixed spaces, which survive the paste where white-space rules do not.

/** The parts of a Markdown or HTML tree these plugins read and write. */
type MdNode = {
  type: string;
  children?: MdNode[];
  value?: string;
  url?: string;
  depth?: number;
  data?: Record<string, unknown>;
};
type HNode = {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HNode[];
  value?: string;
};

export type WechatReference = { n: number; url: string; label: string };

const textOf = (node: MdNode): string =>
  node.value ?? (node.children || []).map(textOf).join('');

const element = (
  tagName: string,
  children: MdNode[],
  properties: Record<string, unknown> = {},
): MdNode => ({
  type: 'wechat',
  data: { hName: tagName, hProperties: properties },
  children,
});

/**
 * The Markdown side: a leading `# Title` goes (the title is a field of its own), links become their text and a
 * reference number, images get an absolute address, and the references are listed at the end under `referencesTitle`.
 */
function remarkWechat(options: { pageUrl?: string; referencesTitle: string }) {
  return (tree: MdNode) => {
    const first = tree.children?.[0];
    if (first?.type === 'heading' && first.depth === 1) tree.children?.shift();
    const references: WechatReference[] = [];
    const walk = (node: MdNode) => {
      if (!node.children) return;
      node.children = node.children.flatMap((child): MdNode[] => {
        if (child.type === 'image') {
          const url = absoluteUrl(child.url || '', options.pageUrl);
          return url ? [{ ...child, url }] : [];
        }
        if (child.type !== 'link') {
          walk(child);
          return [child];
        }
        walk(child);
        const url = absoluteUrl(child.url || '', options.pageUrl);
        const inner = child.children || [];
        if (!url) return inner;
        if (isWechatLink(url)) return [{ ...child, url }];
        let ref = references.find((r) => r.url === url);
        if (!ref) {
          ref = { n: references.length + 1, url, label: textOf(child).trim() };
          references.push(ref);
        }
        return [
          ...inner,
          element('sup', [{ type: 'text', value: `[${ref.n}]` }], {
            dataRef: ref.n,
          }),
        ];
      });
    };
    walk(tree);
    if (!references.length) return;
    // `walk` replaces each children array, so the list is added to the tree's current one.
    tree.children = tree.children || [];
    tree.children.push(
      element(
        'section',
        [
          element('p', [{ type: 'text', value: options.referencesTitle }], {
            dataReferencesTitle: '',
          }),
          ...references.map((r) =>
            element(
              'p',
              [
                {
                  type: 'text',
                  value: `[${r.n}] ${r.label && r.label !== r.url ? `${r.label}: ` : ''}${r.url}`,
                },
              ],
              { dataReference: r.n },
            ),
          ),
        ],
        { dataReferences: '' },
      ),
    );
  };
}

/** A code block's text as lines joined by `<br>`, with leading spaces and tabs kept as fixed spaces. */
function codeLines(text: string): HNode[] {
  const lines = text.replace(/\n$/, '').split('\n');
  return lines.flatMap((line, i) => {
    const kept = line
      .replace(/\t/g, '    ')
      .replace(/^ +/, (s) => ' '.repeat(s.length))
      .replace(/ {2,}/g, (s) => ' '.repeat(s.length));
    const out: HNode[] = [{ type: 'text', value: kept || ' ' }];
    return i < lines.length - 1
      ? [
          ...out,
          { type: 'element', tagName: 'br', properties: {}, children: [] },
        ]
      : out;
  });
}

const hastText = (node: HNode): string =>
  node.value ?? (node.children || []).map(hastText).join('');

/** The HTML side: every element's inline style, by its tag and where it sits. */
function rehypeWechat(styles: WechatStyles) {
  const styleOf = (node: HNode, parent?: HNode): string | undefined => {
    const p = node.properties || {};
    switch (node.tagName) {
      case 'p':
        if ('dataReferencesTitle' in p) return styles.referencesTitle;
        if ('dataReference' in p) return styles.reference;
        if (parent?.tagName === 'blockquote') return styles.quoteP;
        if (parent?.tagName === 'li') return 'margin:0';
        return styles.p;
      case 'h1':
      case 'h2':
        return styles.h2;
      case 'h3':
        return styles.h3;
      case 'h4':
      case 'h5':
      case 'h6':
        return styles.h4;
      case 'section':
        return 'dataReferences' in p ? styles.references : undefined;
      case 'ul':
        // remark-gfm marks a task list with this class, which goes with the others.
        return Array.isArray(p.className) &&
          p.className.includes('contains-task-list')
          ? styles.taskList
          : styles.ul;
      case 'sup':
        return 'dataRef' in p ? styles.ref : undefined;
      case 'code':
        return parent?.tagName === 'pre' ? undefined : styles.code;
      case 'strong':
      case 'em':
      case 'del':
      case 'a':
      case 'ol':
      case 'li':
      case 'blockquote':
      case 'pre':
      case 'table':
      case 'th':
      case 'td':
      case 'hr':
      case 'img':
        return styles[node.tagName as keyof WechatStyles];
      default:
        return undefined;
    }
  };
  return (tree: HNode) => {
    const walk = (node: HNode, parent?: HNode) => {
      if (node.type === 'element') {
        const style = styleOf(node, parent);
        const {
          dataRef: _ref,
          dataReference: _reference,
          dataReferences: _references,
          dataReferencesTitle: _title,
          className: _className,
          ...rest
        } = node.properties || {};
        node.properties = style ? { ...rest, style } : rest;
        // A task list's checkbox is drawn as a character, as the editor drops form controls.
        if (node.tagName === 'input') {
          node.type = 'text';
          // The item's text starts with the space that followed the box.
          node.value = rest.checked ? '☑' : '☐';
          return;
        }
        if (node.tagName === 'pre') {
          const code = node.children?.find((c) => c.tagName === 'code');
          node.children = codeLines(hastText(code || node));
          return;
        }
      }
      for (const child of node.children || []) walk(child, node);
    };
    walk(tree);
  };
}

/** The body as it is pasted: one `<section>` with the article in it. */
export function WechatArticle({
  body,
  layout,
  color,
  pageUrl,
  referencesTitle,
}: {
  body: string;
  layout: WechatLayout;
  color: string;
  pageUrl?: string;
  referencesTitle: string;
}) {
  const styles = wechatStyles(layout, color);
  return (
    <section style={styleObject(styles.root)} data-wechat-article=''>
      <ReactMarkdown
        skipHtml
        remarkPlugins={[
          remarkGfm,
          [remarkWechat, { pageUrl, referencesTitle }],
        ]}
        rehypePlugins={[[rehypeWechat, styles]]}
      >
        {body}
      </ReactMarkdown>
    </section>
  );
}
