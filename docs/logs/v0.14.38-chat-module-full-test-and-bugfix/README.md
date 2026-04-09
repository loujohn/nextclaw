# v0.14.38 · 聊天功能模块全量测试与 Bug 修复

**日期**：2026-04-09  
**范围**：`packages/nextclaw-digital-employee` 聊天核心链路全量测试、Bug 定位与修复  
**参考文档**：[聊天架构治理设计文档](../../../docs/superpowers/specs/2026-04-08-chat-architecture-governance-design.md)

---

## 一、迭代完成说明

本次对聊天功能模块进行了全量测试，涵盖以下核心链路：

- 多会话管理（创建、列表、切换、分页）
- SSE 流式执行（事件序列、增量渲染、元数据传递）
- 服务端取消（`cancelChatRun`、AbortController 联动）
- 聊天历史入库与分页读取（`chat_sessions` / `chat_messages`）
- 用户消息乐观插入与失败回滚
- 消息分组聚合（`buildChatDisplayMessages`）
- 定时任务会话持久化
- 跨员工会话隔离

### 发现并修复的 Bug

#### BUG-1：用户消息不应携带 `replyStatus`（严重）

**位置**：`server/services/employee-run-service.ts` → `toUiMessage()`  
**现象**：`inferRunStatusForMessage()` 对所有角色的消息均可能附加 `replyStatus`，导致用户消息在前端展示时也出现"已完成 / 已取消"等状态徽章，行为与产品设计相悖。  
**根因**：`replyStatus` 条件未限定 `message.role !== "user"` 的角色守卫。  
**修复**：在 `toUiMessage()` 中为 `replyStatus` 分配添加角色守卫，仅 `assistant` / `tool` / `system` 消息才携带 `replyStatus`。

```diff
- ...(resolvedRunStatus ? { replyStatus: formatRunStatusMeta(resolvedRunStatus) } : {}),
+ ...(resolvedRunStatus && message.role !== "user" ? { replyStatus: formatRunStatusMeta(resolvedRunStatus) } : {}),
```

---

#### BUG-2：`cancelMessage()` 未检查 `stopped` 字段（中）

**位置**：`app/pages/employees/[id]/chat.vue` → `cancelMessage()`  
**现象**：前端调用取消 API 后无论返回结果如何都不做任何 fallback 处理，当 `stopped: false`（run 已完成或不属于当前员工）时，前端 SSE 流仍会继续阻塞，无法被前端主动关闭。  
**根因**：旧实现直接调用 `$fetch` 但未检查响应体的 `stopped` 字段，API 失败时才 fallback。  
**修复**：解析响应体并在 `stopped: false` 时主动调用 `streamAbortController.value?.abort()`。

```diff
- await $fetch(`/api/employees/${employeeId.value}/chat/${activeRunId.value}/cancel`, {
-   method: "POST"
- });
+ const result = await $fetch<{ ok: boolean; data: { stopped: boolean } }>(
+   `/api/employees/${employeeId.value}/chat/${activeRunId.value}/cancel`,
+   { method: "POST" }
+ );
+ if (!result.data.stopped) {
+   streamAbortController.value?.abort();
+ }
```

---

#### BUG-3：`touchWithMessage` 存在并发竞态（潜在）

**位置**：`server/repositories/chat-session-repository.ts` → `touchWithMessage()`  
**现象**：原实现先读取 `existing.message_count` 再做加法后写入，在高并发场景（同一会话两条消息几乎同时落库）会导致 `message_count` 丢失增量，最终计数偏低。  
**根因**：`message_count = existing.message_count + increment` 为非原子读-改-写模式。  
**修复**：改为 `message_count = this.db.raw("message_count + ?", [increment])` 原子 SQL 增量。

```diff
- message_count: existing.message_count + Math.max(0, params.messageCountIncrement),
+ message_count: this.db.raw("message_count + ?", [increment]),
```

---

### 新增测试覆盖（7 个测试用例）

| 测试用例 | 验证目标 |
|----------|---------|
| BUG-1 回归：用户消息无 replyStatus | 确认用户消息无状态徽章，assistant 有 |
| BUG-3 回归：原子增量累加正确 | 多次 touchWithMessage 后 messageCount 正确 |
| BUG-3 回归：增量为 0 不变 | increment=0 时 message_count 保持不变 |
| 跨员工会话隔离 | 员工 B 无法读取员工 A 的 sessionKey |
| cancelChatRun 所有权校验 | 错误 employeeId 取消返回 stopped: false |
| 流式执行失败处理 | 引擎抛错时事件序列和 run 状态为 failed |
| 分页游标稳定性 | 13 条消息用 limit=5 三轮游标遍历无重复无遗漏 |

---

## 二、测试/验证方式

### 单元测试（全量通过）

```bash
pnpm -C packages/nextclaw-digital-employee exec vitest run \
  tests/employee-chat-service.test.ts \
  tests/chat-post-run-refresh.test.ts \
  tests/chat-optimistic-rollback.test.ts \
  tests/chat-message-groups.test.ts \
  tests/employee-run-service.test.ts
```

**结果**：33 个测试用例全部通过（原 26 + 新增 7）。

### 影响范围判定

| 改动路径 | 类型 | 是否触达构建链路 |
|---------|------|----------------|
| `server/services/employee-run-service.ts` | 业务逻辑 | 是 |
| `server/repositories/chat-session-repository.ts` | 数据访问 | 是 |
| `app/pages/employees/[id]/chat.vue` | 前端页面 | 是（UI 层） |
| `tests/employee-chat-service.test.ts` | 测试文件 | 否（仅测试） |

`build` / `lint` / `tsc`：触达代码路径，需要在部署时执行。

---

## 三、发布/部署方式

1. 本次改动属于 `packages/nextclaw-digital-employee` 平台服务，无需 NPM 发布。
2. 部署时执行常规 migration 确认（migration 文件无改动，不需新 migration）。
3. 重启平台服务即可生效。

---

## 四、用户/产品视角验收步骤

1. **BUG-1 验收**：发送一条聊天消息后，在消息列表中查看用户消息气泡，**不应出现**"已完成 / 已取消"等状态标签。
2. **BUG-2 验收**：在消息执行中途点击"取消"按钮，应立即停止 SSE 流并显示"本次对话已取消"提示；服务器端取消 API 不可用时前端也能正确中断。
3. **BUG-3 验收**：在同一会话中快速连续发送多条消息，会话列表中的"X 条消息"计数应与实际消息数一致，不出现少计。
4. **多会话验收**：新建多个会话并切换，历史消息应正确按 sessionKey 隔离展示，不出现会话串台。
5. **分页验收**：在消息较多的会话中滚动到顶部，应能继续加载更早的历史消息，不出现重复或缺失。
