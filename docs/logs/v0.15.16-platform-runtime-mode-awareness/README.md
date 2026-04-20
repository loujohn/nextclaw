# v0.15.16 — Platform Runtime Awareness & Schedule Tool

## 迭代完成说明

本版本包含两条相互独立的主线：

- **主线 1**：让 `@nextclaw/core` 的系统提示词对 CLI / 平台运行时差异有感知，数字员工平台下不再向 AI 暴露 CLI 专属内容。
- **主线 3**：在数字员工平台侧新增 `schedule` 工具（基于 ExtensionTool），让 AI 可以在平台环境中管理定时任务，并落地相关运营指南文档。

### 问题背景

1. 数字员工平台的 AI 共用 `@nextclaw/core` 的系统提示词（`ContextBuilder.getIdentity()`），其中包含大量 CLI 专属内容（CLI Quick Reference、Self-Update、Self-Management Guide、gateway 工具引用等）。平台环境没有 CLI，导致：
   - AI 建议用户运行不存在的 `nextclaw channels status` 等命令
   - `gateway` 工具在平台无 controller，调用返回错误
2. 数字员工平台此前没有暴露给 AI 的 schedule 管理入口，用户想让 AI 设置 / 取消定时任务时只能依赖 CLI 版本的 cron 工具，在平台环境下无法使用；同时平台缺少一份面向 AI 自身的"平台使用说明"，AI 难以正确理解自己所处的运行环境与可用能力。

### 改动内容

#### 主线 1 — 运行时模式感知

1. **`@nextclaw/core` — ContextBuilder 接入 `runtimeMode`**
   - `ContextBuilder` 新增 `runtimeMode: "cli" | "platform"` 参数（默认 `"cli"`，向后兼容）
   - `platform` 模式的系统提示词：
     - 跳过 CLI Quick Reference、Self-Update、Self-Management Guide 段落
     - 不列出 `gateway` 工具
     - 新增 "Platform Runtime" 段落，明确告知 AI "无 CLI 可用；`message` 工具仅在系统提示词中注入了渠道 hint 时才可使用，否则直接回复"
   - 新增 `RuntimeMode` 类型，通过 `engine/types.ts` 导出

2. **透传链路**
   - `AgentEngineFactoryContext` → `AgentLoop` → `ContextBuilder` 全链路支持 `runtimeMode`
   - `NativeAgentEngine` 自动继承（使用 `ConstructorParameters<typeof AgentLoop>[0]`）

3. **平台接入**
   - `NextclawEngineGateway` 在创建 engine 时注入 `runtimeMode: "platform"`

#### 主线 3 — 平台 schedule 工具

1. **平台 schedule 工具（基于 ExtensionTool）**
   - 新增 `packages/nextclaw-digital-employee/server/engine/platform-schedule-tool.ts`
   - 通过 `createPlatformScheduleToolFactory` 注册到 `ExtensionRegistry`
   - 支持 `list` / `create` / `update` / `delete` / `run_now` 五种动作，内部从 `ExtensionToolContext`（`chatId` 优先，否则解析 `sessionKey`）推断 `employeeId`
   - 在 `scheduled` 触发上下文下（严格正则匹配 `^employee:<id>:scheduled:`）自动拒绝 `create`，避免 AI 在被触发执行时反向递归
   - 对 `create` / `update` 的入参做清洗（类型归一、字段白名单、`everyMs` 必须为正整数），避免 AI 传入脏数据
   - 所有 service 调用都走 `callService()` 包装：任何底层异常（DB 抖动、连接断开、约束违反）被归一为 `{ status: "error", retriable: true }`，对齐 `ScheduleToolResponse` 合约
   - `update` / `delete` / `run_now` 通过 `AutomationService` 的 `JobOwnershipOptions` 做归属校验（`JobNotFoundError` / `JobOwnershipError`），把授权下沉到 service 层，tool 层绕过也无法越权
   - 新增 `packages/nextclaw-digital-employee/skills/schedule/SKILL.md` 说明工具用法、参数、示例和使用约束

2. **平台运行时上下文改造（`platform-context.ts`）**
   - 调用 `createPlatformScheduleToolFactory(...)` 注册 `platform.schedule` 工厂
   - 构造 `NextclawEngineGateway` 时显式传入 `cronService: null`，关闭共享 CronService 自带的 CLI `cron` 工具入口，改由上层 schedule 工具代理
   - `loadPlatformRuntimeState()` 返回的 `reservedToolNames` 列表追加 `"schedule"`（`server/runtime/openclaw-runtime.ts`），避免 schedule 与其它扩展工具撞名
   - 删除旧的 `cronService.onJobAdded` 回调逻辑（改由 schedule 工具内部事件驱动）
   - 删除 `buildChannelNotificationHint`：定时任务触发时不再向 taskPrompt 拼接"请使用 message 工具发送结果"的系统提示，避免 AI 把任务结果通过 message 工具重复投递（应直接回复，由调用方消费 `result.reply`）

3. **Gateway 侧支持**
   - `NextclawEngineGateway` 在构建 engine 时：
     - 通过 `extensionRegistry` 注入 `platform.schedule` 工具实例（来自 platform-context 注册的工厂）
     - 支持 `excludeTools` / `excludeSkills`，在定时任务触发时可屏蔽 schedule 工具自身避免递归
   - 新增基于 LRU 的多维 engine 缓存（agentId | workspace | model | envHash | cronMode），`envOverlay` 使用内容哈希参与 key，避免 secret 轮转时错用旧 engine
   - `PLATFORM_USAGE.md` 作为平台使用指南，通过 Nitro `serverAssets` 机制在服务启动时由 `seed-platform-usage` plugin 自动写入到每个员工工作空间根目录；开发模式直读 `server/assets/`，生产模式走 `useStorage("assets:usage")`，与 `seed-skills` 的做法完全一致。用户手改过的 `PLATFORM_USAGE.md`（缺 managed marker）不会被覆盖。

4. **PLATFORM_USAGE.md（新增）**
   - 面向 AI 自身的"平台使用说明"：解释运行时环境、可用工具、channel 介绍、schedule 工具的约束与正确用法、以及 AI 自我管理的基本规则。

#### 辅助改动

- `packages/nextclaw-core/src/agent/skills.ts`：`buildSkillsSummary()` 支持 `excludeNames`，配合 schedule 工具场景排除自身
- `packages/nextclaw-core/src/agent/subagent.ts`：`SubagentManager` 新增 `envOverlay` 透传，与 Gateway 内的 engine 缓存 key 保持一致
- `packages/nextclaw-core/src/session/manager.ts`：补充内存缓存行为说明性注释
- `packages/nextclaw-core/src/agent/loop.system-message.test.ts`：适配 `runtimeMode` 透传的测试期望

### 文件变更

| 文件 | 变更类型 |
|------|----------|
| `packages/nextclaw-core/src/agent/context.ts` | 新增 `RuntimeMode` 类型、`runtimeMode` 参数、按模式条件生成系统提示词 |
| `packages/nextclaw-core/src/agent/context.test.ts` | 新增：`ContextBuilder` 不同模式的快照测试 |
| `packages/nextclaw-core/src/agent/loop.ts` | 接受并透传 `runtimeMode` |
| `packages/nextclaw-core/src/agent/loop.system-message.test.ts` | 适配 system message 透传 runtimeMode |
| `packages/nextclaw-core/src/agent/skills.ts` | `buildSkillsSummary` 新增 `excludeNames` 选项 |
| `packages/nextclaw-core/src/agent/subagent.ts` | 新增 `envOverlay` 选项透传 |
| `packages/nextclaw-core/src/engine/types.ts` | `AgentEngineFactoryContext` 新增 `runtimeMode`；导出 `RuntimeMode` |
| `packages/nextclaw-core/src/session/manager.ts` | 补充内存缓存说明性注释 |
| `packages/nextclaw-digital-employee/server/engine/NextclawEngineGateway.ts` | 注入 `runtimeMode: "platform"`；LRU engine 缓存 + `envOverlay` 内容哈希；`excludeTools`/`excludeSkills` 透传；`AgentEngine.dispose?()` LRU 驱逐钩子 |
| `packages/nextclaw-digital-employee/server/engine/platform-usage-seeder.ts` | 新增：`writePlatformUsageGuide`（幂等 marker 写入策略），纯写入逻辑独立于 Nitro runtime |
| `packages/nextclaw-digital-employee/server/plugins/seed-platform-usage.ts` | 新增：Nitro plugin，开发模式读 `server/assets/`，生产模式走 `useStorage("assets:usage")`，和 `seed-skills.ts` 对齐 |
| `packages/nextclaw-digital-employee/server/engine/platform-schedule-tool.ts` | 新增：平台 `schedule` ExtensionTool；`ScheduleToolResponse` 类型收窄 |
| `packages/nextclaw-digital-employee/server/runtime/platform-context.ts` | 注册 `platform.schedule` 工厂；`cronService: null`；`toolSuggestions` 带 schedule |
| `packages/nextclaw-digital-employee/server/runtime/openclaw-runtime.ts` | `reservedToolNames` 列表追加 `"schedule"` |
| `packages/nextclaw-digital-employee/server/services/automation-service.ts` | 新增 `JobOwnershipOptions` + `RunJobNowOutcome` + `JobNotFoundError` / `JobOwnershipError`；`runJobNow` 返回结构化 outcome；新增 per-job mutex (`jobLocks`) 防并发漂移；`restartJobSchedules` 改为按 name（`ejob:{jobId}`）匹配 cron 条目、自动清理重名重复项（修复 HMR 重启积累问题） |
| `packages/nextclaw-digital-employee/server/services/employee-run-service.ts` | 删除 `buildChannelNotificationHint` 调用及 `integrationConnectionRepo` 字段（已无用途） |
| `packages/nextclaw-digital-employee/server/assets/PLATFORM_USAGE.md` | 新增：平台 AI 使用说明（通过 Nitro `serverAssets` 注册） |
| `packages/nextclaw-digital-employee/nuxt.config.ts` | 注册 `nitro.serverAssets` 新增 `{ baseName: "usage", dir: "./server/assets" }` |
| `packages/nextclaw-digital-employee/tests/platform-schedule-tool.test.ts` | 新增：schedule 工具单测（guard / list / create / update / delete / run_now / late-binding） |
| `packages/nextclaw-digital-employee/tests/automation-reconciliation.test.ts` | 新增：`restartJobSchedules` 对账逻辑测试（重复清理、孤儿剪枝、mutex 并发） |
| `packages/nextclaw-digital-employee/tests/platform-usage-seeder.test.ts` | 新增：`writePlatformUsageGuide` 幂等写入测试 |
| `packages/nextclaw-digital-employee/skills/schedule/SKILL.md` | 新增：schedule 工具 skill 文档 |
| `docs/logs/v0.15.16-platform-runtime-mode-awareness/README.md` | 新增：本次发布说明 |

## 测试/验证/验收方式

### 代码级验证

- `@nextclaw/core` tsc：✅ 通过
- `@nextclaw/core` lint：✅ 本次修改文件无新增 error（预存 warning 未变）
- `@nextclaw/digital-employee` tsc（`tsc --noEmit`）：✅ 通过
- `@nextclaw/digital-employee` lint：✅ 本次修改文件无新增 error，`platform-schedule-tool.ts` 有 2 条预期 `max-lines-per-function` warning（工具实现函数稍长）

### 冒烟测试（需人工验证）

1. **系统提示词验证**：在平台创建 / 使用数字员工时，检查 AI 不再引用 CLI 命令（`nextclaw ...`）
2. **回归验证**：CLI 版 NextClaw（`packages/nextclaw`）行为不变（默认 `runtimeMode: "cli"`）
3. **schedule 工具验证**：
   - 在员工聊天中让 AI 帮忙创建一个 1 分钟后运行的定时任务 → 预期 AI 使用 `schedule` 工具成功创建，并能通过 `schedule` 工具 `list` 查询到
   - 等到触发执行时，再询问 AI 是否创建新定时任务 → 预期 AI 拒绝（scheduled 上下文下不允许再次 add）
4. **PLATFORM_USAGE.md 验证**：打开任一员工 workspace，确认 `PLATFORM_USAGE.md` 已自动写入；AI 回答问题时能正确引用其中内容

## 发布/部署方式

1. 先发布 `@nextclaw/core`（含 `RuntimeMode` 类型 / `buildSkillsSummary.excludeNames` / subagent `envOverlay` 透传）
2. 再部署 `@nextclaw/digital-employee`（依赖上面的新 core，并落地 schedule 工具与 PLATFORM_USAGE.md）
3. 部署完成后执行一次员工工作空间刷新或触发一次对话，使 PLATFORM_USAGE.md 被写入到老员工的 workspace

## 用户 / 产品视角的验收步骤

1. 登录数字员工平台，打开任一员工聊天
2. 询问 "你现在能做什么？" → 预期 AI 不再建议运行 `nextclaw channels status` 等 CLI 命令
3. 让 AI 设置一个定时任务（例如 "每天早上 9 点发送日报"）→ 预期使用 `schedule` 工具创建成功，并能列出已有任务
4. 触发时间到达时，观察对应 schedule 能被实际调度执行（由平台 scheduler 驱动）
