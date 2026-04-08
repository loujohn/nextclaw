# 数字员工聊天架构治理设计文档

> **日期**: 2026-04-08
> **状态**: Draft
> **目标**: 重审聊天架构治理方案，收敛为面向当前代码现实的可落地设计
> **范围说明**: 本文处理问题 1 / 2 / 3 / 5；不处理问题 4（每日自动清空会话）；不处理改造前旧历史的迁移

---

## 一、背景

`docs/logs/v0.14.19-chat-architecture-analysis/README.md` 已确认当前数字员工聊天链路存在以下治理方向：

1. **只有一个固定会话**：当前 UI 聊天仍绑定固定 session
2. **执行到一半终止**：当前聊天链路仍以同步整包返回为主
3. **看不到以前的记录**：历史读取没有形成统一的按 session 查询契约
4. **聊天持久化能力不足**：虽然平台已有数据库，但聊天历史尚未落到数据库模型中

本次重审后，文档不再追求覆盖所有可能演进路径，而是围绕以下三条主线收敛：

1. **显式 `sessionKey`**
2. **SSE 流式执行 + 服务端取消**
3. **按 `sessionKey` 统一读取历史，并将聊天历史持久化到数据库**

---

## 二、设计目标

### 2.1 目标

1. **支持多会话**：同一员工下可创建、切换、继续多个聊天线程
2. **支持流式执行**：聊天过程持续反馈，不再同步阻塞等待完整结果
3. **统一历史读取**：历史查询统一按 `sessionKey` 执行，不依赖内存中是否已有 session 实例
4. **建立聊天数据库模型**：新增会话与消息表，保证多会话、历史、分页能力可稳定实现
5. **复用现有运行态数据库**：继续使用已有 `run_records / run_events` 承载 run 状态与事件

### 2.2 非目标

1. **不保留同步版聊天设计作为文档主线**
2. **不在本阶段引入 WebSocket 总线**
3. **不迁移改造前的旧 JSONL/内存历史**
4. **不直接重写 `nextclaw-core` 的通用 SessionManager 机制**

---

## 三、现状问题拆解

| 问题 | 当前现象 | 代码现状 | 架构后果 |
|------|----------|----------|----------|
| 问题 1：固定会话 | UI 聊天没有真正多会话入口 | `history.get.ts` 固定读取 `employee:${employeeId}:ui:direct:web` | 无法按指定会话稳定查看与继续对话 |
| 问题 2：同步执行 | 聊天提交后等待整包结果 | `chat.post.ts` + `EmployeeRunService.runEmployeeTurn()` 仍走同步返回 | 长耗时下无持续反馈，取消语义不完整 |
| 问题 3：历史不统一 | 历史读取没有面向产品的统一查询契约 | `NextclawEngineGateway.getSessionHistory()` 直接包裹 `SessionManager.getIfExists()`，且固定截断最近 50 条 | 历史展示依赖运行时缓存能力，不是产品级历史能力 |
| 问题 5：聊天未入库 | 平台已有数据库，但聊天消息未形成数据库表 | 已有 `run_records / run_events`，但缺少 `chat_sessions / chat_messages` | 多会话、分页、重启恢复缺少稳定存储基础 |

---

## 四、总体方案

推荐将聊天系统收敛为“**session 驱动 + run 驱动 + 聊天入库**”架构。

### 4.1 三条主线

1. **会话主线**
   - 前后端围绕显式 `sessionKey` 建模
   - 不再依赖固定默认会话

2. **执行主线**
   - 每次发送创建一个 `chat run`
   - 执行结果通过 SSE 持续推送
   - 取消由服务端 `runId` 级接口负责

3. **历史主线**
   - 历史接口统一按 `employeeId + sessionKey` 查询
   - 聊天消息落入数据库
   - `SessionManager` 仅保留为运行期上下文/兼容层，不再作为历史接口主来源

### 4.2 目标领域模型

| 对象 | 含义 | 关键字段 |
|------|------|----------|
| `employee` | 数字员工主体 | `id` |
| `chat_session` | 员工下的一条对话线程 | `id`, `employeeId`, `sessionKey`, `title`, `preview`, `createdAt`, `updatedAt` |
| `chat_message` | 会话中的一条消息 | `id`, `sessionId`, `role`, `content`, `metadata`, `createdAt` |
| `chat_run` | 一次用户发送触发的执行过程 | 近期直接复用 `run_records` / `run_events` |

### 4.3 设计原则

1. **统一查询契约优先于内部恢复过程**
2. **数据库主来源优先于内存偶然命中**
3. **单一路径流式执行优先于同步/流式双轨文档设计**
4. **只写当前必须落地的设计，不把未来演进路径展开成正文主线**

---

## 五、问题 1：多会话管理设计

### 5.1 目标

让“员工聊天”升级为“员工下的多会话线程”，支持：

1. 新建会话
2. 切换会话
3. 加载指定会话历史
4. 在指定会话继续发送

### 5.2 接口设计

#### `GET /api/employees/:id/sessions`

返回该员工下的会话列表：

```typescript
type ChatSessionListItem = {
  sessionKey: string;
  title: string;
  preview: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
};
```

#### `POST /api/employees/:id/sessions`

创建新会话：

```typescript
type CreateSessionResponse = {
  sessionKey: string;
  title: string;
  createdAt: string;
};
```

#### `GET /api/employees/:id/sessions/:key/messages`

按会话读取消息，支持分页：

```typescript
type SessionMessagesResponse = {
  sessionKey: string;
  items: Array<{
    id: string;
    role: "user" | "assistant" | "tool" | "system";
    content: string;
    metadata?: Record<string, unknown>;
    createdAt: string;
  }>;
  nextCursor: string | null;
};
```

#### `POST /api/employees/:id/chat`

发送消息时接受显式 `sessionKey`：

```typescript
type ChatRequest = {
  message: string;
  sessionKey?: string;
};
```

行为约束：

1. 若传入 `sessionKey`，则在该会话继续执行
2. 若未传入 `sessionKey`，服务端创建新会话并返回新 key
3. 会话必须归属于当前员工，不允许跨员工复用

### 5.3 前端交互

聊天页新增会话侧边栏，至少包含：

1. **新建对话**
2. **会话列表**
3. **当前会话高亮**
4. **切换后加载该会话消息**

页面初始化流程：

1. 加载员工详情
2. 加载会话列表
3. 若列表为空，自动创建首条会话
4. 默认选中最近更新的会话
5. 加载该会话消息

### 5.4 标题策略

会话标题建议优先采用：

1. 首条用户消息截断生成
2. 若为空则显示“新对话”

本阶段不引入额外模型生成标题。

### 5.5 验收结果

1. 同一员工可存在多条会话
2. 前端可稳定切换会话
3. 发送消息不再默认落到唯一固定会话

---

## 六、问题 2：流式执行与取消设计

### 6.1 目标

将聊天执行从同步整包返回升级为流式交互，解决：

1. 长执行时间下的等待焦虑
2. “前端终止但服务端仍在执行”的语义割裂
3. 工具调用过程不可见的问题

### 6.2 协议选择

本阶段推荐 **SSE（Server-Sent Events）**。

选择原因：

1. 当前主要是服务端单向推送
2. 接入成本低于 WebSocket
3. 足以覆盖回复增量、工具事件、完成事件、失败事件、取消事件

### 6.3 事件协议

建议采用以下事件：

| event | payload | 说明 |
|------|---------|------|
| `run_started` | `{ runId, sessionKey }` | 本次执行开始 |
| `thinking` | `{ runId }` | Agent 正在思考 |
| `tool_call` | `{ runId, name, args }` | 工具开始调用 |
| `tool_result` | `{ runId, name, output }` | 工具返回结果 |
| `reply_delta` | `{ runId, delta }` | 回复文本增量 |
| `reply_final` | `{ runId, content }` | 回复最终文本 |
| `run_failed` | `{ runId, message }` | 执行失败 |
| `run_aborted` | `{ runId, reason }` | 执行被取消 |
| `done` | `{ runId, sessionKey }` | 事件流结束 |

### 6.4 运行态建模

每次用户发送都创建一个 run，并继续使用现有 `run_records / run_events` 持久化运行状态。

状态机建议如下：

```text
created -> running -> completed
                 \-> aborted
                 \-> failed
                 \-> interrupted
```

其中：

1. `interrupted` 继续保留给服务重启或异常中断恢复场景
2. `aborted` 用于用户主动取消
3. `completed / failed` 对应正常结束与异常结束

### 6.5 取消机制

建议新增：

#### `POST /api/employees/:id/chat/:runId/cancel`

行为：

1. 标记目标 run 为取消中
2. 将取消信号传递给 engine 层
3. SSE 流返回 `run_aborted`
4. 前端将当前气泡标记为“已取消”

### 6.6 Service / Gateway 改造方向

文档不再设计“同步版 + 流式版”双轨方案，本节只保留单一路径流式执行能力：

1. `chat.post.ts` 不再以“等待完整结果后返回最终消息”为目标形态
2. `EmployeeRunService` 负责 run 建立、事件转发、完成态回写
3. `NextclawEngineGateway` 负责向上抛出增量事件、工具事件与取消信号处理
4. 如存在内部共享逻辑，可在实现层复用，但文档层不承诺同步接口继续演进

### 6.7 验收结果

1. 长时间执行过程中页面持续有反馈
2. 工具调用过程可见
3. 取消动作可终止服务端执行
4. run 状态可在数据库中稳定查询

---

## 七、问题 3：历史读取与分页设计

### 7.1 目标

确保聊天历史具备如下能力：

1. 服务重启后可读取历史
2. 历史查询统一按 `sessionKey` 执行
3. 首屏加载快，长历史可继续翻页

### 7.2 历史读取策略

历史读取统一定义为：

1. 前端提供 `sessionKey`
2. 服务端按 `employeeId + sessionKey` 查询会话
3. 服务端按会话分页读取消息
4. 接口对前端保持统一响应，不暴露内存命中、恢复加载等内部细节

本节不再写“若 session 已在内存则直接读取，否则先恢复再读取”。

### 7.3 分页策略

不建议仅把固定 `limit` 从 50 提高到 200。

推荐方案：

1. 默认首屏读取最近 50 或 100 条
2. 支持 `before` / `cursor` 分页读取更早记录
3. 会话列表单独返回 preview，不依赖全量消息

接口示例：

```typescript
GET /api/employees/:id/sessions/:key/messages?limit=100&before=cursor
```

### 7.4 当前后端需要调整的方向

当前代码需明确调整以下点：

1. `history.get.ts` 不能再固定读取 `employee:${employeeId}:ui:direct:web`
2. 历史接口必须显式接受 `sessionKey`
3. `NextclawEngineGateway.getSessionHistory()` 不能继续承担产品级历史接口职责
4. 固定最近 50 条的内存历史读取逻辑应降级为运行期兼容能力，而不是历史主查询路径

### 7.5 列表与消息分离

建议将“会话列表”和“消息历史”拆成两个接口与两条查询路径：

1. **会话列表**
   - 返回标题、最后更新时间、摘要、消息数量
   - 只读会话级元信息

2. **消息历史**
   - 返回指定会话的分页消息
   - 只读消息级内容

### 7.6 验收结果

1. 历史接口统一按 `sessionKey` 查询
2. 历史接口不依赖 session 是否已在内存中存在
3. 长历史可分页查看，不再被固定上限严重截断

---

## 八、问题 5：聊天持久化与数据库设计

### 8.1 目标

在保留现有 `run_records / run_events` 的前提下，为聊天建立数据库持久化能力，解决：

1. 多会话缺少稳定主存储
2. 历史查询无法形成统一数据库路径
3. 分页、重启恢复、会话列表缺少明确数据模型

### 8.2 基本原则

1. **承认现有数据库已存在**
   - 当前数据库继续承载 run 记录与 run 事件

2. **新增聊天专用表**
   - 以数据库承载会话元信息与消息历史

3. **不迁移改造前旧历史**
   - 旧 JSONL/内存历史不纳入本轮迁移范围
   - 新能力发布后，新的聊天会话与消息以数据库为准

### 8.3 表设计

#### `chat_sessions`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 主键 |
| `employee_id` | string | 所属员工 |
| `session_key` | string | 外部会话标识 |
| `title` | string | 会话标题 |
| `preview` | string | 最近摘要 |
| `message_count` | integer | 消息数 |
| `created_at` | datetime | 创建时间 |
| `updated_at` | datetime | 更新时间 |

约束：

1. `(employee_id, session_key)` 唯一
2. `employee_id + updated_at` 建索引，便于按最近更新时间列出

#### `chat_messages`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 主键 |
| `session_id` | string | 所属会话 |
| `role` | string | user / assistant / tool / system |
| `content` | text | 消息内容 |
| `tool_name` | string nullable | 工具消息名 |
| `tool_call_id` | string nullable | 工具调用 ID |
| `metadata_json` | json nullable | 扩展字段，如 toolCalls / reasoning |
| `created_at` | datetime | 创建时间 |

约束：

1. `session_id + created_at` 建索引，支持分页

### 8.4 与现有 run 表的关系

现有 `run_records / run_events` 继续保留。

建议新增一项优化：

1. **为 `run_records` 增加显式 `session_key` 字段**
   - 避免通过 `result_json.sessionKey` 间接取值
   - 方便取消、查询最近 run、按会话追踪执行过程

若本轮不改表结构，至少也应保证：

1. run 完成结果中稳定写入 `sessionKey`
2. run 事件与聊天会话可通过 `runId + sessionKey` 稳定关联

### 8.5 写入流程

推荐写入路径：

1. 创建或确认 `chat_session`
2. 写入用户消息到 `chat_messages`
3. 创建 `run_record`
4. 执行过程中持续写入 `run_events`
5. 完成后写入 assistant/tool 消息到 `chat_messages`
6. 更新 `chat_sessions.preview / updated_at / message_count`
7. 将 `run_record` 更新为完成、失败或取消状态

### 8.6 读取流程

会话列表读取：

1. 查询 `chat_sessions`
2. 按 `updated_at` 倒序返回

消息历史读取：

1. 先按 `employee_id + session_key` 定位 `chat_session`
2. 再按 `session_id` 查询 `chat_messages`
3. 通过 `created_at + id` 实现稳定分页

### 8.7 验收结果

1. 聊天历史具备数据库主存储
2. 会话列表与消息历史均可通过数据库稳定查询
3. run 记录与聊天会话具备稳定关联方式
4. 不要求处理改造前旧历史迁移

---

## 九、推荐落地顺序

### Phase A：聊天数据库与会话契约先行

范围：

1. 新增 `chat_sessions / chat_messages`
2. 聊天接口显式引入 `sessionKey`
3. 会话列表与消息历史接口落地

价值：

1. 为多会话与统一历史查询建立真正的数据基础
2. 先解掉“固定会话 + 查不到历史”的根问题

### Phase B：流式执行与取消

范围：

1. SSE 事件流
2. `runId` 与状态流转
3. 服务端取消能力
4. 前端流式渲染

价值：

1. 解决“执行中断”和“无反馈”问题
2. 复用现有 `run_records / run_events`，改造收益高

### Phase C：运行期兼容层收敛

范围：

1. 明确 `SessionManager` 仅用于运行期上下文
2. 将产品级历史读取彻底切到数据库路径
3. 清理固定 50 条窗口与固定 UI session 假设

价值：

1. 消除历史接口与运行期缓存职责混淆
2. 避免后续多源读取带来的维护复杂度

---

## 十、兼容性与风险

| 风险 | 说明 | 应对 |
|------|------|------|
| SSE 中间层超时 | 网关或代理层可能有超时/缓冲策略 | 部署前验证 Nginx / 网关配置 |
| 聊天表与 run 表双写一致性 | 一次 run 可能同时写聊天表和 run 表 | 先固化写入顺序，失败时保证状态可追踪 |
| sessionKey 归属错误 | 会话可能被跨员工误用 | 强制按 `employee_id + session_key` 校验 |
| 运行期缓存与数据库结果不一致 | 运行中内存态与落库历史可能短时偏差 | 明确数据库是历史主来源，缓存只用于执行期 |

---

## 十一、不做什么

1. **不保留同步版聊天方案作为正式设计目标**
2. **不在本方案中引入 WebSocket 聊天总线**
3. **不迁移改造前的旧历史**
4. **不把 `SessionManager` 包装成产品级历史主存储**
5. **不在本阶段引入复杂标题生成或历史摘要生成**

---

## 十二、验收标准

1. 同一员工可创建并切换多条会话
2. 聊天发送与历史读取都显式围绕 `sessionKey`
3. 新产生的聊天历史可在数据库中稳定读取
4. 历史接口支持分页，不再依赖固定 50 条窗口
5. 聊天回复可流式显示，长执行过程中持续有反馈
6. 用户取消后服务端执行可被中止，并返回明确状态
7. `run_records / run_events` 与聊天会话具备稳定关联方式

---

## 十三、最终结论

本次重审后的核心结论如下：

1. **第六章不再保留同步版设计**，聊天执行只保留流式主路径
2. **第七章直接确立“按 `sessionKey` 统一查历史”**，不再把内存命中/恢复过程写成设计主线
3. **第八章明确“现有数据库已存在 + 新增聊天会话/消息表”**，用数据库保障多会话、历史、分页能力
4. **不处理改造前旧历史迁移**，避免本轮方案失焦

因此，本方案不再是一份铺陈过多未来演进可能性的文档，而是一份面向当前代码整改的治理设计：

- 用 `sessionKey` 解决固定会话问题
- 用 SSE + cancel 解决执行体验问题
- 用聊天入库解决统一历史与分页问题
- 用现有 run 表延续运行态可观测性
