import { useMessageState, $t, $legacyText } from "#i18n";
// 设置 · 成员 (2026-10-08 user decision): people are added as users in the NocoBase admin; here 管理员 pick each one's
// role — 管理员, 成员 or 未加入 (new users start there, so a NocoBase that allows sign-up does not open the data). NocoBase
// admins are always 管理员, and nobody changes their own role. 成员 see the list without the selects.
import { useCallback, useEffect, useState, type ReactElement } from "react";
import { nocobaseClient as api } from "#lib/nocoreach-api";
import { toast } from "#lib/toast";
import { PageContainer, PageHeader } from "#components/reach/page";
import { ListSkeleton, LoadError } from "#components/reach/states";
import { InfoTip } from "#components/reach/info-tip";
import { Tag } from "#components/reach/tag";
import { ActorAvatar } from "#components/reach/actor";
import { AdminOnlyNote, useMe, type Role } from "./me";

type Member = { id: string; name: string; account: string; role: Role | null; locked: boolean };
const ROLE_LABEL = (r: Role | null) => (r === "admin" ? $t('members.admin') : r === "member" ? $t('common.member') : $t('members.notJoined'));
const call = (action: "list" | "setRole", body: object = {}) => api.action<Member[]>("nrMembers", action, { method: "POST", body, unwrap: "data" });

export default function Members(): ReactElement {
  const { me, isAdmin } = useMe();
  const [list, setList] = useState<Member[]>();
  const [error, setError] = useMessageState("");
  const [busy, setBusy] = useState<string>();
  const load = useCallback(() => call("list").then((l) => { setList(l); setError(""); }).catch((e) => setError(() => (e instanceof Error ? $legacyText(e.message) : $t('members.notLoadMembers')))), [setError]);
  useEffect(() => { void load(); }, [load]);
  const setRole = async (m: Member, role: Role | null) => {
    setBusy(m.id);
    try { setList(await call("setRole", { userId: m.id, role })); toast.success(() => (role ? $t('members.now', { 0: m.name, 1: ROLE_LABEL(role) }) : $t('members.removedNoLongerUseNocoreach', { 0: m.name }))); }
    catch (e) { toast.error(() => (e instanceof Error ? $legacyText(e.message) : $t('common.saveFailed'))); }
    finally { setBusy(undefined); }
  };
  return (
    <PageContainer className="nr-page">
      <PageHeader title={$t('common.member')}
        info={<InfoTip label={$t('members.aboutRoles')}>{$t('members.rolePermissionsHelp')}</InfoTip>}
        description={$t('members.existingAccountRoleHelp')}
        />
      <AdminOnlyNote />
      {error ? <LoadError title={$t('members.notLoadMembers')} message={error} onRetry={() => void load()} /> : null}
      {!list && !error ? <ListSkeleton rows={4} /> : null}
      {list ? (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm" aria-label={$t('common.member')}>
            <thead><tr className="text-left text-xs text-muted-foreground"><th className="px-4 py-2 font-medium">{$t('members.name')}</th><th className="px-4 py-2 font-medium">{$t('members.account')}</th><th className="w-44 px-4 py-2 font-medium">{$t('members.role')}</th></tr></thead>
            <tbody>
              {list.map((m) => {
                const self = m.id === me?.id;
                return (
                  <tr key={m.id} className="border-t" data-member={m.id}>
                    <td className="px-4 py-2.5"><span className="inline-flex items-center gap-2"><ActorAvatar type="user" name={m.name} /><span className={m.role ? "" : "text-muted-foreground"}>{self ? $t('common.selfName', { 0: m.name }) : m.name}</span></span></td>
                    <td className="px-4 py-2.5 text-muted-foreground">{m.account || "—"}</td>
                    <td className="px-4 py-2.5">
                      {isAdmin && !m.locked && !self ? (
                        <select aria-label={$t('members.roleValue', { 0: m.name })} value={m.role || ""} disabled={busy === m.id} onChange={(e) => void setRole(m, (e.target.value || null) as Role | null)}>
                          <option value="admin">{$t('members.admin')}</option><option value="member">{$t('common.member')}</option><option value="">{$t('members.notJoined')}</option>
                        </select>
                      ) : (
                        <span className="inline-flex items-center gap-1.5"><Tag tone="grey">{ROLE_LABEL(m.role)}</Tag>
                          {m.locked ? <InfoTip label={$t('members.whyCannotChanged')}>{$t('members.nocobaseAdminAlwaysAdminMessage')}</InfoTip> : isAdmin && self ? <InfoTip label={$t('members.whyCannotChanged')}>{$t('members.cannotChangeOwnRoleHereMessage')}</InfoTip> : null}
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
