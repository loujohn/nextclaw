# 多用户消息增强 — 实施记录

**Goal:** 让数字员工 AI 能识别消息发送者身份、定向发送消息给特定用户/群组、在群聊中 @mention，并支持通过群名解析简化群消息发送。

**状态**: ✅ 已完成 (2026-04-22)

---

## 架构概览

### 核心能力

| 能力 | 实现方式 |
|------|---------|
| AI 感知发送者 | `channel-runtime` 入站消息前注入 `[发送者: 姓名 (ID:xxx, 部门/职位)]` 前缀 |
| 按姓名私聊发送 | `MessageTool` 的 `to_name` 参数 → `NameResolver` → `IdentityResolver.resolveByName()` |
| 按 ID 私聊发送 | `MessageTool` 的 `to_user` 参数 |
| 按群名发群消息 | `MessageTool` 的 `to_group_name` 参数 → `GroupNameResolver` → `IdentityResolver.resolveGroupByName()` (DB) |
| 按群 ID 发群消息 | `MessageTool` 的 `to_group` 参数 |
| 群消息 @mention | `MessageTool` 的 `mention` 参数 → `NameResolver` 解析 → DingTalk 消息内嵌 `@姓名`（仅视觉效果，无推送通知） |
| 多账号支持 | `MessageTool` 的 `account_id` 参数 + `AccountIdResolver` 自动推断 |
| 定时任务/Webhook 投递 | 完全由 `taskPrompt` 提示词决定，AI 通过 `message` 工具自主投递（不再重复注入 systemPrompt） |

### 关键设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| delivery_targets | **已移除** | 过度复杂；AI 可通过 `to_name`/`to_group_name` 等参数自行投递，投递目标由 taskPrompt 或 skill 提示词指定即可 |
| 群名解析 | DB 持久化（`channel_groups` 表） | 重启不丢失；比内存缓存可靠 |
| DingTalk @mention 通知 | 仅视觉 `@姓名`，无推送通知 | `/v1.0/robot/groupMessages/send` API 不支持原生 @通知；需 `sessionWebhook` 才可，但该 URL 临时且绑定入站消息 |
| 定时任务 prompt | 不再重复注入 systemPrompt | Engine 已通过 workspace 的 `agent.md` 加载了系统提示词，无需在用户消息中再次包含 |
| 日期格式 | 使用 `dbNow()` 而非 `toISOString()` | 达梦数据库不接受 ISO 8601 格式（含 `T` 和 `Z`），需使用 `YYYY-MM-DD HH:mm:ss` 格式 |

---

## 文件结构

### 核心包 (`@nextclaw/core`)

| 文件 | 职责 |
|------|------|
| `src/agent/tools/message.ts` | MessageTool：`to_name`/`to_user`/`to_group`/`to_group_name`/`mention`/`account_id` 参数；`NameResolver`/`GroupNameResolver`/`AccountIdResolver` 回调 |
| `src/agent/loop.ts` | AgentLoop：注入 `nameResolver`/`groupNameResolver`/`knownChannels`/`accountIdResolver` |
| `src/engine/types.ts` | `AgentEngineFactoryContext` 包含上述 resolver |
| `src/index.ts` | 导出 `GroupNameResolver`/`GroupNameResolveResult`/`NameResolver`/`NameResolveResult` 等类型 |

### 数字员工包 (`@nextclaw/digital-employee`)

| 文件 | 职责 |
|------|------|
| `server/services/identity-resolver.ts` | 身份解析 + 群名 DB 缓存（`registerGroup`/`resolveGroupByName`/`listKnownGroups`/`resolve`/`resolveByName`/`resolveByInternalId`） |
| `server/runtime/channel-runtime.ts` | 入站消息注入发送者前缀 + 自动注册群名到 DB |
| `server/runtime/platform-context.ts` | 连线所有 resolver（`nameResolver`/`groupNameResolver`/`accountIdResolver`）到 Gateway |
| `server/engine/NextclawEngineGateway.ts` | 传递 resolver 到 engine factory |
| `server/services/automation-service.ts` | 定时任务 prompt 构建（`buildScheduledPrompt` 不再注入 systemPrompt） |
| `server/db/schema.ts` | `ChannelGroupRecord` 类型 + `channelGroups` 表名 |

### 已移除

| 文件 | 原因 |
|------|------|
| `server/utils/delivery-instruction.ts` | `delivery_targets` 机制已完全移除 |
| `tests/delivery-instruction.test.ts` | 对应测试随之删除 |
| `server/utils/channel-notification-hint.ts` | 被 `to_name`/`to_group_name` 等 MessageTool 参数取代 |

### 数据库变更

| Migration | 内容 |
|-----------|------|
| `20260422153901_channel_groups_and_drop_delivery_targets.ts` | 创建 `channel_groups` 表 |

### `channel_groups` 表结构

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | STRING (PK) | UUID |
| `conversation_id` | STRING (UNIQUE) | 群会话 ID |
| `title` | STRING | 群名称 |
| `channel` | STRING | 渠道类型（目前固定 `dingtalk`） |
| `account_id` | STRING | 账号 ID |
| `created_at` | TIMESTAMP | 创建时间 |
| `updated_at` | TIMESTAMP | 更新时间 |

---

## 使用方式

### 定时任务投递

在 `taskPrompt` 中直接用自然语言指定投递目标：

```
每日晚8点生成工作汇报，发送到AI公司群
```

AI 执行后调用：
```json
{
  "action": "send",
  "channel": "dingtalk",
  "to_group_name": "AI公司群",
  "content": "..."
}
```

**注意**：不需要在 taskPrompt 中重复写 systemPrompt 的内容，Engine 已通过 workspace 自动加载了员工的系统提示词。taskPrompt 只需写任务指令和投递目标即可。

### Webhook 投递

同理，在 skill 提示词或 employee `systemPrompt` 中指定：

```
收到 Webhook 后分析内容，将摘要私聊发送给刘俊宏
```

AI 执行后调用：
```json
{
  "action": "send",
  "channel": "dingtalk",
  "to_name": "刘俊宏",
  "content": "..."
}
```

### 群名解析限制

- 机器人需要在目标群中收到过至少一条消息，群名才会被注册到数据库
- 群名变更后，下一条群消息到达时自动更新
- 支持精确匹配和模糊匹配（包含关系）
- LIKE 通配符（`%`、`_`）已做转义处理，避免意外匹配

### 并发安全

- `registerGroup` 使用 read-then-write + catch unique constraint violation 模式处理并发插入
- 重复的 `conversation_id` 插入会被静默忽略（SQLITE_CONSTRAINT / 23505）
- 日期字段使用 `dbNow()` 生成达梦兼容格式（`YYYY-MM-DD HH:mm:ss`）

---

## 测试覆盖

### 自动化测试

| 文件 | 测试内容 |
|------|---------|
| `tests/identity-resolver.test.ts` | resolve（已知/未知/无部门）、resolveByName（多匹配/无匹配/唯一匹配） |
| `tests/channel-runtime.test.ts` | 发送者前缀注入、未知发送者退化 |

### 建议手动测试

1. 群聊发送者识别：在 DingTalk 群中发消息，确认 AI 回复中正确称呼发送者
2. `to_name` 私聊发送：AI 使用 `message(channel:"dingtalk", to_name:"刘俊宏", content:"...")`
3. `to_group_name` 群消息：AI 使用 `message(channel:"dingtalk", to_group_name:"AI公司群", content:"...")`
4. `mention`：AI 发群消息时使用 `mention:"刘俊宏"` 参数
5. 定时任务投递：创建 taskPrompt 含投递指示的定时任务，确认执行后正确投递
6. Webhook 投递：触发 webhook，确认 AI 根据 prompt 指示正确投递结果
