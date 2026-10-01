import { ArrowRight, Bot, CheckCircle2, DatabaseZap, FileArchive, GitBranch, ListTodo, Radar, UploadCloud } from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const copy = {
  "ai-visibility": { title: "AI 搜索可见性", icon: Radar, description: "了解品牌在 AI 搜索问题中的出现、引用和竞争位置。" },
  "open-source": { title: "开源增长", icon: GitBranch, description: "把仓库、下载、贡献和生态增长从其他市场数据中独立出来。" },
  actions: { title: "行动中心", icon: ListTodo, description: "将 AI 结论转成内容任务、优化计划和持续监控。" },
  connections: { title: "数据接入", icon: DatabaseZap, description: "让 AI 自动识别并连接网站、搜索、竞品和开源数据。" },
} as const;

export default function EmptyWorkspacePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const areaByPath: Record<string, keyof typeof copy> = {
    "/ai-visibility": "ai-visibility",
    "/open-source": "open-source",
    "/actions": "actions",
    "/connections": "connections",
  };
  const area = areaByPath[location.pathname] ?? "connections";
  const item = copy[area] ?? copy.connections;
  const Icon = item.icon;
  const [selectedSource, setSelectedSource] = useState<"backup" | "legacy" | null>(null);
  const [checked, setChecked] = useState(false);

  if (area === "connections") {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10 lg:px-10">
        <div className="flex items-center gap-4">
          <div className="rounded-2xl bg-primary/10 p-3"><DatabaseZap className="size-6" /></div>
          <div><h1 className="text-3xl font-semibold tracking-tight">数据接入</h1><p className="mt-1 text-muted-foreground">AI 会根据你的目标选择需要的数据，不要求你先学会复杂的工具配置。</p></div>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <button type="button" onClick={() => { setSelectedSource("backup"); setChecked(false); }} className={`rounded-2xl border p-6 text-left transition hover:border-primary/50 hover:shadow-sm ${selectedSource === "backup" ? "border-primary bg-primary/[0.04]" : "bg-card"}`}>
            <div className="flex items-start justify-between"><div className="rounded-xl bg-amber-500/10 p-3"><FileArchive className="size-5 text-amber-600" /></div>{selectedSource === "backup" ? <CheckCircle2 className="size-5 text-primary" /> : null}</div>
            <h2 className="mt-5 text-lg font-semibold">导入旧系统备份</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">读取当前文件夹中的 NocoBase 备份，先检查版本、插件和数据表，再迁移到新环境。</p>
            <p className="mt-4 text-xs font-medium text-foreground/70">已发现：backup_20260921_003234_8230.nbdata</p>
          </button>
          <button type="button" onClick={() => { setSelectedSource("legacy"); setChecked(false); }} className={`rounded-2xl border p-6 text-left transition hover:border-primary/50 hover:shadow-sm ${selectedSource === "legacy" ? "border-primary bg-primary/[0.04]" : "bg-card"}`}>
            <div className="flex items-start justify-between"><div className="rounded-xl bg-blue-500/10 p-3"><UploadCloud className="size-5 text-blue-600" /></div>{selectedSource === "legacy" ? <CheckCircle2 className="size-5 text-primary" /> : null}</div>
            <h2 className="mt-5 text-lg font-semibold">连接旧系统实例</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">连接只读的旧 NocoBase 实例，先做数据盘点，再决定哪些业务数据进入新产品。</p>
            <p className="mt-4 text-xs font-medium text-foreground/70">旧实例：127.0.0.1:13002</p>
          </button>
        </div>
        {selectedSource ? (
          <Card><CardContent className="p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div><h2 className="font-semibold">{selectedSource === "backup" ? "检查备份" : "检查旧系统"}</h2><p className="mt-1 text-sm text-muted-foreground">先做只读检查，不会覆盖新环境，也不会修改旧系统。</p></div>
              <Button onClick={() => setChecked(true)}>{checked ? "检查完成" : "开始检查"}<ArrowRight className="ml-2 size-4" /></Button>
            </div>
            {checked ? <div className="mt-5 rounded-xl border bg-muted/20 p-4 text-sm"><p className="font-medium text-emerald-700">已完成只读检查</p><p className="mt-1 text-muted-foreground">备份来自 NocoBase 2.4.0-alpha.3，新环境是 NocoBase 3.0.0-alpha.7。下一步应先生成迁移映射，再导入业务数据，不能直接覆盖新环境。</p></div> : null}
          </CardContent></Card>
        ) : null}
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10 lg:px-10">
      <div className="flex items-center gap-4">
        <div className="rounded-2xl bg-primary/10 p-3"><Icon className="size-6" /></div>
        <div><h1 className="text-3xl font-semibold tracking-tight">{item.title}</h1><p className="mt-1 text-muted-foreground">{item.description}</p></div>
      </div>
      <Card><CardContent className="flex flex-col items-center px-8 py-16 text-center">
        <Bot className="size-10 text-muted-foreground" />
        <h2 className="mt-5 text-xl font-semibold">这一工作区将在数据接入后变得可用</h2>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">我们先把任务型结构搭好，再接入真实数据和 AI 分析，避免用假数据制造“看起来完成”的页面。</p>
        <Button className="mt-6" onClick={() => navigate("/connections")}>去连接数据 <ArrowRight className="ml-2 size-4" /></Button>
      </CardContent></Card>
    </main>
  );
}
