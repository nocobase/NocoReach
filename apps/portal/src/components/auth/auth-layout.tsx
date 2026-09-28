import type { PropsWithChildren, ReactNode } from "react";
import { Blocks, ShieldCheck, Sparkles } from "lucide-react";

import { Brand } from "@/components/app-shell/brand";

type AuthLayoutProps = PropsWithChildren<{
  title: string;
  description: string;
  footer?: ReactNode;
}>;

export function AuthLayout({
  title,
  description,
  footer,
  children,
}: AuthLayoutProps) {
  return (
    <div className="grid min-h-svh md:grid-cols-[minmax(420px,44%)_1fr]">
      <main className="grid place-items-center bg-card px-6 py-10 sm:px-12">
        <div className="w-full max-w-sm">
          <Brand className="mb-14" logoClassName="h-10" />
          <h1 className="text-3xl font-semibold tracking-[-0.035em]">
            {title}
          </h1>
          <p className="mb-8 mt-2 text-sm text-muted-foreground">
            {description}
          </p>
          {children}
          {footer && <div className="mt-8 text-sm">{footer}</div>}
        </div>
      </main>

      <section className="relative hidden overflow-hidden bg-neutral-950 p-12 text-white md:grid md:place-items-center">
        <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(currentColor_1px,transparent_1px),linear-gradient(90deg,currentColor_1px,transparent_1px)] [background-size:48px_48px]" />
        <div className="relative w-full max-w-xl">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-foreground/60">
            NocoReach · 市场增长工作区
          </div>
          <h2 className="mt-3 max-w-lg text-5xl font-semibold leading-[1.08] tracking-[-0.04em]">
            看清变化，找到下一步。
          </h2>
          <p className="mt-5 max-w-lg text-base leading-7 text-white/60">
            把网站表现、搜索数据与内容机会放在一起，从有依据的判断走向可执行的任务。
          </p>

          <div className="mt-10 max-w-md rounded-xl border border-white/15 bg-white p-5 text-neutral-900 shadow-2xl shadow-black/20">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-lg bg-neutral-100">
                <Sparkles className="size-4" />
              </div>
              <div>
                <div className="font-semibold">从真实数据出发</div>
                <div className="text-sm text-neutral-500">
                  趋势、关键词与页面表现，一处查看。
                </div>
              </div>
            </div>
            <div className="my-5 h-px bg-neutral-200" />
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-lg bg-neutral-100">
                <ShieldCheck className="size-4" />
              </div>
              <div>
                <div className="font-semibold">把发现变成行动</div>
                <div className="text-sm text-neutral-500">
                  保留证据，形成任务，持续复盘。
                </div>
              </div>
            </div>
            <div className="mt-5 flex items-center gap-2 rounded-lg bg-neutral-100 px-3 py-2 text-xs font-medium text-neutral-600">
              <Blocks className="size-3.5" />
              第一轮验证版 · 历史数据 · 规则分析
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
