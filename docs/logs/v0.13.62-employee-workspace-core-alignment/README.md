# v0.13.62 - 员工 Workspace 与核心包对齐

## 迭代完成说明

### 问题

`digital-employee` 的员工 workspace 初始化（`employee-workspace.ts`）独立重复实现了 `nextclaw` CLI 的 `WorkspaceManager` 逻辑，导致：

1. 员工 workspace 只有 `SOUL.md` + `IDENTITY.md`，缺少 `AGENTS.md`、`TOOLS.md`、`BOOT.md`、`HEARTBEAT.md`、`MEMORY.md`、`USER.md` 等关键文件
2. Agent 没有操作手册（AGENTS.md），不知道如何管理记忆、安全边界、群聊礼仪等
3. HeartbeatService 未使用核心实现
4. MissingProvider、ExtensionRegistry、seedBuiltinSkills 等与 nextclaw CLI 重复实现但未标注来源

### 改动

#### 1. Workspace 模板对齐（employee-workspace.ts）

- 新增 `seedFromTemplates()` 函数，从 `packages/nextclaw/templates/` 读取标准模板文件
- 初始化顺序：模板种子 → 全局 workspace 种子 → 员工特定 SOUL.md / IDENTITY.md 覆写
- 支持 `NEXTCLAW_TEMPLATE_DIR` 环境变量覆盖模板路径
- 模板包含 `${APP_NAME}` 变量替换

**种子文件清单：**


| 文件               | 来源   | 说明         |
| ---------------- | ---- | ---------- |
| AGENTS.md        | 模板   | Agent 操作手册 |
| TOOLS.md         | 模板   | 工具使用指南     |
| USER.md          | 模板   | 用户信息       |
| BOOT.md          | 模板   | 启动指令       |
| HEARTBEAT.md     | 模板   | 心跳任务       |
| MEMORY.md        | 模板   | 长期记忆       |
| memory/MEMORY.md | 模板   | 记忆目录       |
| SOUL.md          | 员工数据 | 角色设定覆写     |
| IDENTITY.md      | 员工数据 | 身份信息覆写     |


#### 2. HeartbeatService 集成

- `NextclawEngineGateway` 新增 `startHeartbeat()`、`stopHeartbeat()`、`stopAllHeartbeats()` 方法
- 复用核心的 `HeartbeatService`（从 `@nextclaw/core` 导入），定期检查员工 workspace 的 `HEARTBEAT.md`
- `AutomationService` 的 `heartbeat` 类型调度改为使用真正的 `HeartbeatService`，而非 CronService 的 `kind: "every"`

#### 3. 来源标注

为 `NextclawEngineGateway.ts` 中与 nextclaw CLI 重复的代码添加来源标注注释：

- `toExtensionRegistry` ← `packages/nextclaw/src/cli/commands/plugins.ts`
- `resolveBuiltinSkillsDir` / `seedBuiltinSkills` ← `packages/nextclaw/src/cli/workspace.ts`
- `MissingProvider` ← `packages/nextclaw/src/cli/missing-provider.ts`

#### 4. 前端表单优化

- 员工创建表单还原为面向用户的自然表达，移除 IDENTITY.md / SOUL.md 等技术细节
- 步骤标签：基础信息 → 能力配置 → 自动任务

### 架构审计总结


| 领域                | 状态       | 说明                |
| ----------------- | -------- | ----------------- |
| SessionManager    | ✅ 复用核心   | 文件 JSONL 存储       |
| CronService       | ✅ 复用核心   | 定时任务              |
| HeartbeatService  | ✅ 已集成    | 本次改动              |
| Workspace 初始化     | ✅ 已对齐    | 本次改动              |
| AgentEngine       | ✅ 复用核心   | NativeAgentEngine |
| ProviderManager   | ✅ 复用核心   | 多 Provider 管理     |
| MissingProvider   | ⚠️ 复制+标注 | 避免修改上游            |
| ExtensionRegistry | ⚠️ 复制+标注 | 避免修改上游            |
| seedBuiltinSkills | ⚠️ 复制+标注 | 避免修改上游            |


## 测试/验证

1. TypeScript 类型检查通过：`pnpm -C packages/nextclaw-digital-employee tsc` ✅
2. 页面正常加载：员工列表、创建表单正常 ✅
3. 创建新员工后 workspace 包含完整文件：AGENTS.md + TOOLS.md + BOOT.md + HEARTBEAT.md + MEMORY.md + USER.md + SOUL.md + IDENTITY.md + skills/ + memory/ ✅
4. SOUL.md 和 IDENTITY.md 由员工数据正确覆写 ✅

## 发布/部署

本次改动仅影响 `@nextclaw/digital-employee`（私有包），不涉及 npm 发布。
未修改任何上游包（`@nextclaw/core`、`nextclaw`、`@nextclaw/openclaw-compat`），零合并冲突风险。

## 用户/产品视角验收

1. 创建新员工 → 进入员工聊天 → Agent 应能读取 AGENTS.md 中的操作手册，表现出完整的行为规范
2. 员工创建表单使用自然语言描述，无技术术语暴露

