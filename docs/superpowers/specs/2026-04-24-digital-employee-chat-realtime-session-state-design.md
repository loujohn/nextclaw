# 设计文档：数字员工聊天实时会话状态保活与恢复

## 1. 背景

`packages/nextclaw-digital-employee/app/pages/employees/[id]/chat.vue` 当前把以下关键状态都保存在页面局部 `ref` 中：

1. `messages`
2. `activeSessionKey`
3. `sending`
4. `activeRunId`
5. `streamAbortController`
6. `streamingAssistantId`
7. `loadingMessages`

这会带来两个直接问题：

1. 切换员工详情页顶部 tab 后，`NuxtPage` 卸载，聊天页局部状态丢失；回到聊天页时会重新执行 `initializeChat()`，把界面恢复成历史持久化内容，正在进行中的实时对话不可见。
2. 流式中的会话和历史会话共用一份 `messages` 页面态；当用户切到别的历史会话后，再切回原实时会话，前端没有按 `sessionKey` 保存流式中的中间态，导致实时内容无法恢复。

同时，服务端 `EmployeeRunService.streamChatTurn()` 只会在 `completed / aborted / failed` 时持久化 assistant 结果，因此**流式中的增量内容必须由前端负责保活**。

## 2. 目标与非目标

### 2.1 目标

1. 切换顶部 tab 再回到聊天页时，仍显示原来的实时对话进度。
2. 允许用户在流式期间切换到其他历史会话，再切回原会话时恢复实时内容。
3. 保持当前 SSE 协议、会话列表接口、历史消息接口不变。
4. 尽量限制改动在 `nextclaw-digital-employee` 内部，不引入整套 chat-runtime 重构。

### 2.2 非目标

1. 不解决浏览器整页刷新后的流式恢复。
2. 不改造服务端为“边流边落库”。
3. 不把数字员工聊天整体迁移到 `packages/nextclaw-ui` 的 runtime/presenter 架构。

## 3. 方案结论

采用**方案 B：会话级实时状态仓库**。

核心思路：

1. 把“页面态”拆成“页面视图态”和“会话级实时态”。
2. 会话级实时态按 `employeeId + sessionKey` 存储，而不是只存一份当前消息列表。
3. 把不可序列化的流式句柄（`AbortController`、reader 任务）从页面中移出，挂到模块级 runtime registry。
4. 页面只负责选择当前展示哪个会话，不再拥有实时流的生命周期。

## 4. 总体架构

```text
chat.vue
  ├─ useEmployeeChatStore(employeeId)
  │    ├─ serializable state (useState)
  │    │    ├─ selectedSessionKey
  │    │    ├─ sessions
  │    │    ├─ sessionStateByKey
  │    │    └─ loading / cursor / error
  │    └─ actions
  │         ├─ initializeChat()
  │         ├─ selectSession()
  │         ├─ sendMessage()
  │         ├─ loadPersistedMessages()
  │         └─ cancelRun()
  └─ render currentSessionState.displayMessages

chat runtime registry (module-scope Map)
  └─ employeeId:sessionKey
       ├─ abortController
       ├─ streamTask
       └─ activeRunId
```

设计原则：

1. **页面可卸载，运行时不可随页面一起消失。**
2. **实时状态按会话隔离，不同 session 互不覆盖。**
3. **服务端历史和前端实时 overlay 分层管理，避免历史回拉覆盖流式快照。**

## 5. 状态分层设计

## 5.1 页面级状态

仅保留纯视图绑定：

1. `threadEl`
2. `sessionListEl`
3. `textareaEl`
4. `fileInputEl`
5. `shouldStickToBottom`
6. `restoringHistoryScroll`

这些状态可以随页面重建，不影响实时会话正确性。

## 5.2 会话级状态模型

新增 `app/composables/useEmployeeChatStore.ts`，维护以下模型：

```ts
type ChatRunPhase = "idle" | "preparing" | "streaming" | "completed" | "aborted" | "failed";

type ChatSessionRealtimeState = {
  sessionKey: string;
  persistedMessages: ChatMessageView[];
  overlayMessages: ChatMessageView[];
  nextCursor: string | null;
  loadStatus: "idle" | "loading" | "loaded" | "error";
  requestVersion: number;
  runPhase: ChatRunPhase;
  activeRunId: string;
  streamingAssistantId: string | null;
  lastError: string;
  lastTouchedAt: string;
  hydratedAt: string | null;
};

type EmployeeChatStoreState = {
  selectedSessionKey: string;
  sessions: ChatSessionListItem[];
  sessionNextCursor: string | null;
  loadingSessions: boolean;
  loadingMoreSessions: boolean;
  pendingUploads: ChatAttachmentView[];
  sessionStateByKey: Record<string, ChatSessionRealtimeState>;
};
```

`useState` key 建议采用 `employee-chat:${employeeId}`，保证不同员工的聊天状态彼此隔离。

其中：

1. `persistedMessages` 存后端已落库历史。
2. `overlayMessages` 存前端本地实时层，包括：
   - optimistic user message
   - streaming assistant message
   - 运行中 reasoning / tool / delta
   - terminal fallback message
3. `displayMessages = [...persistedMessages, ...overlayMessages]`，但需要按消息 id 去重。

## 5.3 Runtime Registry

新增 `app/lib/chat-runtime-registry.ts`：

```ts
type ChatRuntimeHandle = {
  employeeId: string;
  sessionKey: string;
  abortController: AbortController;
  activeRunId: string;
  streamTask: Promise<void>;
};
```

使用模块级 `Map<string, ChatRuntimeHandle>` 保存。
该 registry 只在客户端运行时创建，不参与 SSR 序列化。

原因：

1. `AbortController` 不适合放进 `useState`。
2. 页面卸载后 registry 仍在浏览器内存中，SSE 读取循环可继续完成。
3. 页面重新挂载时可通过 `employeeId + sessionKey` 找回对应运行时。

## 6. 核心交互流程

## 6.1 发送消息

1. 用户点击发送。
2. `sendMessage()` 获取当前 `selectedSessionKey` 对应的 `ChatSessionRealtimeState`。
3. 先把用户消息追加到 `overlayMessages`。
4. 将会话 `runPhase` 置为 `preparing`，并创建空 assistant streaming message。
5. 创建 `AbortController`，把句柄登记到 runtime registry。
6. 发起 `POST /api/employees/:id/chat` 并消费 SSE。
7. SSE 增量只更新当前 session 对应的 `overlayMessages`。
8. 若服务端返回了新的真实 `sessionKey`，则把 draft session 的整份 realtime state 原子迁移到真实 `sessionKey`。

## 6.2 切换顶部 tab 再返回

1. 路由切离聊天页时，不执行 `abort()`。
2. 页面卸载只释放 DOM 引用，不清空 `useEmployeeChatStore` 中的会话态。
3. 流式 reader 继续通过 action 更新 store 中的 `sessionStateByKey[sessionKey]`。
4. 回到聊天页时，直接根据 `selectedSessionKey` 渲染该 session 的 `displayMessages`。
5. 对于 `runPhase in ("preparing", "streaming")` 的 session，不主动用 `loadMessages()` 覆盖当前显示内容。

## 6.3 切到其他历史会话再切回实时会话

1. `selectSession(nextSessionKey)` 只切换 `selectedSessionKey`，不影响其他 session 的 runtime handle。
2. 若目标会话已有本地 state，立即显示其 `displayMessages`。
3. 若目标会话尚未 hydrate，则调用 `loadPersistedMessages(sessionKey)` 填充 `persistedMessages`。
4. 当用户切回仍在流式的原会话时，因为其 `overlayMessages` 一直保存在 store 中，所以可以直接恢复实时内容。

## 6.4 运行结束后的收敛

1. 收到 `done` / `run_failed` / `run_aborted` 后，将 `runPhase` 更新为终态。
2. 调用现有 `fetchSessions()` 保持会话列表预览一致。
3. 再调用 `loadPersistedMessages(sessionKey, { preserveOverlay: true })`。
4. 当后端历史已经包含终态 assistant 消息时，清空对应 `overlayMessages`，避免重复渲染。

## 7. 历史消息与实时 overlay 的合并策略

这是本次设计最关键的点。

当前 `loadMessages(sessionKey)` 会直接执行：

```ts
messages.value = response.data.items;
```

这在流式期间会把本地实时内容覆盖掉，因此改为：

```ts
state.persistedMessages = response.data.items;
state.nextCursor = response.data.nextCursor;
```

展示层统一走：

```ts
function buildDisplayMessages(state: ChatSessionRealtimeState): ChatMessageView[] {
  return mergePersistedAndOverlay(state.persistedMessages, state.overlayMessages);
}
```

合并规则：

1. 优先保留 `overlayMessages` 中的 streaming assistant。
2. 若服务端历史中已经出现同一条终态 assistant（可通过 message id 或角色+时间窗口+内容匹配），则移除 overlay 对应项。
3. 历史分页上翻只影响 `persistedMessages`，不触碰 `overlayMessages`。

## 8. 选中会话与初始化策略

`initializeChat()` 改为两阶段：

### 阶段一：恢复本地选中状态

1. 先读取 store 中的 `selectedSessionKey`。
2. 若该 key 仍在 `sessions` 列表中，继续选中它。
3. 若不存在，则回退到 `resolveInitialChatSelection()` 当前逻辑。

### 阶段二：按会话状态决定是否拉历史

规则：

1. 若 session `runPhase` 为 `preparing` 或 `streaming`，只在缺少 `persistedMessages` 时后台静默拉历史，不替换当前 UI。
2. 若 session 已有 `displayMessages`，优先直接展示。
3. 若 session 从未 hydrate，则正常调用历史接口。

这样可以避免回到聊天页时闪回历史内容。

## 9. 文件级改造建议

## 9.1 新增文件

1. `app/composables/useEmployeeChatStore.ts`
2. `app/lib/chat-runtime-registry.ts`
3. `app/lib/chat-message-merge.ts`

## 9.2 重点调整文件

### `app/pages/employees/[id]/chat.vue`

职责收敛为：

1. 订阅 store
2. 触发 action
3. 维护 DOM/滚动
4. 渲染当前选中会话

要移出的逻辑：

1. SSE 读取循环
2. `streamAbortController`
3. `activeRunId`
4. `streamingAssistantId`
5. `messages` 主数据源

### `app/lib/chat-session-bootstrap.ts`

保留当前“初始化选中”职责，但增加一个前置约束：

1. 若 store 已有有效 `selectedSessionKey`，优先使用 store 值。

### `app/lib/chat-post-run-refresh.ts`

继续保留会话列表本地 upsert 能力，但作用范围从页面态改成 store 中的 `sessions`。

## 10. 错误处理

## 10.1 流式失败

1. 更新对应 session 的 `runPhase = "failed"`。
2. 将错误消息写入该 session `lastError`。
3. 若失败前已有增量回复，则保留在 overlay 中，避免用户切走再回来时只看到空白。

## 10.2 用户取消

1. `cancelRun()` 通过 registry 找到对应 session 的 handle。
2. 优先走当前取消接口 `/chat/:runId/cancel`。
3. 若服务端停止失败，再执行本地 `abort()`。
4. 取消只影响目标 session，不影响当前 UI 是否选中它。

## 10.3 会话切换并发

为每个 session 单独维护 `loadStatus` 与 `requestVersion`，避免：

1. A 会话历史请求返回后覆盖 B 会话。
2. 背景静默刷新把运行中的 overlay 抹掉。

## 11. 验证与测试设计

建议补三类测试。

### 11.1 纯函数测试

新增 `chat-message-merge.test.ts`：

1. 历史消息 + overlay 合并时不重复。
2. 运行结束后历史消息可正确替换 overlay。
3. 上翻历史时不影响实时层。

### 11.2 store 行为测试

新增 `employee-chat-store.test.ts`：

1. tab 卸载/重挂载不丢失实时 session state。
2. 切换历史会话再切回实时会话时恢复原实时消息。
3. draft session 在收到真实 `sessionKey` 后可原子迁移。

### 11.3 回归测试

补充现有聊天测试关注以下场景：

1. `initializeChat()` 遇到本地运行中 session 时不回落成纯历史内容。
2. `loadPersistedMessages()` 在 `streaming` 状态下不会覆盖 overlay。
3. `cancelRun()` 只取消指定 session。

## 12. 发布与迁移策略

本方案可分两步落地：

1. 第一步：先抽 store + registry，把页面实时状态迁出，保证顶部 tab 切换保活。
2. 第二步：把 `messages` 拆成 `persistedMessages + overlayMessages`，补齐“切历史再切回实时”的恢复能力。

这样可以控制回归风险，并且每一步都能独立验收。

## 13. 风险与缓解

1. **风险：overlay 与持久化历史重复显示。**  
   缓解：统一通过 `mergePersistedAndOverlay()` 输出展示列表，不允许页面自行拼接。

2. **风险：runtime registry 泄漏无用句柄。**  
   缓解：在 `done / failed / aborted` 以及 session 被显式清理时删除 registry 项。

3. **风险：会话列表和会话详情状态分叉。**  
   缓解：继续复用 `upsertLocalChatSession()`，并以 `sessionKey` 作为唯一键。

## 14. 推荐实施顺序

1. 抽出 `useEmployeeChatStore()` 与 registry。
2. 把 `chat.vue` 的 `messages / sending / activeRunId / streamingAssistantId` 迁入 store。
3. 把 SSE 读取逻辑迁入 store action。
4. 引入 `persistedMessages + overlayMessages` 双层模型。
5. 调整 `initializeChat()` 和 `selectSession()`。
6. 补纯函数测试与 store 测试。

## 15. 结论

方案 B 的关键不在于“缓存页面”，而在于把**实时会话状态从页面生命周期中解耦**，并让状态以 `employeeId + sessionKey` 为边界长期驻留于前端运行时。

这样可以同时满足：

1. 切顶部 tab 后返回，实时对话仍在。
2. 切其他历史会话后返回，原实时会话内容可恢复。
3. 对现有服务端协议和持久化链路改动最小。
