# M0 任务与执行契约 v1

本文件为 M1/M2 实现约束；除现有 `nrTaskWork` 外，下列持久化实体与 HTTP 接口尚未上线。隔离原型只验证 JSON 往返、CommonJS 加载、结果隔离和版本边界，不能作为生产授权服务。

## 实体与职责

| 实体 | 最小字段与约束 |
| --- | --- |
| Task | id、projectId、humanOwnerId、workRevision、businessStage；负责人必须为人，未知旧负责人显示未指定，启动新执行前指定 |
| PlanVersion | id、taskId、version、steps（稳定 stepId、executorKind、instruction、acceptance）、approvedBy、approvedAt；确认后不可覆盖，编辑生成新版本 |
| Run | id、projectId、taskId、planVersion、stepId、executorKind、executorId、status、triggerActor、requestId、capabilitySnapshot、startedAt、endedAt；单次尝试独立记录 |
| ArtifactVersion | id、runId（人工／旧数据允许为空）、stepId、planVersion、version、content 或受控附件引用、createdBy、createdAt；人工编辑生成版本，不覆写 AI 版本 |
| Review | id、artifactVersionId、decision、reviewerId、reviewedAt、comment；审核精确绑定成果版本，只有人能批准 |
| ExecutionReceipt / Verification | 保留实际执行记录与效果验证，不能由 Run 成功或成果通过审核自动生成 |

`executorKind = online | local | human`。在线员工处理授权数据范围内的分析、方案、文案和总结；依赖本机文件、Git、构建或工具进程的工作由 local 执行。按步骤能力选择，不按员工姓名路由。线上 provider 当前只是直接模型调用，新 Run 适配需在 M1 开发。

任务业务阶段沿用六列：待确认方案、待推进、待审核、待执行、待验证、已完成。Run 状态独立：queued → running → succeeded / failed；queued 可直接 cancelled，running → cancelling → cancelled。终态不可改写，重试新建 runId。成功只产生待审核候选成果；通过所有必要步骤审核才进入待执行，真实发布与验证独立处理。

## 接口边界

以下为拟实施的 NocoBase resource/action 名称，M0 **未注册**这些资源。所有写入使用事务、服务端角色及项目权限、请求幂等键；客户端提交的 actor、授权、状态不可信。

| 动作 | 请求核心字段 | 结果／约束 |
| --- | --- | --- |
| nrTaskRuns:start | projectId、taskId、planVersion、stepId、executorId、expectedRevision、requestId | 校验方案确认、人工负责人、执行权限与能力后返回 runId；同键同载荷返回原结果，异载荷 409 |
| nrTaskRuns:get | projectId、taskId、runId | 仅同项目授权用户可读；包含执行状态和成果引用 |
| nrTaskRuns:cancel | projectId、runId、expectedRevision、requestId | 记录取消意图，未确认停机前显示 cancelling；重复取消幂等 |
| nrTaskArtifacts:revise | projectId、artifactVersionId、content、expectedRevision、requestId | 新版本；原版本、审核与执行历史保留 |
| nrTaskReviews:decide | projectId、artifactVersionId、decision、expectedRevision、requestId | 人工 approve / requestChanges；旧版本不能推进当前步骤 |
| nrExecution:claim | computerId、capabilities、requestId | 机器凭证认证，服务端返回租约、runToken、不可变工作上下文；无任务时空响应 |
| nrExecution:heartbeat / events / complete / fail / cancelAck | runId、leaseId、attempt、sequence、payload | runToken 仅限此 run；租约过期、错项目／run 拒绝；终态撤销令牌 |

Run 启动快照保存协议版本、项目／任务／方案／步骤、调用人、能力及工具约束。执行时能力 = 启动快照 ∩ 当前授权；不能把宿主管理员 token、全局环境变量传给本地进程。事件按 `(runId, attempt, sequence)` 幂等写入；断线补传不重复执行；租约丢失不能自动重跑不确定的外部副作用。发布动作另需绑定目标和成果版本的明确授权。

M0 JSON 包：`{protocolVersion:1, projectId, taskId, runId, planVersion, stepId, prompt}`；echo 返回 `{request, content, exitCode}`。原型严格比对预期上下文、当前方案和取消状态，重复结果同文返回、异文拒绝；返回候选成果 `review:pending`。它不实现租约、持久化、身份认证、完整不可信 JSON schema 或正式 NocoProject 协议兼容。M1/M2 实际 API 必须增加运行时 schema、长度限制和上述权限；不能直接挂载原型。

## 旧数据兼容与迁移

保留 `nrTasks.evidence.work` 和原始 evidence，不在 M0 运行迁移。M1 先提供只读投影；写入新模型时在事务内进行幂等、按任务迁移，标记 schemaVersion，保留原快照；回退仅切换读路径，避免双写。

| 旧字段／状态 | 新模型映射 |
| --- | --- |
| work.stage=plan/work/execution/verification/done | plan→待确认方案；work 当前成果已保存未批准→待审核，否则待推进；execution→待执行；verification→待验证；done→已完成 |
| work.revision | 保留为乐观锁版本，不能直接当 planVersion |
| work.plan、steps 数组 | 导入首个方案版本，stepId 使用持久化迁移生成的稳定 ID；旧 owner=ai 只说明 AI 执行类别，不是人类负责人，也不代表本机权限 |
| work.results、history | 保留当前成果及历史快照，标记 legacy；不伪造旧 Run 或模型用量；旧审核时间／人存在则保留，不存在不补造 |
| receipt、verification | 原样保留；inconclusive 仍待验证，met/unmet 沿用既有完成语义 |
| evidence.work 缺失 | 不制造已批准方案；旧 status=已完成保持历史完成展示，其他任务等待建方案；未知状态显式 legacy，保留原文 |
| humanOwnerId 缺失 | 显示未指定；不能把 AI、审批人或当前浏览者自动指定为负责人 |

M1 验收必须包含：旧已完成任务不倒退、旧 evidence 不丢失、历史审核不冒充新版本审核、并发编辑 409 且草稿保留、异步回传不覆盖人工成果、跨项目读写拒绝。M0 仅验证隔离原型边界；这些真实持久化验收仍未完成。
