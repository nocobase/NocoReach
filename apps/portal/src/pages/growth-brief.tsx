import { ArrowRight, CheckCircle2, CircleDashed, FileSearch, Sparkles } from "lucide-react";
import { useNavigate } from "react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const steps = [
  { label: "创建项目上下文", done: false },
  { label: "连接网站与搜索数据", done: false },
  { label: "生成第一份增长简报", done: false },
];

export default function GrowthBriefPage() {
  const navigate = useNavigate();

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-8 lg:px-10">
      <section className="relative overflow-hidden rounded-3xl border bg-card p-8 shadow-sm lg:p-12">
        <div className="absolute -right-24 -top-24 size-72 rounded-full bg-primary/5 blur-3xl" />
        <div className="relative max-w-3xl">
          <Badge variant="secondary" className="mb-5 gap-2 px-3 py-1">
            <Sparkles className="size-3.5" /> AI 优先增长工作区
          </Badge>
          <h1 className="text-4xl font-semibold tracking-tight lg:text-5xl">
            先说你想解决的增长问题。
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
            NocoReach 会把项目上下文、搜索表现、竞品动作和 AI 可见性组织起来，先给结论，再展示证据，最后生成可以执行的行动。
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" onClick={() => navigate("/seo-opportunities")}>
              从内容机会开始 <ArrowRight className="ml-2 size-4" />
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate("/connections")}>
              连接数据
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.3fr_0.7fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle>今天值得关注什么</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">数据接入后，AI 会在这里汇总变化、机会和建议。</p>
              </div>
              <FileSearch className="size-5 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-2xl border border-dashed bg-muted/20 p-8 text-center">
              <p className="font-medium">还没有可分析的数据</p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                先连接一个网站和搜索数据源。完成后，这里会自动生成增长简报，而不是要求你先配置一堆报表。
              </p>
              <Button className="mt-5" variant="outline" onClick={() => navigate("/connections")}>
                开始连接
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>开始进度</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {steps.map((step) => (
              <div key={step.label} className="flex items-center gap-3 text-sm">
                {step.done ? (
                  <CheckCircle2 className="size-5 text-emerald-600" />
                ) : (
                  <CircleDashed className="size-5 text-muted-foreground" />
                )}
                <span className={step.done ? "" : "text-muted-foreground"}>{step.label}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
