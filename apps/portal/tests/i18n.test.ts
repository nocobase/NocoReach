import { afterAll, describe, expect, it } from "vitest";
import { createElement, isValidElement } from "react";
import { $t, $tj, isChinese, prepareLocale } from "../src/i18n";

describe("NocoReach UI text", () => {
  afterAll(() => prepareLocale("zh-CN"));

  it("keeps the Chinese text when the language is Chinese", async () => {
    await prepareLocale("zh-CN");
    expect(isChinese()).toBe(true);
    expect($t("洞察")).toBe("洞察");
    expect($t("{0} 个主题", { 0: 6 })).toBe("6 个主题");
  });

  it("shows English for UI text, server sentences with numbers, and sentences in parts", async () => {
    await prepareLocale("en-US");
    expect($t("洞察")).toBe("Insights");
    expect($t("{0} 个主题", { 0: 6 })).toBe("6 topics");
    // A sentence from the server, matched through its pattern; the inner part is translated too.
    expect($t("6 个主题")).toBe("6 topics");
    expect($t("同步失败超过 1 天：GitHub 读取未完成，请稍后重试。")).toBe("Sync failing for over a day: Reading GitHub didn't complete. Try again later.");
    // Parts joined with ； are translated one by one.
    expect($t("请先接入仓库；请先接入论坛")).toBe("Connect the repository first; Connect the forum first");
    // Words inside a sentence: "倍" and the direction read as part of it.
    expect($t("10/1 Star 增加 186，是平时的 2.4 倍")).toBe("10/1 stars up 186, 2.4× the usual");
    expect($t("全站搜索曝光上升 18%")).toBe("Site-wide Search impressions up 18%");
    // An empty entry is used as is, and unknown text stays as it is.
    expect($t(" 位")).toBe("");
    expect($t("这句话不在翻译表里")).toBe("这句话不在翻译表里");
    expect($t(undefined)).toBe("");
  });

  it("keeps elements as elements inside JSX text", async () => {
    await prepareLocale("en-US");
    const parts = $tj("{0} 个主题", { 0: createElement("b", null, "6") });
    expect(Array.isArray(parts)).toBe(true);
    expect((parts as unknown[]).some((p) => isValidElement(p))).toBe(true);
    expect($tj("{0} 个主题", { 0: null })).toBe(" topics");
  });
});
