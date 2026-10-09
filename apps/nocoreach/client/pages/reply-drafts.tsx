import { $t } from "@/i18n";
// 起草社区回复 (2026-10-08 user decision): the Agent writes one section per post — title, link, what is asked, the docs
// it used, a docs gap if any, then the reply. Here each post is a card with the reply, 复制回复 and 打开原帖; you post it
// yourself (NocoReach does not post anywhere). When the document does not follow the format, the page shows it as text.
import type { ReactElement } from "react";
import { toast } from "sonner";
import { ExternalLink, Copy } from "lucide-react";
import { Button } from "@/components/reach-ui/button";
import { Tag } from "@/components/reach/tag";

export type ReplyDraft = { title: string; url: string; asking: string; refs: string; gap: string; reply: string };
const FIELD: Record<string, keyof ReplyDraft> = { 链接: "url", link: "url", 在问: "asking", asking: "asking", 引用: "refs", references: "refs", reference: "refs", 文档缺口: "gap", "doc gap": "gap", "docs gap": "gap" };
const none = (v: string) => !v || /^(无|没有|none|n\/a|-)$/i.test(v.trim());
export const REPLY_PLAYBOOK = "community-reply";
export function parseReplies(content: string): ReplyDraft[] {
  const out: ReplyDraft[] = [];
  for (const block of String(content || "").split(/^##\s+(?!#)/m).slice(1)) {
    const [head, ...rest] = block.split("\n"), title = head.trim(), body = rest.join("\n");
    const [meta, ...replyParts] = body.split(/^###\s+(?:回复|Reply)\s*$/im);
    if (!replyParts.length) continue;
    const d: ReplyDraft = { title, url: "", asking: "", refs: "", gap: "", reply: replyParts.join("\n").trim() };
    for (const line of meta.split("\n")) {
      const m = line.match(/^\s*[-*]\s*([^：:]+)[：:]\s*(.*)$/);
      const key = m && FIELD[m[1].trim().toLowerCase()];
      if (key && key !== "reply" && key !== "title") d[key] = m![2].trim();
    }
    if (d.reply) out.push(d);
  }
  return out;
}
export function ReplyDrafts({ items }: { items: ReplyDraft[] }): ReactElement {
  const copy = (d: ReplyDraft) => void navigator.clipboard?.writeText(d.reply).then(() => toast.success($t("已复制回复，去原帖粘贴发出"))).catch(() => toast.error($t("没有复制成功，请手动选中复制")));
  return (
    <div className="flex flex-col gap-2.5" aria-label={$t("回复草稿")} role="list">
      {items.map((d, i) => (
        <section key={i} role="listitem" className="rounded-lg border bg-card p-3 text-sm" data-reply={i}>
          <h4 className="font-medium leading-snug">{d.title}</h4>
          {d.asking ? <p className="mt-0.5 text-xs text-muted-foreground">{$t("在问：{0}", { 0: d.asking })}</p> : null}
          <p className="mt-2 whitespace-pre-wrap rounded-md bg-muted/50 px-3 py-2 leading-relaxed">{d.reply}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => copy(d)}><Copy />{$t("复制回复")}</Button>
            {/^https?:\/\//.test(d.url) ? <Button size="sm" variant="ghost" render={<a href={d.url} target="_blank" rel="noreferrer" />}>{$t("打开原帖")}<ExternalLink /></Button> : null}
            {!none(d.refs) ? <span className="text-xs text-muted-foreground">{$t("引用：{0}", { 0: d.refs })}</span> : null}
            {!none(d.gap) ? <Tag tone="amber" className="ml-auto">{$t("文档缺口：{0}", { 0: d.gap })}</Tag> : null}
          </div>
        </section>
      ))}
    </div>
  );
}
