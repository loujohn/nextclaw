# v0.15.60-employee-chat-realtime-session-state

## 迭代完成说明

- 数字员工聊天页已将实时会话主状态从页面局部 ref 迁移到会话级 store：新增 [useEmployeeChatStore.ts](../../../packages/nextclaw-digital-employee/app/composables/useEmployeeChatStore.ts) 与 [employee-chat-store-controller.ts](../../../packages/nextclaw-digital-employee/app/lib/employee-chat-store-controller.ts)，按 `employeeId + sessionKey` 保存 `persistedMessages`、`overlayMessages`、`runPhase`、`activeRunId`、`streamingAssistantId` 等状态。
- 新增 [chat-runtime-registry.ts](../../../packages/nextclaw-digital-employee/app/lib/chat-runtime-registry.ts)，把 `AbortController` 和流式任务句柄从页面生命周期中剥离，支持切走 tab 或切到其他历史会话后继续接收同一实时会话的增量内容。
- 新增 [chat-message-merge.ts](../../../packages/nextclaw-digital-employee/app/lib/chat-message-merge.ts)，统一合并后端持久化历史与前端实时 overlay，避免 `loadMessages()` 类历史回拉覆盖正在进行的流式内容，也避免终态落库后重复显示 optimistic / streaming 消息。
- 聊天页 [chat.vue](../../../packages/nextclaw-digital-employee/app/pages/employees/[id]/chat.vue) 已收敛为视图层：保留滚动、DOM 引用、上传交互，发送/取消/会话切换/历史加载均接入 store；同时移除流式期间对会话列表的禁用，允许切换历史会话后再返回实时会话恢复内容。
- 新增设计对应测试 [chat-message-merge.test.ts](../../../packages/nextclaw-digital-employee/tests/chat-message-merge.test.ts) 与 [employee-chat-store.test.ts](../../../packages/nextclaw-digital-employee/tests/employee-chat-store.test.ts)。
- 设计文档见 [2026-04-24-digital-employee-chat-realtime-session-state-design.md](../../superpowers/specs/2026-04-24-digital-employee-chat-realtime-session-state-design.md)。

## 测试/验证/验收方式

- 定向单测：`pnpm exec vitest run tests/chat-message-merge.test.ts tests/employee-chat-store.test.ts tests/chat-message-groups.test.ts tests/chat-session-bootstrap.test.ts tests/chat-post-run-refresh.test.ts`
- 定向 lint：`pnpm exec eslint --rule 'max-lines: off' --rule 'max-lines-per-function: off' 'app/pages/employees/[id]/chat.vue' 'app/composables/useEmployeeChatStore.ts' 'app/lib/employee-chat-store-controller.ts' 'app/lib/chat-message-merge.ts' 'app/lib/chat-runtime-registry.ts' 'tests/chat-message-merge.test.ts' 'tests/employee-chat-store.test.ts'`
- 编辑器问题检查：确认 [chat.vue](../../../packages/nextclaw-digital-employee/app/pages/employees/[id]/chat.vue)、[useEmployeeChatStore.ts](../../../packages/nextclaw-digital-employee/app/composables/useEmployeeChatStore.ts)、[employee-chat-store-controller.ts](../../../packages/nextclaw-digital-employee/app/lib/employee-chat-store-controller.ts) 无新增类型错误。
- 冒烟说明：本次未执行浏览器级 UI 冒烟；当前工作区未启动可直接登录和进入员工聊天页的本地运行环境，因此以会话级 store 行为测试覆盖“切 tab 后恢复实时会话”“切历史再切回恢复 overlay”“draft session 迁移真实 sessionKey”三条最关键执行路径。后续上线前仍需补一次真实页面冒烟。

## 发布/部署方式

- 本次仅涉及 `@nextclaw/digital-employee` 前端聊天模块代码，无数据库 migration、无后端协议变更、无独立部署步骤。
- 若合并后需要发布，按项目常规前端/应用发布流程重新构建 `packages/nextclaw-digital-employee` 所在应用即可；远程 migration 不适用，因为未触达后端或数据库。

## 用户/产品视角的验收步骤

1. 进入任一员工详情页的聊天 tab，发送一条会触发流式回复的消息。
2. 在回复尚未结束时切到员工详情页顶部其他 tab，再切回聊天 tab，确认实时回复内容仍保留且继续更新，而不是回退成纯历史消息。
3. 在回复尚未结束时，切到左侧任一历史会话，再切回原实时会话，确认之前的用户消息、实时 assistant 增量内容和取消按钮状态仍可恢复。
4. 让一次实时会话结束后，确认左侧会话列表预览已更新，且当前线程中不会同时出现一份 overlay 回复和一份相同历史回复的重复消息。
5. 在实时会话进行中点击取消，确认只影响当前会话；切到其他历史会话再回来时，取消后的终态内容仍能恢复显示。