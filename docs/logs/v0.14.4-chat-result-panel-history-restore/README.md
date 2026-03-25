# v0.14.4-chat-result-panel-history-restore

## 迭代完成说明

### 改了什么

本次修复数字员工聊天页右侧“结果”模块在页面刷新、重新进入聊天页或首屏加载后不展示已有结果的问题。

### 用户可见变化

- 聊天成功后，右侧“结果”模块仍然显示本次结构化结果卡片。
- 刷新页面或重新进入同一员工聊天页后，页面会自动恢复最近一次聊天运行产生的结果卡片，不再只剩消息历史、结果区为空。
- “查看运行详情”链接会同步恢复最近一次聊天运行的 runId。

### 关键实现点

- 聊天历史接口不再只返回消息历史，同时返回最近一次聊天触发 run 的 `lastRunId` 和 `resultCards`。
- 聊天页初始化时从历史接口回填 `resultCards`，而不是只依赖本次 POST `/chat` 请求返回的内存态。
- 新增运行记录结果卡片解析 helper，并兼容历史 run 数据中 `tone` 或 `items` 缺失的旧结构，避免旧记录无法恢复。

### 相关代码

- [聊天页结果恢复](../../../packages/nextclaw-digital-employee/app/pages/employees/[id]/chat.vue)
- [聊天历史接口补充结果快照](../../../packages/nextclaw-digital-employee/server/api/employees/[id]/chat/history.get.ts)
- [运行结果卡片读取与最近聊天结果选择](../../../packages/nextclaw-digital-employee/shared/ui-models.ts)
- [结果恢复测试](../../../packages/nextclaw-digital-employee/tests/ui-models.test.ts)

## 测试/验证/验收方式

### 已执行验证

```bash
pnpm -C packages/nextclaw-digital-employee test -- packages/nextclaw-digital-employee/tests/ui-models.test.ts
pnpm -C packages/nextclaw-digital-employee lint
pnpm -C packages/nextclaw-digital-employee tsc
```

### 实际结果

- `ui-models.test.ts` 通过，结果为 `14 passed, 0 failed`。
- 本次改动涉及文件使用编辑器诊断检查通过，无新增错误：
  - `app/pages/employees/[id]/chat.vue`
  - `server/api/employees/[id]/chat/history.get.ts`
  - `shared/ui-models.ts`
  - `tests/ui-models.test.ts`
- `lint` 未通过，但失败项为仓库现存问题，主要集中在未使用变量、`any`、超长文件等，与本次结果恢复改动无直接关系。
- `tsc` 未通过，但当前剩余错误为仓库存量问题，集中在以下文件，与本次改动无直接关系：
  - `packages/nextclaw-digital-employee/app/pages/employees/[id]/index.vue`
  - `packages/nextclaw-digital-employee/app/pages/employees/index.vue`
  - `packages/nextclaw-digital-employee/server/engine/NextclawEngineGateway.ts`
  - `packages/nextclaw-digital-employee/server/repositories/run-record-repository.ts`

### 本次验收重点

- 聊天结果卡片是否能从持久化的 run 记录恢复。
- 旧 run 记录缺少部分卡片字段时，是否仍能回填基础结果内容。
- 刷新/重进页面后，消息和结果是否同时存在，而不是只剩消息。

## 发布/部署方式

本次变更为 `@nextclaw/digital-employee` 包内前后端一体逻辑修复，当前未执行发布。

如需后续发布，按项目既有流程处理；若本次仅用于本地开发或测试环境验证，则发布/部署为“不适用”。

不适用原因：

- 当前交付目标是修复并记录聊天结果模块的历史恢复逻辑。
- 本次未生成 changeset，未执行 npm 发布，也未执行线上部署。

## 用户/产品视角的验收步骤

1. 打开任一数字员工的聊天页。
2. 发送一条能产生结构化回复的消息，例如要求输出摘要、项目维度、负责人维度或建议动作。
3. 确认右侧“结果”模块出现至少一张结果卡片。
4. 记录当前页面出现的“查看运行详情”入口，并确认可以跳到对应运行详情。
5. 刷新当前聊天页，或离开后重新进入该员工聊天页。
6. 确认聊天消息历史仍存在。
7. 确认右侧“结果”模块同步恢复最近一次聊天的结果卡片，而不是显示“等待结果产出”。
8. 如存在历史 run 记录，确认旧记录也能恢复至少基础摘要内容，不因缺少旧字段而整块为空。
