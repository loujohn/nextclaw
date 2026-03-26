# v0.14.7 — 数字员工记忆/定时任务/技能系统全面增强

## 迭代完成说明

本次迭代解决了数字员工平台的五大核心问题，涉及 21 个文件，+249 / -65 行代码。

### 1. 技能系统重构（启用无效 + 取消物理拷贝）

**问题**：技能中心启用/禁用不生效；每个员工物理拷贝技能文件。

**改动文件**：
- `packages/nextclaw-core/src/agent/skills.ts` — `SkillsLoader` 增加 `additionalSkillsDirs` 参数，支持从全局技能目录加载技能，无需物理拷贝。员工 workspace 技能优先级最高（同名跳过后续目录）。
- `packages/nextclaw-core/src/agent/context.ts` — `ContextBuilder` 透传 `additionalSkillsDirs` 到 `SkillsLoader`。
- `packages/nextclaw-core/src/agent/loop.ts` — `AgentLoop` 构造器增加 `additionalSkillsDirs` 选项并传递给 `ContextBuilder`。
- `packages/nextclaw-digital-employee/server/engine/NextclawEngineGateway.ts` — `createEngineForWorkspace` 为非主 workspace 的员工自动注入 `additionalSkillsDirs: [globalSkillsDir]`。
- `packages/nextclaw-digital-employee/server/engine/employee-workspace.ts` — 移除物理拷贝技能文件的逻辑。
- `packages/nextclaw-digital-employee/server/api/skills/[name]/state.patch.ts` — 改进 upsert 逻辑，使用有意义的 `sourceUri`（`"local"`）和 `installPath`（`"skills/" + name`）默认值，增加 `try/catch` 错误处理。
- `packages/nextclaw-digital-employee/server/runtime/platform-context.ts` — 传递 `skillInstallationRepo` 到 `EmployeeRunService` 和 `ChannelRuntime`。
- `packages/nextclaw-digital-employee/server/runtime/channel-runtime.ts` — 接收 `skillInstallationRepo` 选项。
- `packages/nextclaw-digital-employee/server/services/employee-run-service.ts` — 接收 `skillInstallationRepo`。
- `packages/nextclaw-digital-employee/server/services/employee-runtime-preparation.ts` — 使用 `skillInstallationRepo` 查询已安装技能状态。

### 2. Compaction 摘要（上下文压缩时生成摘要）

**问题**：上下文超限时直接删除历史消息，丢失关键上下文。

**改动文件**：
- `packages/nextclaw-core/src/agent/input-budget-pruner.ts` — 新增 `buildCompactionSummary()` 函数，当历史消息被裁剪时生成压缩摘要（按角色+截取片段），插入为 `system` 消息保留在上下文中。返回结果增加 `compactionSummary` 和 `nearBudgetThreshold` 字段。

**摘要格式**：
```
[Conversation Compaction — N earlier messages were pruned to fit context budget]
[user] 消息片段…
[assistant] 消息片段…

[Memory Flush Reminder] Earlier messages have been removed from context.
```

### 3. Memory Flush 提示（上下文接近容量时提醒写入记忆）

**问题**：上下文接近满时，agent 不知道应该主动保存重要信息。

**改动文件**：
- `packages/nextclaw-core/src/agent/loop.ts` — `pruneMessagesForInputBudget` 方法增加：当 `nearBudgetThreshold=true` 且无 compaction 摘要时，在最后一条 user 消息末尾追加 `[System hint]` 提醒 agent 主动将重要内容写入 `memory/YYYY-MM-DD.md` 或 `MEMORY.md`。

### 4. Session 每日重置 + 空闲超时 + 归档

**问题**：长期对话不断累积，无重置机制。

**改动文件**：
- `packages/nextclaw-core/src/session/manager.ts` — 新增：
  - `shouldReset(session)` — 检测是否应重置（跨天或空闲超过 `idleTimeoutMs`，默认 4 小时）
  - `archiveAndReset(session)` — 将当前 session events 归档为 `{key}__archive__{date}__{ts}.jsonl`，然后清空 messages/events/seq 并保存
  - 在 `getOrCreate` 中自动触发 `shouldReset` 检查

### 5. CronTool 创建的定时任务同步到数据库（UI 可见）

**问题**：agent 通过对话创建的定时任务只保存在文件系统，UI 无法展示。

**改动文件**：
- `packages/nextclaw-core/src/cron/types.ts` — `CronJob` 类型增加 `agentId?: string`。
- `packages/nextclaw-core/src/cron/service.ts` — 增加：
  - `onJobAdded?: (job: CronJob) => void` 回调
  - `onJobRemoved?: (jobId: string) => void` 回调
  - `addJob` 中存储 `agentId`，添加后调用 `onJobAdded`
  - `removeJob` 中删除后调用 `onJobRemoved`
  - `loadStore` 反序列化时解析 `agentId` 字段
- `packages/nextclaw-core/src/agent/tools/cron.ts` — `CronTool` 增加 `agentId` 属性，`setContext` 接收 `agentId`，`execute` 传递给 `addJob`。
- `packages/nextclaw-core/src/agent/loop.ts` — `processMessage` 和 `processSystemMessage` 中 `cronTool.setContext` 均传递 `this.agentId`。
- `packages/nextclaw-core/src/engine/types.ts` — `AgentEngineFactoryContext` 增加 `additionalSkillsDirs`。
- `packages/nextclaw-digital-employee/server/engine/NextclawEngineGateway.ts` — 接收并传递共享 `cronService` 实例。
- `packages/nextclaw-digital-employee/server/runtime/platform-context.ts` — 创建共享 `CronService` 实例，传递给 gateway 和 automationService；注册 `onJobAdded` 回调，根据 `agentId` 查找 employee 并写入数据库。
- `packages/nextclaw-digital-employee/server/services/automation-service.ts` — `onJob` 回调增加 agent-created job 的 fallback 处理：当 job 不匹配 `ejob:` 或 `employee:` 前缀但有 `agentId` 时，通过 `employeeRepo.getByCode(agentId)` 查找员工并执行 `runEmployeeTurn`。

### 6. WriteFileTool 路径修复（记忆文件实际写入）

**问题**：agent 声称写入了记忆文件，但实际文件没有更新。

**根因**：`WriteFileTool` 的 `resolvePath` 对相对路径基于 `process.cwd()` 解析而非员工 workspace；且不自动创建父目录。

**改动文件**：
- `packages/nextclaw-core/src/agent/tools/filesystem.ts` —
  - `resolvePath` 函数：相对路径现在基于 `allowedDir`（员工 workspace）解析
  - `WriteFileTool.execute`：写入前自动 `mkdirSync(dir, { recursive: true })` 创建父目录

### 7. AGENTS.md 模板更新

**改动文件**：
- `packages/nextclaw-digital-employee/templates/AGENTS.md` — 更新为 OpenClaw 风格的中文模板，包含：每次会话流程、记忆系统（日志/长期记忆）、安全准则、群聊行为、心跳检查、定时任务等。

### 8. 新技能导入 + DingTalk 通知优化

**改动文件**：
- `packages/nextclaw-digital-employee/skills/weekly-report/SKILL.md` — 周报生成技能
- `packages/nextclaw-digital-employee/skills/work-time-check/SKILL.md` + `scripts/work-time-check.js` — 考勤统计技能
- `packages/nextclaw-digital-employee/skills/zentao-cli/SKILL.md` + `scripts/auth.js` — 禅道 CLI 技能
- `packages/nextclaw-digital-employee/skills/zentao-project-analysis/SKILL.md` — 禅道项目分析技能
- `packages/nextclaw-digital-employee/skills/dingtalk-notify/SKILL.md` + `scripts/dingtalk-notify.js` — DingTalk 通知优化：使用唯一时间戳文件名避免内容覆盖，`finally` 块自动清理临时文件

### 9. Run 详情展示

**改动文件**：
- `packages/nextclaw-digital-employee/app/pages/runs/index.vue` — 运行详情弹窗增加 events 展示，显示时间戳和消息内容摘要。

---

## 测试/验证/验收方式

### 自动化测试
- `@nextclaw/core` 全部 78 个单元测试通过（20 个测试文件）
- 新增 `packages/nextclaw-core/src/agent/tools/filesystem.test.ts`：覆盖 WriteFileTool/ReadFileTool/EditFileTool/ListDirTool 的相对路径解析、目录自动创建、workspace 越界保护

### 构建验证
- `@nextclaw/core` build ✅
- `nextclaw-digital-employee` full build ✅（含 Nuxt SSR + Nitro）

### 功能冒烟测试要点
1. **记忆写入**：通过对话让 agent 写入 `memory/YYYY-MM-DD.md`，验证文件实际出现在员工 workspace 下
2. **定时任务**：通过对话让 agent 创建定时任务，验证 UI 定时任务页面可见
3. **技能中心**：启用/禁用技能后，验证前端状态正确显示
4. **上下文压缩**：发送大量消息后观察是否出现 compaction 摘要
5. **Session 重置**：跨天或空闲 4 小时后重新对话，验证 session 自动重置

---

## 发布/部署方式

- 本次改动涉及 `@nextclaw/core` 和 `nextclaw-digital-employee`
- 需按 changeset 流程发布 `@nextclaw/core` 及其下游依赖包
- `nextclaw-digital-employee` 需重新构建部署

---

## 用户/产品视角的验收步骤

1. 登录数字员工平台
2. 进入任一员工对话页面，发送"帮我创建一个每 5 分钟执行一次的定时任务"
3. 切换到该员工的"定时任务"标签页，确认新任务已出现
4. 在对话中发送"把今天的对话记录写入记忆"
5. 检查员工 workspace 下 `memory/` 目录，确认文件已创建
6. 进入技能中心，切换某技能的启用/禁用状态，确认前端正确反映
7. 查看运行中心，点击某次运行查看详情，确认 events 正确展示
