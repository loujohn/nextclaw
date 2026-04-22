# 多用户消息增强 — 设计文档

**日期**: 2026-04-21
**状态**: Implemented (2026-04-22)

> **注意**: 本文档为原始设计文档。实际实现中 `delivery_targets` 机制已被完全移除，改为由 `taskPrompt` 自然语言指定投递目标、AI 通过 `to_name`/`to_group_name` 等参数自主投递。群名解析已改为 DB 持久化（`channel_groups` 表）。详见 [实施记录](../plans/2026-04-21-multi-user-messaging.md)。
**适用范围**: `@nextclaw/core` + `packages/nextclaw-digital-employee` + `packages/extensions/nextclaw-channel-plugin-dingtalk`

---

## 设计决策摘要

| 决策项 | 选择 | 理由 |
|--------|------|------|
| AI 感知发送者 | 在每条用户消息前注入 `[发送者: 姓名 (ID:xxx, 部门/职位)]` | 群聊多人场景下，系统提示词只有一份，无法区分每条消息的发送者；逐消息注入才能让 AI 在历史上下文中区分不同用户 |
| 身份解析 | 新增 `IdentityResolver` 服务，通过 `human_employees` 表做 channel ID → 平台身份映射 | `senderStaffId` 只是渠道 ID，AI 需要知道姓名/部门/职位才能有效个性化回复 |
| 消息工具增强 | 扩展 `MessageTool`，新增 `to_name` / `to_user` / `mention` 参数 | AI 需要具备定向发送和群聊 @mention 的能力；通过姓名发送更自然，ID 发送更精确 |
| 定时任务/Webhook 投递 | DB 存储 `delivery_targets`，注入到 AI 提示词中，由 AI 使用 message 工具投递 | 比系统自动路由更灵活：AI 可以决定内容格式、是否分批发送、是否需要附加摘要 |
| 旧 hint 机制 | 删除 `channel-notification-hint.ts` | 新的 `delivery_targets` 注入机制完全取代其功能，避免双轨运行 |
| 渠道层 @mention | DingTalk `send()` 增加 `atUserIds` 传递 | DingTalk 群消息 API 原生支持 `atUserIds`/`atDingtalkIds`，需在发送时传递 |

### Codex (GPT-5.4) 审查修正

| # | 级别 | 原问题 | 修正 |
|---|------|--------|------|
| 1 | CRITICAL | MessageTool outbound 只带 `{ silent }`，缺 delivery context | 新增 `setDeliveryContext()`，透传 loop 的 `last_delivery_context` |
| 2 | HIGH | NameResolver 绑死 channel 在 engine 缓存闭包中 | NameResolver 不含 channel 参数；IdentityResolver 本期去掉 channel（DingTalk-only） |
| 3 | HIGH | DeliveryTarget 缺 accountId，无头任务回落 defaultAccountId | DeliveryTarget 新增 `accountId` 字段 |
| 4 | HIGH | 只改 ejob: 分支，heartbeat 入口不注入 delivery | 抽出 `buildScheduledPrompt()` 统一 helper |
| 5 | MEDIUM | IdentityResolver 的 channel 参数是假泛化 | 移除 channel 参数，收窄为 DingTalk-only |
| 6 | MEDIUM | mention 启发式 regex 误判姓名为 userId，静默丢弃 | 所有 mention 项统一走 NameResolver，失败返回错误 |

---

## 1. 背景与动机

当前系统作为单用户设计，存在以下限制：

1. **AI 不知道消息来自谁**：群聊中多人发消息，AI 无法区分是谁在说话
2. **AI 无法定向发送消息**：`MessageTool` 只能发到固定 chatId，不能指定收件人或 @某人
3. **无头任务（定时/Webhook）无投递目标**：执行完毕后结果无处推送
4. **渠道层缺少 @mention 支持**：DingTalk 群发消息不支持 @特定成员

### 1.1 QwenPaw/CoPaw 参考

调研 QwenPaw/CoPaw 项目（Issue #1166, PR #464, PR #489, Issue #579, PR #661, PR #943）发现的经验教训：

- **sender_id 稳定性**：CoPaw 曾错误使用 `nickname#last4(senderId)` 作为 user_id，导致身份不稳定。NextClaw 已正确使用 `senderStaffId`，无此问题
- **Session 隔离**：CoPaw 修复后的方案（私聊按 sender_id、群聊按 conversation_id）与 NextClaw 现有逻辑一致
- **@mention 需求**：CoPaw Issue #579 提出群聊回复支持 @sender，至今未实现。本设计将此纳入
- **channel_meta 完整传递**：CoPaw PR #464 修复了 cron 任务中 channel_meta 丢失的问题。本设计的 `delivery_targets` 机制从根本上解决此问题
- **Allowlist 访问控制**：CoPaw PR #661/#943 统一了多渠道访问控制。NextClaw 已有 `evaluateChannelAccessPolicy`，本期不做额外扩展

### 1.2 本期目标

1. AI 在对话中能看到每条消息的发送者身份（姓名、部门、职位）
2. AI 可以通过 `message` 工具定向发送消息给特定人员或群聊中 @特定人
3. 定时任务和 Webhook 支持配置投递目标，AI 执行后自动推送结果
4. DingTalk 渠道发送接口支持 @mention

### 1.3 本期不做

1. 不新增独立的 `contacts` 工具（YAGNI，message 工具的 `to_name` 覆盖此需求）
2. 不做消息去重/防抖（单独改进项，不纳入本设计）
3. 不做跨渠道联系人统一（本期仅实现 DingTalk）
4. 不做基于用户的细粒度 ACL 扩展

---

## 2. 身份解析服务

### 2.1 核心设计

新增 `IdentityResolver` 服务，负责将发送者 ID 映射到平台级人员身份。

**本期限定 DingTalk-only**：当前 `human_employees` 表仅由 DingTalk 组织架构同步填充，`external_id` 是 DingTalk 的 `userId`/`staffId`，全局唯一。不做多渠道 ID 命名空间隔离。接口签名不含 `channel` 参数——避免假泛化（实现上忽略 channel 但暴露泛化接口会在未来多渠道 ID 冲突时返回错误身份）。后续支持飞书/Slack 时再按 `channel + account_id + external_id` 复合键重构。

```
InboundMessage.senderId (senderStaffId)
        │
        ▼
IdentityResolver.resolve(senderId)
        │
        ▼
human_employees WHERE external_id = senderId
        │
        ▼
ResolvedIdentity { name, department, title, externalId }
```

### 2.2 类型定义

```ts
type ResolvedIdentity = {
  name: string;
  department?: string;
  title?: string;
  externalId: string;
};
```

### 2.3 文件位置

`packages/nextclaw-digital-employee/server/services/identity-resolver.ts`

### 2.4 接口设计

```ts
class IdentityResolver {
  constructor(
    private db: Knex
  ) {}

  async resolve(senderId: string): Promise<ResolvedIdentity | null>;
  async resolveByName(name: string): Promise<ResolvedIdentity[]>;
}
```

- `resolve(senderId)`：根据 `external_id` 精确查找，LEFT JOIN `departments` 获取部门名称，返回唯一结果或 null
- `resolveByName(name)`：按姓名模糊匹配（`human_employees.name LIKE %name%`），返回候选列表（用于 `MessageTool` 的 `to_name` 解析）

> 注意：接口不含 `channel` 参数（本期限定 DingTalk-only，见 2.1 节说明）

### 2.5 HumanEmployeeRepository 补充

现有 `HumanEmployeeRepository` 只有 `findByExternalIds`（批量）和 `list` 方法。`IdentityResolver` 不扩展 Repository，而是直接使用 Knex 查询（需 JOIN `departments`）：

```ts
// resolve(senderId) 内部查询
const row = await this.db('human_employees')
  .leftJoin('departments', 'human_employees.department_id', 'departments.id')
  .where('human_employees.external_id', senderId)
  .select('human_employees.name', 'human_employees.title',
          'human_employees.external_id', 'departments.name as dept_name')
  .first();
```

### 2.6 缓存策略

初期不做缓存。`human_employees` 表数据量通常在数百到数千级别，单次 SQLite 查询延迟可忽略。后续如有性能需求，可加 LRU 缓存（TTL 5 分钟）。

---

## 3. AI 感知发送者身份

### 3.1 注入方式

在 `channel-runtime.ts` 的 `handleInbound()` 方法中，接收到消息后、派发给 engine 前，调用 `IdentityResolver` 解析发送者身份，将结果注入到 `message.content` 的前缀。

### 3.2 注入格式

```
[发送者: 张三 (ID:abc123, 技术部/高级工程师)]
原始消息内容...
```

解析失败时退化：

```
[发送者: abc123]
原始消息内容...
```

### 3.3 修改点

**`channel-runtime.ts` → `handleInbound()`**

在 `enrichedMessage` 构建之前，增加身份解析和内容注入逻辑：

```ts
const identity = await this.identityResolver.resolve(message.senderId);
const senderPrefix = identity
  ? `[发送者: ${identity.name} (ID:${message.senderId}${identity.department ? `, ${identity.department}` : ''}${identity.title ? `/${identity.title}` : ''})]`
  : `[发送者: ${message.metadata.sender_name || message.senderId}]`;
const enrichedContent = `${senderPrefix}\n${message.content}`;
```

### 3.4 为什么不用系统提示词

系统提示词在一个 session 生命周期内是固定的。群聊场景中，同一个 session 内可能有多个用户发消息。如果放在系统提示词中，只能标注"当前用户"，而历史消息中的不同用户无法区分。

逐消息注入确保 AI 在查看对话历史时，能清楚知道每条消息分别来自谁。

---

## 4. 消息工具增强

### 4.1 新增参数

在 `@nextclaw/core` 的 `MessageTool` 中新增三个可选参数：

| 参数 | 类型 | 说明 |
|------|------|------|
| `to_name` | `string` | 按姓名发送。IdentityResolver 解析姓名 → 渠道 ID，多候选时返回错误提示让 AI 明确 |
| `to_user` | `string` | 按渠道用户 ID 直接发送（精确模式） |
| `mention` | `string \| string[]` | 群聊中 @mention 的用户 ID 或姓名列表 |

### 4.2 参数优先级

```
to_user > to_name > chatId/to (现有参数)
```

- 如果同时传了 `to_user` 和 `to_name`，以 `to_user` 为准
- 如果只传 `to_name`，调用 `IdentityResolver.resolveByName()` 解析
- 多候选时返回提示：`"找到多个匹配: 张三(技术部), 张三(市场部)，请用 to_user 指定 ID"`
- 零候选时返回：`"未找到名为 '张三' 的用户"`

### 4.3 MessageTool 的 Delivery Context 透传

**问题**：现有 `MessageTool.setContext(channel, chatId)` 只保存 channel/chatId，`execute()` 发送的 OutboundMessage 的 metadata 仅含 `{ silent }`。DingTalk 渠道层依赖 `peer_kind` 判断群聊/私聊（缺失默认 direct），`send()` 依赖 `account_id` 选择账号（缺失回落 defaultAccountId）。Loop 已在 `session.metadata.last_delivery_context` 保存了完整路由上下文，但未传给 MessageTool。

**解决方案**：扩展 `setContext()` 为 `setDeliveryContext()`，将 loop 保存的 `last_delivery_context` 完整透传到 MessageTool，在 `execute()` 时合并进 outbound metadata。

```ts
type DeliveryContext = Record<string, unknown>;

class MessageTool extends Tool {
  private deliveryContext: DeliveryContext = {};

  setDeliveryContext(ctx: DeliveryContext): void {
    this.deliveryContext = ctx;
  }
}
```

**Loop 侧修改**（`agent/loop.ts` `processMessage()` / `processSystemMessage()`）：

```ts
const messageTool = this.tools.get("message");
if (messageTool instanceof MessageTool) {
  // 替代旧的 setContext(channel, chatId)
  messageTool.setDeliveryContext(
    session.metadata.last_delivery_context as DeliveryContext ?? { channel: msg.channel, chatId: msg.chatId }
  );
}
```

**execute() 中合并 metadata**：

```ts
const baseMetadata: Record<string, unknown> = {
  ...this.deliveryContext.metadata,
  ...(silent !== undefined ? { silent } : {})
};
```

这确保 outbound message 携带完整的 `account_id`、`peer_kind`、`conversation_id` 等路由字段，DingTalk 渠道层能正确判断群聊/私聊并选对账号。

### 4.4 MessageTool 的 NameResolver 注入

`MessageTool` 属于 `@nextclaw/core`，不应直接依赖 `nextclaw-digital-employee` 的 `IdentityResolver`。通过回调注入：

```ts
type NameResolveResult =
  | { kind: "found"; userId: string; displayName: string }
  | { kind: "ambiguous"; candidates: Array<{ userId: string; displayName: string; hint: string }> }
  | { kind: "not_found" };

type NameResolver = (name: string) => Promise<NameResolveResult>;

class MessageTool extends Tool {
  private nameResolver?: NameResolver;

  setNameResolver(resolver: NameResolver): void {
    this.nameResolver = resolver;
  }
}
```

**注入时机**：`NameResolver` 在 loop 层的 `processMessage()` / `processSystemMessage()` 中随 `setDeliveryContext()` 一起注入。由于 engine 按 `agentId|workspace|model|env|cron` 缓存复用，NameResolver **不能在 engine 创建时绑定固定的 channel**。改为在每次消息处理时动态注入：

```ts
const messageTool = this.tools.get("message");
if (messageTool instanceof MessageTool) {
  messageTool.setDeliveryContext(deliveryCtx);
  messageTool.setNameResolver(
    createNameResolverFromIdentity(identityResolver)  // 不绑定 channel
  );
}
```

其中 `createNameResolverFromIdentity` 不再接受 `channel` 参数，因为当前实现是全局 external_id 查表（见 2.1 节）。

### 4.5 OutboundMessage 扩展

`@nextclaw/core` 的 `OutboundMessage` 类型在 `metadata` 中增加可选字段：

```ts
type OutboundMessage = {
  channel: string;
  chatId: string;
  content: string;
  replyTo?: string | null;
  media: string[];
  metadata: Record<string, unknown> & {
    mention_user_ids?: string[];
    target_user_id?: string;
  };
};
```

- `mention_user_ids`：群消息中需要 @的用户 ID 列表
- `target_user_id`：定向私发时的目标用户 ID（覆盖 chatId 语义）

### 4.6 execute() 逻辑变更

```
1. 从 deliveryContext 中提取 channel/chatId 作为默认值
2. 解析 to_user / to_name → 确定 targetUserId
3. 如果有 targetUserId：
   a. 将 targetUserId 放入 metadata.target_user_id
   b. chatId = targetUserId（切换为私聊投递）
4. 解析 mention → 确定 mentionUserIds
   a. 所有 mention 项统一走 NameResolver 解析
   b. 如果 NameResolver 返回 not_found 或 ambiguous，
      直接返回错误给 AI（不静默丢弃）
   c. 解析成功的 userId 放入 metadata.mention_user_ids
5. 合并 deliveryContext.metadata 到 outbound metadata
6. 构造 OutboundMessage 并调用 sendCallback
```

> **mention 解析的重要变更**：不使用启发式正则判断 mention 值是 userId 还是姓名。所有 mention 项一律先通过 NameResolver 解析。如果某项确实是已知 userId（resolver 通过 external_id 精确匹配也能命中），resolver 自然会返回 found。如果是姓名，resolver 做模糊匹配。失败时返回明确错误信息让 AI 重新指定，避免"AI 以为 @ 成功但实际没有 mention"的静默失败。

---

## 5. DingTalk 渠道层 @mention 支持

### 5.1 发送接口改造

**`packages/extensions/nextclaw-channel-plugin-dingtalk/src/channel.ts` → `send()`**

当前群消息发送 payload：

```ts
{
  robotCode,
  openConversationId: target.targetId,
  msgKey: "sampleMarkdown",
  msgParam: JSON.stringify({ title, text })
}
```

需要增加 `atUserIds` / `atDingtalkIds`：

```ts
const mentionIds = Array.isArray(msg.metadata.mention_user_ids)
  ? msg.metadata.mention_user_ids.filter(Boolean)
  : [];

const payload = {
  robotCode,
  openConversationId: target.targetId,
  msgKey: "sampleMarkdown",
  msgParam: JSON.stringify({ title, text }),
  ...(mentionIds.length > 0 && { atDingtalkIds: mentionIds })
};
```

### 5.2 resolveOutboundTarget 增强

当 `metadata.target_user_id` 存在时，优先使用其作为私聊发送目标：

```ts
if (msg.metadata.target_user_id) {
  return {
    kind: "direct",
    targetId: String(msg.metadata.target_user_id)
  };
}
```

---

## 6. 定时任务 / Webhook 的投递目标

### 6.1 数据模型

#### `employee_schedule_jobs` 表新增字段

```sql
ALTER TABLE employee_schedule_jobs
ADD COLUMN delivery_targets TEXT NOT NULL DEFAULT '';
```

`delivery_targets` 为 JSON 字符串，格式：

```json
[
  { "channel": "dingtalk", "kind": "direct", "userId": "abc123", "name": "张三", "accountId": "default" },
  { "channel": "dingtalk", "kind": "group", "chatId": "cid123", "mentionUserIds": ["abc123"], "accountId": "default" }
]
```

#### `employees` 表新增字段（用于 Webhook）

```sql
ALTER TABLE employees
ADD COLUMN delivery_targets TEXT NOT NULL DEFAULT '';
```

### 6.2 TypeScript 类型

```ts
type DeliveryTarget = {
  channel: string;
  kind: "direct" | "group";
  userId?: string;
  chatId?: string;
  name?: string;
  mentionUserIds?: string[];
  accountId?: string;  // 多账号场景下指定目标账号，缺省时使用 defaultAccountId
};
```

> **accountId 的必要性**：无头任务（定时/Webhook）通过 `runEmployeeTurn()` 进入时 `channel: "ui"`，没有入站消息元数据。如果 `DeliveryTarget` 不携带 `accountId`，AI 调用 `message(channel:"dingtalk")` 时 outbound 只能回落到 `defaultAccountId`。多 DingTalk 账号部署时会投递到错误账号。`buildDeliveryInstruction()` 需将 `accountId` 写入指令文本。

### 6.3 投递指令注入

**统一 helper**：系统中定时执行入口不止 `cronService.onJob` 的 `ejob:` 分支，还有 `startJobHeartbeat()`（heartbeat 类型 job）以及 legacy 分支。为避免分裂行为，抽出统一的 prompt 构建函数：

```ts
// automation-service.ts 内部 helper
function buildScheduledPrompt(
  taskPrompt: string | undefined,
  employeePrompt: string,
  deliveryTargetsJson: string
): string {
  let message = taskPrompt?.trim()
    ? taskPrompt
    : `${employeePrompt}\n\n请按你的职责执行一次定时任务，并输出当前最新摘要。`;
  const targets = parseDeliveryTargets(deliveryTargetsJson);
  if (targets.length > 0) {
    message += buildDeliveryInstruction(targets);
  }
  return message;
}
```

所有定时入口均走此 helper：

- **`ejob:` 分支** → `buildScheduledPrompt(schedJob.taskPrompt, employee.systemPrompt, schedJob.deliveryTargets)`
- **`startJobHeartbeat()`** → 需额外传入 job 的 `deliveryTargets`，在 HeartbeatService 的 prompt 回调中调用 helper
- **legacy `employee:` / `agentId` 分支** → 这些已标记 @deprecated，不注入 delivery_targets，但不会导致错误（只是无投递行为）

`buildDeliveryInstruction()` 生成格式：

```
---
[投递指令] 任务完成后，请使用 message 工具将结果发送到以下目标：
- 私聊发送给 张三 (to_user: abc123, channel: dingtalk, accountId: default)
- 群聊 cid123 并 @张三 (chatId: cid123, channel: dingtalk, mention: abc123, accountId: default)
```

> **MessageTool execute() 中的 accountId 处理**：当 AI 按投递指令调用 `message(channel:"dingtalk", accountId:"default", ...)`，MessageTool 需将 `accountId` 写入 outbound metadata（合并进 deliveryContext），确保 DingTalk `send()` 选对账号。

### 6.4 Webhook 投递

在 `[code].post.ts` 中，查询 employee 的 `delivery_targets`，附加到 message 中：

```ts
const deliveryTargets = parseDeliveryTargets(employee.deliveryTargets);
let webhookMessage = `你收到了一个外部 Webhook 请求...`;
if (deliveryTargets.length > 0) {
  webhookMessage += buildDeliveryInstruction(deliveryTargets);
}
```

### 6.5 删除 channel-notification-hint.ts

`server/utils/channel-notification-hint.ts` 的功能被新的 `delivery_targets` + `buildDeliveryInstruction()` 完全替代。删除该文件并清理所有引用。

---

## 7. 代码结构与变更清单

### 7.1 新增文件

| 文件 | 职责 |
|------|------|
| `server/services/identity-resolver.ts` | 发送者 ID → 平台身份映射（本期 DingTalk-only） |
| `server/utils/delivery-instruction.ts` | `buildDeliveryInstruction()` / `parseDeliveryTargets()` 工具函数 |

### 7.2 修改文件

| 文件 | 变更 |
|------|------|
| `@nextclaw/core` `agent/tools/message.ts` | 新增 `to_name` / `to_user` / `mention` 参数，`setDeliveryContext()` + `setNameResolver()` 注入点 |
| `@nextclaw/core` `bus/events.ts` | `OutboundMessage.metadata` 增加 `mention_user_ids` / `target_user_id` 类型标注 |
| `server/runtime/channel-runtime.ts` | `handleInbound()` 增加身份解析和发送者前缀注入 |
| `server/services/automation-service.ts` | `onJob` 回调中增加 `delivery_targets` 解析和指令注入 |
| `server/api/webhooks/e/[code].post.ts` | 增加 employee `delivery_targets` 解析和指令注入 |
| `server/db/schema.ts` | `EmployeeScheduleJobRecord` 新增 `delivery_targets` 字段 |
| `dingtalk/src/channel.ts` | `send()` 增加 `atDingtalkIds` 传递 |
| `dingtalk/src/message-normalizer.ts` | `resolveOutboundTarget()` 支持 `target_user_id` |

### 7.3 删除文件

| 文件 | 原因 |
|------|------|
| `server/utils/channel-notification-hint.ts` | 被 `delivery-instruction.ts` 取代 |

---

## 8. 数据流全景

### 8.1 渠道消息流（群聊场景）

```
DingTalk 群消息 (senderStaffId=abc123, conversationId=cid456)
    │
    ▼
DingTalkChannel.handleRobotMessage()
    │  normalizeInboundDingTalkMessage() → metadata.sender_staff_id = abc123
    ▼
MessageBus → ChannelRuntime.handleInbound()
    │  IdentityResolver.resolve("abc123")
    │  → { name: "张三", department: "技术部", title: "高级工程师" }
    │  注入: "[发送者: 张三 (ID:abc123, 技术部/高级工程师)]\n原消息"
    ▼
Engine.handleInbound() → AI 看到带发送者标注的消息
    │
    ▼
AI 调用 message(to_name:"李四", content:"...", mention:["abc123"])
    │  NameResolver("李四") → { userId: "def789" }
    │
    ▼
OutboundMessage {
  channel: "dingtalk", chatId: "cid456",
  content: "...",
  metadata: { mention_user_ids: ["abc123"], target_user_id: "def789" }
}
    │
    ▼
DingTalkChannel.send() → API 调用含 atDingtalkIds
```

### 8.2 定时任务投递流

```
CronService 触发 ejob:{jobId}
    │
    ▼
AutomationService.onJob()
    │  读取 schedJob.deliveryTargets
    │  buildDeliveryInstruction(targets)
    │  message = taskPrompt + 投递指令
    ▼
EmployeeRunService.runEmployeeTurn({ message })
    │
    ▼
AI 执行任务 → 读取投递指令 → 调用 message(to_user:"abc123", content:"任务报告...")
    │
    ▼
OutboundMessage → DingTalkChannel.send()
```

---

## 9. API 变更

### 9.1 定时任务 API

现有的定时任务 CRUD API 需要在 create/update 接口中支持 `deliveryTargets` 字段。

**`POST /api/employees/:id/schedule-jobs`** — 新增 `deliveryTargets` 可选字段
**`PUT /api/employees/:id/schedule-jobs/:jobId`** — 同上

请求体扩展：

```json
{
  "name": "日报汇总",
  "scheduleKind": "cron",
  "cronExpr": "0 18 * * 1-5",
  "taskPrompt": "生成今日工作日报...",
  "deliveryTargets": [
    { "channel": "dingtalk", "kind": "direct", "userId": "abc123", "name": "张三" }
  ]
}
```

### 9.2 员工 API

**`PUT /api/employees/:id`** — 新增 `deliveryTargets` 可选字段（用于 Webhook 投递配置）

### 9.3 schedule 工具

`platform-schedule-tool.ts` 的 `create` / `update` action 新增 `delivery_targets` 参数，让 AI 也能在对话中配置投递目标。

---

## 10. 错误处理

| 场景 | 行为 |
|------|------|
| IdentityResolver 解析失败（无匹配） | 降级：使用 senderId / senderNick 作为发送者标注 |
| to_name 多候选 | 返回候选列表给 AI，提示使用 to_user 精确指定 |
| to_name 零候选 | 返回错误信息给 AI："未找到名为 'xxx' 的用户" |
| mention 解析失败（not_found / ambiguous） | 返回错误信息给 AI，不静默丢弃。AI 可重新指定更精确的名字或用 userId |
| DingTalk @mention 发送失败 | 降级为普通群消息（不含 @），记录警告日志 |
| delivery_targets JSON 解析失败 | 跳过投递指令注入，记录警告日志，任务正常执行 |

---

## 11. 验收标准

### 11.1 功能验收

1. 群聊中不同用户发消息，AI 回复能正确称呼发送者
2. AI 能通过 `message(to_name:"张三", content:"...")` 成功发送私聊消息
3. AI 能在群聊回复中 @特定用户
4. 定时任务配置了 `deliveryTargets` 后，执行结果能自动推送到指定目标
5. Webhook 触发后，结果能按 employee 的 `deliveryTargets` 配置推送
6. 旧的 `channel-notification-hint` 逻辑被完全移除

### 11.2 回归关注点

1. 私聊场景不受影响（发送者注入仍正常工作）
2. 未配置 `deliveryTargets` 的定时任务/Webhook 行为不变
3. 现有的 message 工具基本功能（chatId/to）不受影响
4. DingTalk 渠道连接、重连、健康检查不受影响

---

## 12. 实施建议

建议按以下顺序实现：

1. **IdentityResolver 服务** — 纯查询服务（DingTalk-only），无副作用，可独立开发和测试
2. **渠道消息发送者注入** — 修改 `channel-runtime.ts`，依赖 IdentityResolver
3. **MessageTool delivery context 透传** — 修改 `@nextclaw/core`，新增 `setDeliveryContext()`，Loop 层透传 `last_delivery_context`
4. **MessageTool 功能增强** — 新增 `to_name`/`to_user`/`mention` + `setNameResolver()`，mention 全部走 resolver（不用启发式）
5. **DingTalk 渠道 @mention** — 修改 `channel.ts` 和 `message-normalizer.ts`
6. **delivery_targets 数据库迁移** — `employee_schedule_jobs` + `employees` 表，类型含 `accountId`
7. **投递指令注入（统一 helper）** — 新增 `delivery-instruction.ts`，抽出 `buildScheduledPrompt()` helper，所有 scheduled 入口（ejob + heartbeat）统一走它
8. **删除 channel-notification-hint.ts** — 清理旧逻辑
9. **API 层支持** — 定时任务和员工 API 增加 deliveryTargets 字段
