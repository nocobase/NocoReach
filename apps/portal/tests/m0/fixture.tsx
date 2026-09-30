import { createRoot } from 'react-dom/client';
import { ReachDetailLayout } from '../../src/components/reach-detail-layout';
import '../../src/App.css';

const params = new URLSearchParams(location.search);
document.documentElement.classList.toggle('dark', params.has('dark'));
document.documentElement.style.fontSize = params.has('compact') ? '14px' : '16px';
createRoot(document.getElementById('root')!).render(
  <div className="h-screen flex flex-col bg-background text-foreground">
    <header className="border-b p-4">NocoReach · M0 隔离验证</header>
    <div className="flex min-h-0 flex-1">
      <nav aria-label="主导航" className="hidden lg:block w-48 shrink-0 border-r p-5">任务工作台</nav>
      <main data-scroll className="min-w-0 flex-1 overflow-y-auto">
        <ReachDetailLayout asideLabel="任务属性" main={<div className="p-6 space-y-6">
          <div><p className="text-muted-foreground">示例项目 / TASK-DEMO</p><h1 className="text-2xl font-semibold">准备产品介绍文案</h1></div>
          <p>成果等待审核 · 执行已成功</p>
          <section className="border rounded-lg p-5"><h2>当前成果</h2><p>本页仅使用合成数据验证 Portal 布局，不连接业务接口。</p></section>
          {Array.from({ length: 18 }, (_, i) => <section key={i} className="border-b py-5"><h2>活动记录 {i + 1}</h2><p>保留方案、执行和人工审核记录。</p></section>)}
        </div>} aside={<div className="p-5 space-y-5">
          <h2>任务属性</h2><p>负责人：示例用户</p><p>执行者：本地 echo</p><p>方案版本：1</p><p>执行状态：成功</p><p>审核状态：待人工审核</p>
          {params.has('tall') && Array.from({ length: 30 }, (_, i) => <p key={i}>扩展属性 {i + 1}</p>)}
        </div>} />
      </main>
    </div>
  </div>,
);
