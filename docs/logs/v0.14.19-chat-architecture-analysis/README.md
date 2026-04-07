# v0.14.19 — 员工聊天功能架构分析与优化规划

## 迭代完成说明

本次迭代为**分析型迭代**，对数字员工平台的聊天功能进行深度架构分析，对比 OpenClaw 上游实现，识别根因问题并制定优化路径。

---

## 分析范围

- 前端：`packages/nextclaw-digital-employee/app/pages/employees/[id]/chat.vue`
- 后端 API：`server/api/employees/[id]/chat.post.ts`、`server/api/employees/[id]/chat/history.get.ts`
- 服务层：`server/services/employee-run-service.ts`
- 引擎层：`server/engine/NextclawEngineGateway.ts`
- 会话层：`packages/nextclaw-core/src/session/manager.ts`
- 上游对比：openclaw/openclaw（UI 控制器 + 会话架构）

---

## 发现的问题

### 问题 1：只有一个固定会话（无多会话管理）

**根因**：`NextclawEngineGateway.ts:435` 中 sessionKey 硬编码：

```ts
const sessionKey = params.sessionKey ?? `employee:${params.employeeId}:ui:direct:web`;
```

每个员工只有一个固定会话，无法新建对话或查看历史不同会话。

---

### 问题 2：执行到一半终止

**根因**：整个聊天链路走普通 HTTP POST（`$fetch`），同步等待 LLM + 工具调用全部完成后才返回。

- 若 Agent 多轮工具调用耗时较长，HTTP 连接超时（Nitro/Node.js 默认约 30-120s）导致中断
- 前端虽有 `AbortController` 可手动取消，但服务端无对应中断机制，服务端任务仍在继续运行
- 用户看到的是"终止"，实际上服务端可能仍在跑

**OpenClaw 的解法**：使用 WebSocket 长连接 + 流式推送（`delta`/`final`/`aborted` 事件），无超时问题，且实时反馈进度。

---

### 问题 3：看不到以前的记录

**根因**：`history.get.ts` 调用 `gateway.getSessionHistory(...)` 从 `SessionManager` 内存读取。

- `getSessionHistory` 调用 `getIfExists`——服务器重启后 session 尚未加载到内存时返回空数组
- `getSessionHistory` 最多返回最近 50 条消息（第 492 行），超出截断
- OpenClaw 对应接口 limit 为 200 条

---

### 问题 4：每日自动清空会话（已废弃的设计）

**引入版本**：v0.14.7（`SessionManager.shouldReset`）

**当时原因**：长期对话不断累积，无重置机制，担心 LLM 上下文窗口撑满。

**现状**：
- `getHistory(session, maxMessages = 50)` 已实现截断，LLM 侧上下文有保障
- `InputBudgetPruner` 有 compaction 摘要机制（v0.14.7 同批引入）
- 每日清空对 LLM 来说是多余的，对用户来说是破坏体验的

**OpenClaw 没有每日重置机制**，验证了这个设计可以安全移除。

---

### 问题 5：会话文件存储的局限性

**现状**：`SessionManager` 将会话存为 JSONL 文件（`sessions/<safeKey>.jsonl`）：
- `addMessage` / `appendEvent` 只更新内存，不自动写磁盘
- `save()` 仅在 `archiveAndReset` 时调用，崩溃时内存数据丢失
- `writeFileSync` 全量覆盖，无文件锁，并发写有数据覆盖风险

**对比**：OpenClaw 同样用文件存储，但它是单用户本地工具，不存在并发写问题。nextclaw 平台已有 SQLite（Knex），理论上更适合将会话迁移到数据库。

**结论**：文件存储短期可接受，但平台规模增长后需迁移。

---

## OpenClaw 架构对比

| 维度 | OpenClaw | nextclaw 平台 |
|------|----------|--------------|
| 通信协议 | WebSocket 长连接 | HTTP POST 同步 |
| 流式输出 | delta/final 事件实时推送 | 无，等待全量返回 |
| 历史加载 | `chat.history` WS 请求，limit=200 | HTTP GET，limit=50 |
| 每日重置 | 无 | 有（v0.14.7 引入，可移除） |
| 会话存储 | JSONL 文件 | JSONL 文件（同） |
| 并发风险 | 无（单用户） | 有（多请求并发写） |
| 多会话 | 支持（sessions_list/sessions_send） | 不支持（固定 sessionKey） |

---

## 优化路径

### P0 — SSE 流式输出（解决"执行中断"）

将 `chat.post.ts` 改为 Server-Sent Events，按阶段推送进度：

```
event: thinking       → 正在思考
event: tool_call      → 调用工具 { name, args }
event: tool_result    → 工具返回 { name, output }
event: reply          → 最终回复 { content }
event: done           → 完成
```

前端改用 `EventSource` 或 `fetch` + `ReadableStream` 接收。无 HTTP 超时，实时反馈。

### P1 — 去掉每日重置（解决"记录消失"）

移除 `SessionManager.shouldReset` 中的跨日判断（第 88-91 行），或改为可配置项默认关闭。

保留空闲超时（4h）可选，但默认关闭。

### P2 — 修复历史加载 + 提升 limit

将 `getSessionHistory` 的 limit 从 50 提升至 200（对齐 OpenClaw）。

确保 `getIfExists` 在服务器重启后也能从磁盘正确加载。

### P3 — 多会话管理（后续规划）

后端新增：
- `GET /api/employees/:id/sessions` — 列出历史会话
- `POST /api/employees/:id/sessions` — 新建会话
- `GET /api/employees/:id/sessions/:key/messages` — 加载指定会话历史

`chat.post.ts` 接受可选 `sessionKey` 参数，支持在指定会话继续对话。

前端增加会话侧边栏，支持切换/新建。

### P4 — 会话存储迁移到数据库（长期）

在 Knex 中新增：
- `chat_sessions` 表（id, employee_id, created_at, updated_at, title）
- `chat_messages` 表（id, session_id, role, content, tool_calls, timestamp）

平台层自己管聊天持久化，`nextclaw-core` 的 `SessionManager` 继续服务 CLI 用途不变。

---

## 推荐执行顺序

| 优先级 | 方案 | 解决的问题 | 改动量 |
|--------|------|------------|--------|
| P0 | SSE 流式输出 | 执行中断、无进度反馈 | 中 |
| P1 | 去掉每日重置 | 对话记录消失 | 小 |
| P2 | 历史 limit 提升 + 加载修复 | 历史显示不完整 | 小 |
| P3 | 多会话管理 | 只有一个聊天 | 大 |
| P4 | 数据库存储 | 并发安全、可查询 | 大 |

---

## 测试/验证/验收方式

本迭代为分析型，不涉及代码改动，无需执行 build/lint/tsc 验证。

验收标准：文档已覆盖所有已发现问题的根因、OpenClaw 对比结论、以及可执行的优化路径。

## 发布/部署方式

不适用（纯文档迭代）。

## 用户/产品视角的验收步骤

1. 阅读本文档，确认问题根因分析准确
2. 按优先级选择待执行的优化项
3. 后续迭代中逐步落地并验证
