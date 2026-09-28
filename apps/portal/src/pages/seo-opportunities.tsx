import { ArrowRight, BrainCircuit, FileSearch, Link2, Search } from "lucide-react";
import { useNavigate } from "react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const questions = [
  "基于现有数据，最近最值得写什么关键词？",
  "哪些已有页面最值得优化？",
  "有没有关键词冲突或主题重叠？",
];

export default function SeoOpportunitiesPage() {
  const navigate = useNavigate();

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-8 lg:px-10">
      <header className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <Badge variant="outline" className="mb-3 gap-2"><BrainCircuit className="size-3.5" /> 页面内 AI 分析</Badge>
          <h1 className="text-3xl font-semibold tracking-tight">关键词选题</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">把关键词、已有内容和竞品表现汇总成可以直接决策的机会清单。</p>
        </div>
        <Button onClick={() => navigate("/connections")}>连接数据 <Link2 className="ml-2 size-4" /></Button>
      </header>

      <Card className="border-primary/20 bg-primary/[0.03]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Search className="size-5" /> 你现在想解决什么？</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          {questions.map((question) => (
            <button key={question} type="button" className="group rounded-2xl border bg-card p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm">
              <span className="text-sm leading-6">{question}</span>
              <ArrowRight className="mt-4 size-4 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-foreground" />
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>机会清单</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">AI 会把每条建议拆成结论、证据、风险和下一步行动。</p>
            </div>
            <FileSearch className="size-5 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-2xl border border-dashed bg-muted/20 p-10 text-center">
            <p className="font-medium">连接数据后，这里会出现第一批关键词选题</p>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">暂时不展示虚构的关键词和指标。下一步会接入迁移后的事实层数据，再实现真实的机会计算。</p>
            <Button className="mt-5" variant="outline" onClick={() => navigate("/connections")}>配置第一个数据源</Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
