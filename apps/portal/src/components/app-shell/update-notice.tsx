import { useEffect } from "react";
import { toast } from "sonner";
// A page left open keeps running the version it loaded, so after a deploy people kept seeing old pages (2026-10-05). The
// built index.html names its main script by content hash: every few minutes and when the window comes back, the page
// reads index.html again and, if the name changed, offers 刷新. A lazily loaded page whose old file is gone after a
// deploy (Vite's preload error) reloads once by itself. Nothing happens in the dev server, which has no hashed script.
const CHECK_MS = 5 * 60 * 1000;
const RELOADED = "nocoreach:reloaded-for-update";

export function UpdateNotice() {
  useEffect(() => {
    const script = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]');
    if (!script) return;
    const current = new URL(script.src, location.href), base = current.href.slice(0, current.href.indexOf("assets/"));
    let shown = false;
    const check = async () => {
      if (shown || document.visibilityState === "hidden") return;
      try {
        const html = await (await fetch(base, { cache: "no-store", credentials: "same-origin" })).text();
        const latest = html.match(/assets\/index-[\w-]+\.js/)?.[0];
        if (latest && !current.pathname.endsWith(latest)) {
          shown = true;
          toast("NocoReach 有新版本", { description: "刷新后看到最新的页面。", duration: Infinity, action: { label: "刷新", onClick: () => location.reload() } });
        }
      } catch { /* offline or the server restarting: try again later */ }
    };
    const onPreloadError = (event: Event) => {
      const last = Number(sessionStorage.getItem(RELOADED) || 0);
      if (Date.now() - last < 60000) return;
      event.preventDefault(); sessionStorage.setItem(RELOADED, String(Date.now())); location.reload();
    };
    const timer = window.setInterval(() => void check(), CHECK_MS);
    window.addEventListener("focus", check);
    window.addEventListener("vite:preloadError", onPreloadError);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", check); window.removeEventListener("vite:preloadError", onPreloadError); };
  }, []);
  return null;
}
