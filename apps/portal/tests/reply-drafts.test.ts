import { describe, expect, it } from "vitest";
import { parseReplies } from "../src/pages/reply-drafts";
// 起草社区回复 (2026-10-08): the Agent's fixed format read back into one draft per post.
describe("parseReplies", () => {
  it("reads each post's link, question, references, gap and reply; skips the summary", () => {
    const doc = "前言\n\n## Post A\n- 链接：https://f.example/t/1\n- 在问：怎么隐藏\n- 引用：无\n- 文档缺口：无\n\n### 回复\n第一行\n第二行\n\n## Post B\n- Link: https://f.example/t/2\n- Asking: upgrade\n- Doc gap: upgrade notes\n### Reply\nUpgrade first.\n\n## 小结\n- 补文档";
    const r = parseReplies(doc);
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual({ title: "Post A", url: "https://f.example/t/1", asking: "怎么隐藏", refs: "无", gap: "无", reply: "第一行\n第二行" });
    expect(r[1]).toMatchObject({ url: "https://f.example/t/2", asking: "upgrade", gap: "upgrade notes", reply: "Upgrade first." });
  });
  it("a document in another format gives nothing (the page shows it as text)", () => {
    expect(parseReplies("# 社区问题汇总\n\n## 权限\n很多人在问权限。")).toEqual([]);
  });
});
