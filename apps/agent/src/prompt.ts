// The brief Claude Code receives for one step. Everything below the instruction is material, not instructions.
export function buildPrompt(input: any): string {
  const p = input.project || {}, ev = input.evidence || {}, insight = ev.insight || {};
  const memory = Object.entries(p).filter(([, v]) => typeof v === 'string' && v).map(([k, v]) => `- ${k}: ${v}`).join('\n');
  const signals = (ev.signals || []).map((s: any) => `- ${s.title}：${(s.facts || []).join('；')}`).join('\n');
  const approved = (input.previousStages || []).map((s: any) => `### ${s.stage}\n${s.output}`).join('\n\n');
  const scope = input.repo?.allowedPaths?.length ? input.repo.allowedPaths.join('、') : '整个仓库';
  // An analysis step (step: 'analyze') reads and writes a document; a plan step writes what will change. Both are read-only.
  const head = input.mode === 'plan' && input.step === 'analyze'
    ? `你是 NocoReach 的本机 Agent，当前目录是仓库 ${input.repo?.repo} 的工作副本。\n这一步：${input.stage?.instruction}\n这一步只做分析，不要修改任何文件，也不要运行命令。可以阅读仓库、下面的资料和公开网页；引用网页时附上链接，不编造数据，资料不足时写明缺什么。用 Markdown 写出结果作为最后的回答，先写结论。`
    : input.mode === 'plan'
    ? `你是 NocoReach 的本机 Agent，当前目录是仓库 ${input.repo?.repo} 的工作副本。\n这一步：${input.stage?.instruction}\n不要修改任何文件，也不要运行命令。读完下面的资料和仓库后，用 Markdown 写出具体方案作为最后的回答：要改哪些文件和段落、改成什么、为什么。任务说明与仓库实际情况不符时，指出来并给出你的改法。`
    : `你是 NocoReach 的本机 Agent，当前目录是仓库 ${input.repo?.repo} 的工作副本（分支 ${input.branch}）。\n这一步：${input.stage?.instruction}\n只修改文件，不要运行 git 或其他命令；提交、推送和创建 PR 由程序完成。允许修改的范围：${scope}。完成后用三到五句话总结你改了什么、哪些地方没有改以及原因。\n最后另起三行，严格按下面的格式写（程序会读取）：\n发布说明：一两句话，写给网站读者的这次改动\n核对文字：从你新写或改动的内容里原样摘一句会出现在网页上的文字，8 到 30 个字\n页面：改动影响的网站页面路径，用逗号分隔，例如 /cn/commercial；不确定就写关联页面的路径`;
  const parts = [head,
    `## 任务\n${input.title || input.task?.title || ''}\n\n${input.task?.brief || ''}`,
    input.playbook ? `## 做法\n${input.playbook}` : '',
    input.content?.url ? `## 关联页面\n${input.content.title || ''} ${input.content.url}` : '',
    input.note ? `## 负责人的补充说明\n${input.note}` : '',
    input.notes?.length ? `## 负责人的留言\n${input.notes.map((n: string) => `- ${n}`).join('\n')}` : '',
    input.handoff ? `## 上一个任务交付的文档\n${input.handoff}` : '',
    insight.title ? `## 依据\n${insight.title}\n${insight.observation || ''}\n${insight.meaning || ''}\n建议：${insight.suggestion || ''}` : '',
    signals ? `## 引用的信号\n${signals}` : '',
    approved ? `## 已通过的前序成果\n${approved}` : '',
    input.rejectedDraft ? `## 被退回的上一版\n${input.rejectedDraft}` : '',
    input.feedback?.length ? `## 修改意见\n${input.feedback.map((f: string) => `- ${f}`).join('\n')}` : '',
    memory ? `## 项目记忆\n${memory}` : '',
  ];
  return parts.filter(Boolean).join('\n\n');
}
