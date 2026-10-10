import { $t } from "#i18n";
// Who you are in NocoReach (2026-10-08 user decision): 管理员 change settings (数据接入, AI 团队, 分析规则, 成员); 成员 see
// every page, hand off and ignore opportunities, and do the steps of the tasks they own. People added in the NocoBase
// admin have not joined until an admin picks a role in 设置 · 成员; until then they see one screen saying so.
import { useEffect, useState, useSyncExternalStore, type ReactElement, type ReactNode } from "react";
import { useAuthentication } from "@nocobase/app-plugin-authentication/client";
import { resolvePortalUrl } from "#lib/nocoreach-api";
import { Info, UserRoundX } from "lucide-react";
import { nocobaseClient as api } from "#lib/nocoreach-api";
import { Button } from "#components/ui/button";
import { ListSkeleton } from "#components/reach/states";

export type Role = "admin" | "member";
export type Me = { id: string; name: string; role: Role | null };
// undefined while loading. A server that does not answer (older server, a test page) leaves the checks to the server:
// the page acts as for 管理员 and each refused action says why.
let me: Me | undefined;
const listeners = new Set<() => void>();
let loading: Promise<void> | null = null;
function set(next: Me) { me = next; listeners.forEach((l) => l()); }
export function loadMe(force = false): Promise<void> {
  if (loading && !force) return loading;
  loading = api.action<Partial<Me>>("nrMembers", "me", { method: "POST", body: {}, unwrap: "data" })
    .then((r) => set({ id: String(r?.id ?? ""), name: String(r?.name ?? ""), role: r && "role" in r ? (r.role === "admin" || r.role === "member" ? r.role : null) : "admin" }))
    .catch(() => set({ id: "", name: "", role: "admin" }));
  return loading;
}
// A task's owner: the one set on it, or whoever created it before anything happened on it.
export const taskOwner = (t: { evidence?: { work?: { humanOwnerId?: string } | null; createdBy?: { id?: string } } }): string | null => t.evidence?.work?.humanOwnerId ?? t.evidence?.createdBy?.id ?? null;
export function useMe(): { me: Me | undefined; isAdmin: boolean; can: (ownerId?: string | null) => boolean; mine: (ownerId?: string | null) => boolean } {
  const value = useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => me);
  useEffect(() => { if (!me) void loadMe(); }, []);
  const isAdmin = value?.role === "admin";
  // A task's steps: its owner and 管理员; a task with no owner yet, anyone.
  // “等你处理” counts your own tasks; older tasks with no owner count for 管理员. Unknown (no answer): all of them.
  return { me: value, isAdmin, can: (ownerId) => isAdmin || !ownerId || String(ownerId) === value?.id, mine: (ownerId) => !value?.id || (ownerId ? String(ownerId) === value.id : isAdmin) };
}

export function MemberGate({ children }: { children: ReactNode }): ReactNode {
  const { me: value } = useMe();
  const [leaving, setLeaving] = useState(false);
  const { client, refresh } = useAuthentication();
  // Signing out as the account menu does (layouts/components/user-menu.tsx); the shell then shows the sign-in page.
  const logout = async () => { setLeaving(true); try { await client.signOut(); await refresh(); } catch { setLeaving(false); } };
  if (!value) return <div className="p-6 md:p-8"><ListSkeleton rows={4} /></div>;
  if (value.role) return children;
  return <div className="grid flex-1 place-items-center p-6 md:p-8"><div data-not-joined className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center shadow-sm">
    <UserRoundX className="mx-auto mb-3 size-8 text-muted-foreground" aria-hidden="true" />
    <h1 className="text-lg font-semibold tracking-tight">{$t("你还没有加入 NocoReach")}</h1>
    <p className="mt-1 mb-5 text-sm text-muted-foreground">{$t("请管理员在“设置 · 成员”里给你选角色，选好后刷新这一页。")}</p>
    <Button variant="outline" disabled={leaving} onClick={() => void logout()}>{$t("退出登录")}</Button>
  </div></div>;
}

// On a settings page, for 成员: one line saying only 管理员 change it (the page hides its change buttons).
export function AdminOnlyNote(): ReactElement | null {
  const { isAdmin } = useMe();
  if (isAdmin) return null;
  return <p data-admin-only className="flex items-center gap-1.5 text-sm text-muted-foreground"><Info className="size-3.5 shrink-0" aria-hidden="true" />{$t("只有管理员能修改这里的设置")}</p>;
}
