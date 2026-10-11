import { useMessageState, $t } from "#i18n";
import { resolveAppUrl } from "@nocobase/app-client";
// 设置 · 成员 (2026-10-08 user decision): people are added as users in the NocoBase admin; here 管理员 pick each one's
// role — 管理员, 成员 or 未加入 (new users start there, so a NocoBase that allows sign-up does not open the data). NocoBase
// admins are always 管理员, and nobody changes their own role. 成员 see the list without the selects.
import { useCallback, useEffect, useState, type ReactElement } from "react";
import { nocobaseClient as api } from "#lib/nocoreach-api";
import { toast } from "#lib/toast";
import { ExternalLink } from "lucide-react";
import { PageContainer, PageHeader } from "#components/reach/page";
import { ListSkeleton, LoadError } from "#components/reach/states";
import { InfoTip } from "#components/reach/info-tip";
import { Tag } from "#components/reach/tag";
import { ActorAvatar } from "#components/reach/actor";
import { Button } from "#components/ui/button";
import { AdminOnlyNote, useMe, type Role } from "./me";

type Member = { id: string; name: string; account: string; role: Role | null; locked: boolean };
// NocoBase 3’s own user administration (Settings → Users), in this deployment.
export const USERS_URL = resolveAppUrl("/settings/users");
const ROLE_LABEL = (r: Role | null) => (r === "admin" ? $t("管理员") : r === "member" ? $t("成员") : $t("未加入"));
const call = (action: "list" | "setRole", body: object = {}) => api.action<Member[]>("nrMembers", action, { method: "POST", body, unwrap: "data" });

export default function Members(): ReactElement {
  const { me, isAdmin } = useMe();
  const [list, setList] = useState<Member[]>();
  const [error, setError] = useMessageState("");
  const [busy, setBusy] = useState<string>();
  const load = useCallback(() => call("list").then((l) => { setList(l); setError(""); }).catch((e) => setError(() => (e instanceof Error ? $t(e.message) : $t("成员没有读出来")))), [setError]);
  useEffect(() => { void load(); }, [load]);
  const setRole = async (m: Member, role: Role | null) => {
    setBusy(m.id);
    try { setList(await call("setRole", { userId: m.id, role })); toast.success(() => (role ? $t("{0} 现在是{1}", { 0: m.name, 1: ROLE_LABEL(role) }) : $t("{0} 已移出，不能再使用 NocoReach", { 0: m.name }))); }
    catch (e) { toast.error(() => (e instanceof Error ? $t(e.message) : $t("没有保存成功"))); }
    finally { setBusy(undefined); }
  };
  return (
    <PageContainer className="nr-page">
      <PageHeader title={$t("成员")}
        info={<InfoTip label={$t("角色说明")}>{$t("管理员能修改数据接入、AI 团队、分析规则和成员这些设置；成员能看全部页面、交给 Agent、忽略机会，在自己负责的任务里看方案、审核和发布。别人负责的任务，成员能看、能留言。")}</InfoTip>}
        description={$t("在 NocoBase 后台添加用户后，在这里给他选角色。新用户默认“未加入”，选了角色才能使用 NocoReach。")}
        actions={isAdmin ? <Button variant="outline" size="sm" render={<a href={USERS_URL} target="_blank" rel="noreferrer" />}>{$t("去 NocoBase 添加用户")}<ExternalLink className="size-3.5" aria-hidden="true" /></Button> : null} />
      <AdminOnlyNote />
      {error ? <LoadError title={$t("成员没有读出来")} message={error} onRetry={() => void load()} /> : null}
      {!list && !error ? <ListSkeleton rows={4} /> : null}
      {list ? (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm" aria-label={$t("成员")}>
            <thead><tr className="text-left text-xs text-muted-foreground"><th className="px-4 py-2 font-medium">{$t("名字")}</th><th className="px-4 py-2 font-medium">{$t("账号")}</th><th className="w-44 px-4 py-2 font-medium">{$t("角色")}</th></tr></thead>
            <tbody>
              {list.map((m) => {
                const self = m.id === me?.id;
                return (
                  <tr key={m.id} className="border-t" data-member={m.id}>
                    <td className="px-4 py-2.5"><span className="inline-flex items-center gap-2"><ActorAvatar type="user" name={m.name} /><span className={m.role ? "" : "text-muted-foreground"}>{self ? $t("{0}（你）", { 0: m.name }) : m.name}</span></span></td>
                    <td className="px-4 py-2.5 text-muted-foreground">{m.account || "—"}</td>
                    <td className="px-4 py-2.5">
                      {isAdmin && !m.locked && !self ? (
                        <select aria-label={$t("{0} 的角色", { 0: m.name })} value={m.role || ""} disabled={busy === m.id} onChange={(e) => void setRole(m, (e.target.value || null) as Role | null)}>
                          <option value="admin">{$t("管理员")}</option><option value="member">{$t("成员")}</option><option value="">{$t("未加入")}</option>
                        </select>
                      ) : (
                        <span className="inline-flex items-center gap-1.5"><Tag tone="grey">{ROLE_LABEL(m.role)}</Tag>
                          {m.locked ? <InfoTip label={$t("为什么不能改")}>{$t("NocoBase 管理员，固定是管理员。")}</InfoTip> : isAdmin && self ? <InfoTip label={$t("为什么不能改")}>{$t("自己的角色不能在这里改，请另一位管理员修改。")}</InfoTip> : null}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </PageContainer>
  );
}
