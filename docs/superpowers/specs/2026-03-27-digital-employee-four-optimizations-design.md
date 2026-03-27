# Digital Employee 四项优化设计

**日期**: 2026-03-27
**状态**: Draft
**涉及包**: `@nextclaw/digital-employee`, `@nextclaw/core`

---

## 背景

`nextclaw-digital-employee` 当前有 4 个已确认的优化需求：

1. **Skill 全局启用后员工无法发现** — 全局启用的 skill 不会自动加入员工的可用列表
2. **Skill 硬连接到 workspace** — 因为 skill 脚本使用相对路径，必须 symlink 才能执行
3. **页面聊天无流式返回** — chat.post.ts 同步全量返回，用户体验差
4. **缺少 Secrets 管理** — skill 脚本的凭证无安全存储和 UI 管理机制

这 4 个问题归纳为 3 个设计方向：

| 方向 | 问题 | 优先级 |
|------|------|--------|
| A. Skill 系统重构 | #1 + #2 | P0 |
| B. 流式聊天 | #3 | P1 |
| C. Secrets 管理 | #4 | P2 |

---

## 方向 A：Skill 系统重构

### 问题分析

**问题 1 根因**：`employee-runtime-preparation.ts` 只将 `employee_skills` 表中绑定且 enabled 的 skill 传入 `requestedSkills`。全局安装并启用的 skill 如果没有绑定到员工，就不会出现在 `requestedSkills` 中，导致不被加载。

**问题 2 根因**：`employee-workspace.ts` 的 `linkGlobalSkills()` 将全局 `skills/` 目录 symlink 到员工工作区，目的是让 agent 在员工工作区执行 `node scripts/xxx.js` 时能找到脚本文件。OpenClaw 不需要 symlink，因为它通过 `additionalSkillsDirs` 机制加载 skill 内容，且 skill 脚本路径在 context 中通过 `<location>` 标签标注。

### 设计方案

#### A.1 去除 symlink 机制

**改动文件**: `server/engine/employee-workspace.ts`

- 删除 `linkGlobalSkills()` 函数
- 从 `ensureEmployeeWorkspace()` 中移除 `linkGlobalSkills(wsDir, globalWorkspaceDir)` 调用
- 保留其他逻辑不变

#### A.2 `loadSkillsForContext` 注入绝对路径

**改动文件**: `packages/nextclaw-core/src/agent/skills.ts`

`loadSkillsForContext()` 当前只注入 SKILL.md 的内容。改为在每个 skill 内容前注入该 skill 的目录绝对路径，使 agent 知道脚本应在哪个目录执行。

新增 `getSkillDir(name: string): string | null` 方法：

```typescript
getSkillDir(name: string): string | null {
  const workspaceCandidate = join(this.workspaceSkills, name);
  if (existsSync(join(workspaceCandidate, "SKILL.md"))) return workspaceCandidate;
  for (const dir of this.additionalSkillsDirs) {
    const candidate = join(dir, name);
    if (existsSync(join(candidate, "SKILL.md"))) return candidate;
  }
  const builtinCandidate = join(this.builtinSkills, name);
  if (existsSync(join(builtinCandidate, "SKILL.md"))) return builtinCandidate;
  return null;
}
```

修改 `loadSkillsForContext()`:

```typescript
loadSkillsForContext(skillNames: string[]): string {
  const parts: string[] = [];
  for (const name of skillNames) {
    const content = this.loadSkill(name);
    if (content) {
      const skillDir = this.getSkillDir(name);
      const locationHint = skillDir
        ? `\n\n**Skill Directory**: \`${skillDir}\`\n(Execute scripts from this directory using \`cd ${skillDir} && ...\` or absolute paths)\n`
        : "";
      parts.push(`### Skill: ${name}${locationHint}\n\n${this.stripFrontmatter(content)}`);
    }
  }
  return parts.length ? parts.join("\n\n---\n\n") : "";
}
```

#### A.3 全局启用的 Skill 自动可用

**改动文件**: `server/services/employee-runtime-preparation.ts`

修改 `prepareEmployeeRuntime()` 逻辑：

```typescript
export async function prepareEmployeeRuntime(params: {
  employee: EmployeeView;
  employeeSkillRepo: EmployeeSkillRepository;
  skillInstallationRepo?: SkillInstallationRepository;
  homeDir: string;
  workspaceDir: string;
}): Promise<{ workspace: string; skillNames: string[] }> {
  const employeeSkills = await params.employeeSkillRepo.listByEmployeeId(params.employee.id);

  const installations = params.skillInstallationRepo
    ? await params.skillInstallationRepo.list()
    : [];

  const disabledGlobally = new Set(
    installations.filter((i) => !i.enabled).map((i) => i.skillName)
  );

  const globallyEnabled = new Set(
    installations.filter((i) => i.enabled).map((i) => i.skillName)
  );

  const boundSkills = employeeSkills
    .filter((s) => s.enabled && !disabledGlobally.has(s.skillName))
    .map((s) => s.skillName);

  const skillNames = [...new Set([...boundSkills, ...globallyEnabled])];

  const workspace = ensureEmployeeWorkspace(params.homeDir, {
    code: params.employee.code,
    name: params.employee.name,
    description: params.employee.description,
    systemPrompt: params.employee.systemPrompt,
  }, params.workspaceDir);

  return { workspace, skillNames };
}
```

#### A.4 影响与兼容性

- 现有 SKILL.md 内容无需修改（脚本路径写法不变）
- Agent 会根据注入的 Skill Directory 信息自动切换到正确目录执行
- `additionalSkillsDirs` 机制已存在且工作正常（`createEngineForWorkspace` 已传参）

---

## 方向 B：流式聊天

### 问题分析

当前 `server/api/employees/[id]/chat.post.ts` 通过 `ctx.employeeRunService.runEmployeeTurn()` 同步等待完整结果后一次性返回。LLM 回复通常需要 10-60 秒，期间用户只看到"正在思考..."。

底层 `AgentEngineDirectRequest` 已支持：
- `onAssistantDelta: (delta: string) => void` — 文本增量回调
- `onSessionEvent: (event: SessionEvent) => void` — 会话事件回调
- `abortSignal: AbortSignal` — 中止支持

只需在 digital-employee 层接入。

### 设计方案

#### B.1 SSE 事件协议

| 事件名 | 数据结构 | 说明 |
|--------|---------|------|
| `delta` | `{ delta: string }` | 文本增量 |
| `session_event` | `{ seq, type, data }` | 工具调用、推理过程等 |
| `done` | `{ reply, runId, sessionKey, messages, resultCards }` | 完成 + 完整结果 |
| `error` | `{ message: string }` | 错误 |

#### B.2 Gateway 层扩展

**改动文件**: `server/engine/NextclawEngineGateway.ts`

**重构方案**：将 `runEmployeeTurn` 的核心逻辑提取为私有方法 `_runTurnCore()`，两个公开方法共享：

```typescript
// 共享的核心参数类型
type RunTurnCoreParams = RunEmployeeTurnParams & {
  onAssistantDelta?: (delta: string) => void;
  onSessionEvent?: (event: SessionEvent) => void;
  abortSignal?: AbortSignal;
};

// 私有核心方法（提取自现有 runEmployeeTurn）
private async _runTurnCore(params: RunTurnCoreParams): Promise<RunEmployeeTurnResult> {
  const events: SessionEvent[] = [];
  const sessionKey = params.sessionKey ?? `employee:${params.employeeId}:ui:direct:web`;
  const agentId = params.agentId ?? "main";
  const engine = this.getOrCreateEngine(agentId, params.workspace, params.model);
  const session = this.sessionManager.getOrCreate(sessionKey);
  const historyCountBefore = this.sessionManager.getHistory(session).length;
  const metadata: Record<string, unknown> = {};
  if (agentId) metadata.agentId = agentId;
  if (params.requestedSkills?.length) metadata.requested_skills = params.requestedSkills;
  const reply = await engine.processDirect({
    content: params.message,
    sessionKey,
    channel: "ui",
    chatId: params.employeeId,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    abortSignal: params.abortSignal,
    onAssistantDelta: params.onAssistantDelta,
    onSessionEvent: (event) => {
      events.push(event);
      params.onSessionEvent?.(event);
    },
  });
  // ... session history 补偿逻辑不变
  return { sessionKey, reply, events };
}

// 公开方法：同步版（保留向后兼容）
async runEmployeeTurn(params: RunEmployeeTurnParams): Promise<RunEmployeeTurnResult> {
  return this._runTurnCore(params);
}

// 公开方法：流式版
async runEmployeeTurnStream(params: RunTurnCoreParams): Promise<RunEmployeeTurnResult> {
  return this._runTurnCore(params);
}
```

这样避免代码重复，同时保持两个公开接口的语义清晰。

#### B.3 Service 层扩展

**改动文件**: `server/services/employee-run-service.ts`

新增 `runEmployeeTurnStream()` 方法，透传回调参数到 Gateway。

#### B.4 SSE 端点

**新增文件**: `server/api/employees/[id]/chat/stream.post.ts`

使用 Nuxt/H3 的 `createEventStream` 创建 SSE 响应，将 `onAssistantDelta` 和 `onSessionEvent` 回调映射为 SSE 事件推送。完成后发送 `done` 事件并关闭流。

#### B.5 前端改造

**改动文件**: `app/pages/employees/[id]/chat.vue`

`sendMessage()` 改为使用 `fetch` + `ReadableStream` 消费 SSE：

1. 发送 POST 到 `/api/employees/${id}/chat/stream`
2. 立即插入一条空 assistant 消息（响应式对象）
3. 逐块解析 SSE 事件：
   - `delta`: 累加到 assistant 消息的 content（实现逐字效果）
   - `session_event`: 更新工具调用/推理 UI
   - `done`: 替换为完整消息列表，更新 resultCards
4. 保留原 `chat.post.ts` 作为降级端点

#### B.6 影响与兼容性

- 原 `chat.post.ts` 保留不变，可作为降级路径
- 前端取消功能继续通过 `AbortController` 实现
- Session history 机制不变（`done` 事件包含完整历史）

---

## 方向 C：Secrets 管理

### 问题分析

当前 skill 脚本（如 `dingtalk-notify.js`）的凭证来源：
- `.env` 文件中的环境变量
- `org_sync_config` 表中的 `app_key`/`app_secret`（明文存储）
- Skill 命令行参数中硬编码

缺乏统一的安全存储和管理机制。

`nextclaw-core` 的 secrets 系统面向配置文件引用（`secrets.refs`），适合静态配置。本需求面向运行时注入 + UI 管理，属于互补场景。

### 设计方案

#### C.1 数据模型

**新增表**: `secrets`

```sql
CREATE TABLE secrets (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'global',
  description TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

- `key`: 环境变量名（如 `DINGTALK_APP_KEY`）
- `value`: AES-256 加密后的值
- `scope`: `global`（所有员工可用）或 `employee:<id>`（指定员工可用）
- `description`: 人类可读描述

加密密钥来源：`NEXTCLAW_SECRET_KEY` 环境变量，或自动生成并持久化到 `<homeDir>/secret.key`。

#### C.2 Repository

**新增文件**: `server/repositories/secrets-repository.ts`

```typescript
class SecretsRepository {
  async list(): Promise<SecretView[]>             // 值脱敏
  async create(params): Promise<SecretView>
  async update(key, params): Promise<SecretView>
  async delete(key): Promise<void>
  async getDecryptedForScope(scope: string): Promise<Map<string, string>>
}
```

#### C.3 REST API

**新增目录**: `server/api/secrets/`

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/secrets` | GET | 列出所有（值脱敏） |
| `/api/secrets` | POST | 创建 |
| `/api/secrets/:key` | PATCH | 更新 |
| `/api/secrets/:key` | DELETE | 删除 |

#### C.4 运行时注入

当 agent 执行 shell 命令时，自动注入匹配 scope 的 secrets 为环境变量。

**注入策略**：在 `NextclawEngineGateway` 层通过 `engineConfig.envOverlay` 传递解密后的 secrets，由 `ExecTool` 在 `spawn` 时合并到子进程 env。

需要对 `@nextclaw/core` 做最小改动：

1. **`AgentEngineFactoryContext`** 新增可选字段 `envOverlay?: Record<string, string>`
2. **`ExecTool`** 在 `spawn/exec` 时将 `envOverlay` 合并到 `process.env`（`envOverlay` 优先）
3. **`NextclawEngineGateway`** 在每次 `runEmployeeTurn` / `runEmployeeTurnStream` 调用前：
   - 查询 `global` scope + `employee:<id>` scope 的 secrets
   - 解密后作为 `envOverlay` 传入 engine

这个方案的好处：
- **无并发冲突**：每次运行独立传递 env，不污染 `process.env`
- **core 改动最小**：只新增一个可选字段 + ExecTool spawn 时合并
- **scope 精确**：可以按员工级别注入不同的 secrets

具体改动文件：
- `packages/nextclaw-core/src/engine/types.ts` — `AgentEngineFactoryContext` 加 `envOverlay`
- `packages/nextclaw-core/src/agent/tools/shell.ts` — `ExecTool` spawn 合并 envOverlay
- `server/engine/NextclawEngineGateway.ts` — 查询 secrets 并传入
- `server/services/employee-run-service.ts` — 协调 secrets 查询

#### C.5 前端 UI

**新增/扩展**: `app/pages/security/index.vue`

列表 + 表单 UI（类似 GitHub Actions Secrets）：
- 列表展示：key、scope（全局/指定员工）、描述、创建时间
- 值显示为 `••••••` + 最后 4 位
- 添加/编辑弹窗：key（创建时可编辑）、value、scope 选择器、description
- 删除确认

#### C.6 影响与兼容性

- 现有 skill 脚本通过 `process.env.XXX` 读取凭证的方式不变
- `.env` 文件继续作为兜底来源
- DB secrets 优先级高于 `.env`（同名时 DB 值覆盖）
- 与 core secrets 系统互补，不冲突

---

## 实施顺序建议

1. **A. Skill 系统重构** — 解决现有卡点，skill 才能真正可用
2. **B. 流式聊天** — 大幅提升用户体验
3. **C. Secrets 管理** — 安全基础设施，可与 B 并行

---

## 验证方式

### A. Skill 系统

- 全局安装并启用一个 skill → 任意员工对话时可发现并使用
- 全局停用后 → 员工不再发现
- Skill 脚本执行正确（agent 使用注入的绝对路径）
- 员工工作区无 `skills/` symlink

### B. 流式聊天

- 发送消息后文本逐字出现
- 工具调用过程实时展示
- 取消按钮中止流
- `done` 后消息列表完整且与历史一致

### C. Secrets

- UI 创建 secret → 数据库加密存储
- Skill 脚本执行时 `process.env.XXX` 读到解密值
- 列表页值脱敏显示
- 删除后 skill 脚本读不到（降级到 .env）
