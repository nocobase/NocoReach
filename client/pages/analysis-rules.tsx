import { $t, $tj } from "@/i18n";
// 分析规则 (AI 团队, 2026-10-08 user decision: the analysis is not a black box, and each product weighs things
// differently). The three steps of the daily analysis — rules find changes in the data, the changes are picked for the
// AI, the AI judges each — with what the latest analysis did at each step. Every rule can be switched off and its key
// numbers changed (back to default at any time); the AI's standards are shown, the team writes what it cares about,
// and the longest watch can be set. Changes apply from the next analysis. Editing happens in dialogs (entry + dialog).
import { useEffect, useState, type ReactElement } from "react";
import { nocobaseClient as api } from "@/lib/nocoreach-api";
import { toast } from "@/lib/toast";
import { PageContainer, PageHeader, Section } from "@/components/reach/page";
import { ListSkeleton, LoadError } from "@/components/reach/states";
import { InfoTip } from "@/components/reach/info-tip";
import { Tag } from "@/components/reach/tag";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useProject } from "./reach-data";
import { sourceNames } from "./strategy/board";
import { AdminOnlyNote, useMe } from "./me";

type Param = { key: string; label: string; default: number; min: number; max: number; unit: string; value: number };
type Rule = { id: string; source: string; label: string; description: string; enabled: boolean; params: Param[]; found: number | null };
type View = { rules: Rule[]; focus: string; watchDays: number; watchLimits: { default: number; min: number; max: number }; last: { computedAt: string; found: number | null; passed: number | null; missing: string[]; analyzedAt: string | null; verdicts: { do: number; watch: number; skip: number } } | null };
type Settings = { rules?: Record<string, { enabled?: boolean; values?: Record<string, number> }>; focus?: string; watchDays?: number };

const call = (action: "view" | "save", projectId: number, body: Settings = {}) => api.action<View>("nrAnalysisRules", action, { method: "POST", body: { ...body, projectId }, unwrap: "data" });
// The whole rule settings as stored: switched-off rules and numbers that differ from the default.
function settingsOf(rules: Rule[], change?: Rule): Settings["rules"] {
  return Object.fromEntries(rules.map((r) => (change && r.id === change.id ? change : r)).map((r) => [r.id, { ...(r.enabled ? {} : { enabled: false }), values: Object.fromEntries(r.params.filter((x) => x.value !== x.default).map((x) => [x.key, x.value])) }]));
}
// A Chinese unit takes a space after the number ("3 个主题"); "%" and the English units (" topics") do not need one.
const unitOf = (u: string) => { const t = u ? $t(u) : ""; return /^[一-鿿]/.test(t) ? ` ${t}` : t; };
const numbers = (r: Rule) => r.params.map((x) => `${$t(x.label)} ${x.value}${unitOf(x.unit)}`).join(" · ");
const day = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : "—");
const SOURCE_ORDER = ["gsc", "ga4", "site", "github", "github-traffic", "discourse", "packages", "hackernews", "reddit", "x", "discord", "rank", "trends", "competitors", "ai-search"];

export default function AnalysisRules(): ReactElement {
  const { project } = useProject();
  const { isAdmin } = useMe();
  const [view, setView] = useState<View>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Rule>();
  const [editFocus, setEditFocus] = useState(false);
  const [editDays, setEditDays] = useState(false);
  const load = () => call("view", project!.id).then((v) => { setView(v); setError(""); }).catch((e) => setError(e instanceof Error ? e.message : $t("分析规则没有读出来")));
  useEffect(() => { if (project) void load(); }, [project?.id]);
  const save = async (body: Settings, done?: () => void) => {
    if (!project) return;
    setBusy(true);
    try { setView(await call("save", project.id, body)); done?.(); toast.success($t("已保存，从下一次分析起生效")); }
    catch (e) { toast.error(e instanceof Error ? e.message : $t("没有保存成功")); }
    finally { setBusy(false); }
  };
  const groups = view ? [...new Set(view.rules.map((r) => r.source))].sort((a, b) => SOURCE_ORDER.indexOf(a) - SOURCE_ORDER.indexOf(b)) : [];
  const last = view?.last;
  return (
    <PageContainer className="nr-page">
      <PageHeader title={$t("分析规则")} description={$t("每天 9 点，先按规则从数据里找出变化，再交给 AI 逐条判断：建议处理、建议观察还是无需处理。这里能看到并调整每一步，改动从下一次分析起生效。")} />
      <AdminOnlyNote />
      {error ? <LoadError title={$t("分析规则没有读出来")} message={error} onRetry={() => void load()} /> : null}
      {!view && !error ? <ListSkeleton rows={5} /> : null}
      {view ? (
        <>
          <div className="grid gap-3 md:grid-cols-3" aria-label={$t("分析的三步")}>
            <Card className="gap-1 p-4" data-step="find"><p className="text-sm font-medium">{$t("① 找变化")}</p><p className="text-sm text-muted-foreground">{last?.found != null ? $tj("规则从数据里找出 {0} 条变化",{0:last.found}) : $t("还没有算过")}</p></Card>
            <Card className="gap-1 p-4" data-step="pick"><p className="flex items-center gap-1 text-sm font-medium">{$t("② 挑给 AI")}<InfoTip label={$t("怎么挑")}>{$t("正在观察的变化每次都交给 AI；其余按变化大小，可以行动的优先，一共最多 40 条。")}</InfoTip></p><p className="text-sm text-muted-foreground">{last?.passed != null ? $tj("交给 AI {0} 条",{0:last.passed}) : "—"}</p></Card>
            <Card className="gap-1 p-4" data-step="judge"><p className="text-sm font-medium">{$t("③ AI 判断")}</p><p className="text-sm text-muted-foreground">{last?.analyzedAt ? $tj("建议处理 {0} · 建议观察 {1} · 无需处理 {2}",{0:last.verdicts.do,1:last.verdicts.watch,2:last.verdicts.skip}) : $t("还没有分析过")}</p>{last?.analyzedAt ? <p className="text-xs text-muted-foreground">{$tj("上次分析 {0}",{0:day(last.analyzedAt)})}</p> : null}</Card>
          </div>
          <Section title={$t("① 找变化的规则")} description={$t("每条规则从一个数据源里找一类变化。关掉的规则不再提出变化；数字可以改，随时能恢复默认。")}>
            <div className="flex flex-col gap-4">
              {groups.map((g) => {
                const missing = last?.missing.includes(g);
                return (
                  <div key={g} className="flex flex-col" data-source={g}>
                    <p className="flex items-center gap-2 pb-1 text-xs font-medium text-muted-foreground">{sourceNames[g] || g}{missing ? <Tag tone="grey">{$t("没有数据")}</Tag> : null}</p>
                    <ul className="divide-y rounded-lg border">
                      {view.rules.filter((r) => r.source === g).map((r) => (
                        <li key={r.id} className={`flex flex-wrap items-center gap-3 px-3 py-2 text-sm ${r.enabled ? "" : "text-muted-foreground"}`} data-rule={r.id}>
                          <Switch checked={r.enabled} disabled={busy || !isAdmin} aria-label={$t("启用 {0}",{0:$t(r.label)})} onCheckedChange={(on) => void save({ rules: settingsOf(view.rules, { ...r, enabled: Boolean(on) }) })} />
                          <span className="flex min-w-0 flex-1 items-center gap-1"><span className="truncate">{$t(r.label)}</span><InfoTip label={$t("{0}是什么",{0:$t(r.label)})}>{$t(r.description)}</InfoTip></span>
                          {r.params.length ? <span className="text-xs text-muted-foreground tabular-nums" data-numbers="">{numbers(r)}{r.params.some((x) => x.value !== x.default) ? <Tag tone="blue" className="ml-1.5">{$t("已改")}</Tag> : null}</span> : null}
                          <span className="w-20 text-right text-xs text-muted-foreground tabular-nums" data-found="">{r.enabled && r.found != null ? $tj("这次 {0} 条",{0:r.found}) : "—"}</span>
                          {r.params.length && isAdmin ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(r)}>{$t("修改")}</Button> : <span className="w-[3.25rem]" />}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </Section>
          <Section title={$t("② AI 怎么判断")} description={$t("AI 对交给它的每条变化给一个结论；它也会读你们写的侧重点。")}>
            <dl className="grid grid-cols-[5rem_1fr] gap-x-3 gap-y-1.5 text-sm" data-verdict-rules="">
              <dt><Tag tone="amber">{$t("建议处理")}</Tag></dt><dd>{$t("有具体的页面或主题可以改，影响够大：写成机会。")}</dd>
              <dt><Tag tone="grey">{$t("建议观察")}</Tag></dt><dd>{$tj("刚出现、数据还少或方向不明：写清在等什么和最晚哪天定（最多 {0} 天），之后每天对照着判断，到期必须给出建议处理或无需处理。",{0:view.watchDays})}</dd>
              <dt><Tag tone="slate">{$t("无需处理")}</Tag></dt><dd>{$t("好消息、已经在处理或影响很小：写明理由。")}</dd>
            </dl>
            <div className="flex flex-col gap-1 rounded-lg border p-3" data-focus="">
              <div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">{$t("你们的侧重点")}</p>{isAdmin ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditFocus(true)}>{$t("修改")}</Button> : null}</div>
              <p className={`whitespace-pre-wrap text-sm ${view.focus ? "" : "text-muted-foreground"}`}>{view.focus || $t("还没写。比如：社区里反复出现的问题优先；竞品动态只看不做；英文文档比中文重要。")}</p>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-lg border p-3" data-watch-days="">
              <p className="text-sm">{$tj("观察最长 {0} 天",{0:<b key="d" className="font-medium tabular-nums">{view.watchDays}</b>})}</p>
              {isAdmin ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditDays(true)}>{$t("修改")}</Button> : null}
            </div>
          </Section>
          {editing ? <RuleDialog rule={editing} busy={busy} onClose={() => setEditing(undefined)} onSave={(r) => void save({ rules: settingsOf(view.rules, r) }, () => setEditing(undefined))} /> : null}
          {editFocus ? <FocusDialog value={view.focus} busy={busy} onClose={() => setEditFocus(false)} onSave={(focus) => void save({ focus }, () => setEditFocus(false))} /> : null}
          {editDays ? <DaysDialog value={view.watchDays} limits={view.watchLimits} busy={busy} onClose={() => setEditDays(false)} onSave={(watchDays) => void save({ watchDays }, () => setEditDays(false))} /> : null}
        </>
      ) : null}
    </PageContainer>
  );
}

function RuleDialog({ rule, busy, onClose, onSave }: { rule: Rule; busy: boolean; onClose: () => void; onSave: (r: Rule) => void }) {
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(rule.params.map((x) => [x.key, String(x.value)])));
  const bad = rule.params.find((x) => { const v = Number(values[x.key]); return values[x.key] === "" || !Number.isFinite(v) || v < x.min || v > x.max; });
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{$t(rule.label)}</DialogTitle><DialogDescription>{$t(rule.description)}</DialogDescription></DialogHeader>
        <div className="flex flex-col gap-3">
          {rule.params.map((x) => (
            <label key={x.key} className="flex flex-col gap-1 text-sm">
              <span className="text-xs text-muted-foreground">{$t(x.label)}{x.unit && $t(x.unit).trim() ? `（${$t(x.unit).trim()}）` : ""} · {$tj("默认 {0}，可填 {1}–{2}",{0:x.default,1:x.min,2:x.max})}</span>
              <Input type="number" inputMode="decimal" aria-label={$t(x.label)} value={values[x.key]} min={x.min} max={x.max} step="any" onChange={(e) => setValues((v) => ({ ...v, [x.key]: e.target.value }))} />
            </label>
          ))}
          {bad ? <p role="alert" className="nr-error">{$tj("{0}要在 {1}–{2} 之间",{0:$t(bad.label),1:bad.min,2:bad.max})}</p> : null}
        </div>
        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" disabled={busy} onClick={() => setValues(Object.fromEntries(rule.params.map((x) => [x.key, String(x.default)])))}>{$t("恢复默认")}</Button>
          <span className="flex gap-2"><Button variant="outline" disabled={busy} onClick={onClose}>{$t("取消")}</Button><Button disabled={busy || Boolean(bad)} onClick={() => onSave({ ...rule, params: rule.params.map((x) => ({ ...x, value: Number(values[x.key]) })) })}>{$t("保存")}</Button></span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FocusDialog({ value, busy, onClose, onSave }: { value: string; busy: boolean; onClose: () => void; onSave: (v: string) => void }) {
  const [text, setText] = useState(value);
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{$t("你们的侧重点")}</DialogTitle><DialogDescription>{$t("写给 AI 的几句话：你们更在乎什么、哪些只看不做。AI 判断建议处理、建议观察、无需处理和排优先级时都会参考。")}</DialogDescription></DialogHeader>
        <Textarea aria-label={$t("你们的侧重点")} rows={6} maxLength={1000} value={text} placeholder={$t("比如：社区里反复出现的问题优先；竞品动态只看不做；英文文档比中文重要。")} onChange={(e) => setText(e.target.value)} />
        <p className="text-right text-xs text-muted-foreground tabular-nums">{text.length} / 1000</p>
        <DialogFooter><Button variant="outline" disabled={busy} onClick={onClose}>{$t("取消")}</Button><Button disabled={busy} onClick={() => onSave(text.trim())}>{$t("保存")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DaysDialog({ value, limits, busy, onClose, onSave }: { value: number; limits: { default: number; min: number; max: number }; busy: boolean; onClose: () => void; onSave: (v: number) => void }) {
  const [days, setDays] = useState(String(value));
  const n = Number(days), bad = !Number.isInteger(n) || n < limits.min || n > limits.max;
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>{$t("观察最长天数")}</DialogTitle><DialogDescription>{$tj("一条变化最多观察这么多天，到期 AI 必须给出建议处理或无需处理。默认 {0} 天。",{0:limits.default})}</DialogDescription></DialogHeader>
        <Input type="number" aria-label={$t("观察最长天数")} min={limits.min} max={limits.max} value={days} onChange={(e) => setDays(e.target.value)} />
        {bad ? <p role="alert" className="nr-error">{$tj("填 {0}–{1} 之间的整数",{0:limits.min,1:limits.max})}</p> : null}
        <DialogFooter><Button variant="outline" disabled={busy} onClick={onClose}>{$t("取消")}</Button><Button disabled={busy || bad} onClick={() => onSave(n)}>{$t("保存")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
