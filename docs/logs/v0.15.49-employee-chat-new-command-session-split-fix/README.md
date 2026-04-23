# v0.15.49 employee-chat-new-command-session-split-fix

## 迭代完成说明

- 修复数字员工聊天与渠道接入中 `/new` 未生效的问题，并将行为按场景拆分：
  - UI 聊天输入 `/new` 时，不再把命令当普通消息发送，而是直接切到新的内部聊天会话。
  - 钉钉等渠道输入 `/new` 时，复用核心命令清空当前 peer 对应的会话历史，但不生成新的 peer 会话 key，避免同一外部联系人被拆成多条渠道会话。
- 新增共享命令识别工具 [packages/nextclaw-digital-employee/shared/chat-command.ts](../../../packages/nextclaw-digital-employee/shared/chat-command.ts)，统一识别 `/new` 与 `/reset`。
- 在 [packages/nextclaw-digital-employee/server/services/employee-run-service.ts](../../../packages/nextclaw-digital-employee/server/services/employee-run-service.ts) 中为 UI 聊天链路增加 `/new` 特判，命中后创建新的持久化聊天会话并返回新的 `sessionKey`，不进入模型执行、不写入用户消息。
- 在 [packages/nextclaw-digital-employee/server/runtime/channel-runtime.ts](../../../packages/nextclaw-digital-employee/server/runtime/channel-runtime.ts) 中接回核心 `CommandRegistry`，让渠道消息先经过命令分发，再决定是否进入模型处理。
- 在 [packages/nextclaw-digital-employee/app/pages/employees/[id]/chat.vue](../../../packages/nextclaw-digital-employee/app/pages/employees/%5Bid%5D/chat.vue) 中拦截 `/new`，本地清理输入态与上传态后直接创建新会话，避免命令内容出现在消息流里。

## 测试/验证/验收方式

- 定向测试：执行 `pnpm -C /Users/loujohn/project/nextclaw/packages/nextclaw-digital-employee exec vitest run tests/chat-command.test.ts tests/employee-chat-command.test.ts tests/channel-runtime-command.test.ts`，结果 3/3 通过。
- 类型检查：执行 `pnpm -C /Users/loujohn/project/nextclaw/packages/nextclaw-digital-employee tsc`，结果通过。
- 定向 lint：执行 `pnpm -C /Users/loujohn/project/nextclaw/packages/nextclaw-digital-employee exec eslint --rule 'max-lines: off' --rule 'no-useless-escape: off' 'shared/chat-command.ts' 'server/services/employee-run-service.ts' 'server/runtime/channel-runtime.ts' 'app/pages/employees/[id]/chat.vue' 'tests/chat-command.test.ts' 'tests/employee-chat-command.test.ts' 'tests/channel-runtime-command.test.ts'`，结果通过。
- lint 说明：`chat.vue` 存在既有 `no-useless-escape` 与超长文件 `max-lines` 历史噪音，不属于本次 `/new` 修复新增问题，因此本次仅对受影响文件做最小充分检查并显式关闭既有噪音规则。

## 发布/部署方式

- 本次包含 UI 与数字员工服务端运行时逻辑修复，但不涉及数据库 schema 变更，因此无需 migration。
- 按常规数字员工应用发布流程构建并部署 `packages/nextclaw-digital-employee` 即可。
- 若与其它功能合并发布，需在发布前重复执行本 README 中的定向测试与类型检查。

## 用户/产品视角的验收步骤

1. 打开任一数字员工聊天页，在输入框输入 `/new` 并发送。
2. 确认页面立即切换到新的聊天会话，输入框内容被清空，消息区中不会出现一条内容为 `/new` 的用户消息。
3. 回到任一已有会话，确认旧会话消息仍然保留，说明 UI 的 `/new` 是“新建内部会话”而不是清空旧会话。
4. 在钉钉私聊同一员工时，先发送几条消息建立上下文，再发送 `/new`。
5. 确认机器人返回“会话历史已清空”一类提示；随后继续发送业务消息时，不再带上发送 `/new` 之前的上下文。
6. 在钉钉侧重复多次 `/new` 后，确认同一个外部联系人不会在系统内裂变出多条渠道 peer 会话。
