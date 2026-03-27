# Digital Employee 三项修复 Design Spec

> **Date:** 2026-03-27
> **Scope:** 内置 Skills 更新机制 + Skill 可见性过滤 + 流式实时渲染
> **Packages:** `@nextclaw/core` (小改动), `@nextclaw/digital-employee`

---

## 1. 内置 Skills 强制覆盖更新

### 问题

`seed-skills.ts` 和 `seedBuiltinSkills()` 均使用「已存在则跳过」策略（检查 `SKILL.md` 是否存在），导致源码中更新 skill 后，已部署实例永远收不到更新。

### 方案

**启动时强制覆盖 + 导入时拒绝同名冲突。**

#### 1.1 强制覆盖内置 Skills

所有内置 skills 在每次启动/部署时无条件用源码版本覆盖 workspace 中的副本。

**改动文件：**

- `packages/nextclaw-digital-employee/server/plugins/seed-skills.ts`
  - 移除第 27 行 `if (existsSync(join(installPath, "SKILL.md"))) { continue; }` 检查
  - 使用 `cpSync(srcPath, installPath, { recursive: true, force: true })` 确保完全覆盖（包括脚本更新）
  - 生产模式（serverAssets）同理：先 `rmSync(installPath, { recursive: true, force: true })` 再写入

- `packages/nextclaw-digital-employee/server/engine/NextclawEngineGateway.ts` — `seedBuiltinSkills()`
  - 移除第 162 行 `if (existsSync(join(targetDir, "SKILL.md"))) { continue; }` 检查
  - 使用 `cpSync(sourceDir, targetDir, { recursive: true, force: true })`

**安全性：** AI agent 的工作目录是 employee workspace（`~/.nextclaw-digital-employee/agents/<code>/`），skill 文件在 `workspace/skills/` 下，agent 仅读取 skill 内容和执行脚本，不会修改 skill 文件。

#### 1.2 导入时拒绝内置同名冲突

在 `importFromLocalPath()` 和 `importFromGit()` 中新增检查：如果待导入的 skill 名称与内置 skill 名单冲突，抛出错误。

内置名单从源码 `skills/` 目录自动推导（`seed-skills.ts` 已有此扫描逻辑），不需要手动维护。

**改动文件：**

- `packages/nextclaw-digital-employee/server/engine/NextclawEngineGateway.ts`
  - 新增 `private builtinSkillNames: Set<string>` 属性，在构造函数中从 `seedBuiltinSkills` 的源目录扫描填充
  - 在 `importFromLocalPath()` 和 `importFromGit()` 解析出 skillName 后，检查 `this.builtinSkillNames.has(skillName)`，冲突则抛出 `Error: Cannot import skill "${skillName}" — conflicts with built-in skill`

---

## 2. Skill 可见性过滤

### 问题

`ContextBuilder.buildSystemPrompt()` 调用 `buildSkillsSummary()` 将工作区**所有** skill 列入 `<available_skills>`，导致 agent 能感知到未启用的 skill。

### 方案

给 `buildSkillsSummary()` 增加可选的过滤参数，当传入 `skillNames` 时仅列出这些 skills。

**改动文件：**

- `packages/nextclaw-core/src/agent/skills.ts` — `buildSkillsSummary()`
  - 签名改为 `buildSkillsSummary(filterNames?: string[]): string`
  - 当 `filterNames` 非空时，过滤 `allSkills` 只保留 `filterNames` 中的 skill
  - 不传参时保持原行为（列出全部），向后兼容 nextclaw CLI 场景

- `packages/nextclaw-core/src/agent/context.ts` — `buildSystemPrompt()`
  - 将已有的 `skillNames` 参数传递给 `buildSkillsSummary(skillNames)`

**行为变化示例：**

假设工作区有 6 个 skills，某员工的 `requestedSkills = ["dingtalk-notify", "weekly-report"]`：
- `<available_skills>` 仅列出 dingtalk-notify 和 weekly-report
- "Requested Skills" 区域加载这 2 个 skill 的完整内容
- 其他 skills 对该 agent 完全不可见

**优先级模型（不变）：**
- 全局禁用 > 员工级设置 > 全局启用
- `prepareEmployeeRuntime()` 的合并逻辑已正确实现此优先级

---

## 3. 流式实时渲染

### 问题

1. **两条 AI 回复**：前端创建临时 `assistantMsg`，流式填充后 `done` 事件用服务端完整 messages 替换整个列表，但 agent loop 的多轮迭代会产生多条 assistant 消息（每轮 tool-use 迭代一条），导致最终显示多条
2. **渲染顺序错误**：前端仅处理 `delta` 事件（纯文本），完全忽略 `session_event` 事件，导致思考过程和工具调用不实时展示

### 方案

**基于 `session_event` 实时构建消息列表 + `delta` 实时填充最终回复文本。**

服务端已通过 `onSessionEvent` 发送完整 session 事件流（含 role/content/tool_calls/reasoning_content），无需改动。主要工作在前端。

### 3.1 SSE 事件流格式（已有，不改）

```
event: session_event
data: {"seq":1,"type":"message","data":{"role":"user","content":"..."}}

event: session_event
data: {"seq":2,"type":"message","data":{"role":"assistant","content":"","tool_calls":[...],"reasoning_content":"..."}}

event: session_event
data: {"seq":3,"type":"message","data":{"role":"tool","content":"...","tool_call_id":"...","name":"exec"}}

event: delta
data: {"delta":"今天"}

event: delta
data: {"delta":"您的工时为"}

event: session_event
data: {"seq":4,"type":"message","data":{"role":"assistant","content":"今天您的工时为..."}}

event: done
data: {"reply":"...","runId":"...","messages":[...],"resultCards":[...]}
```

### 3.2 前端改动（chat.vue）

#### 状态模型调整

```typescript
const streamingMessages = ref<ChatMessageView[]>([]);
const isStreaming = ref(false);
const currentAssistantIdx = ref(-1);
```

#### `sendMessage()` 核心逻辑

1. **发送时**：添加 optimistic user message 到 `streamingMessages`，设置 `isStreaming = true`
2. **收到 `session_event`**：
   - 跳过 seq=1 的 user message（已有 optimistic）
   - `role: "assistant"` + `tool_calls`：创建新的「工具调用」气泡（含 reasoning）
   - `role: "tool"`：创建「工具结果」气泡
   - `role: "assistant"` + content 无 tool_calls：创建/更新「回复文本」气泡，记录 `currentAssistantIdx`
3. **收到 `delta`**：找到 `currentAssistantIdx` 指向的 assistant 消息，追加文本
4. **收到 `done`**：用服务端完整 messages 替换 `streamingMessages`，设置 `isStreaming = false`
5. **显示逻辑**：`isStreaming ? streamingMessages : messages`

#### 渲染效果

```
👤 你: "帮我查一下今天的工时"
🤖 [思考过程] 用户要求查询工时，我需要使用 work-time-check skill...
🤖 [工具调用] exec: cd /path && node scripts/work-time-check.js
📦 [工具结果] work-time-check: {status: "ok", hours: 8.5}
🤖 [思考过程] 获取到了工时数据，整理回复...
🤖 今天您的工时为 8.5 小时，... （逐字出现）
```

每个环节实时渲染，完整展示 AI 的推理链条。

### 3.3 关键实现细节

**如何区分「中间 assistant」和「最终 assistant」：**
- 有 `tool_calls` 的 assistant message = 中间迭代（展示为工具调用卡片）
- 无 `tool_calls` 的 assistant message = 最终回复（接收 delta 填充）
- 最后一个无 tool_calls 的 assistant message 是最终回复

**delta 与 session_event 的时序关系：**
- delta 事件在 LLM 流式输出时**实时**发送（每个 LLM 调用都会产生 delta）
- session_event 在每轮迭代**完成后**发送（assistant message 完整记录后）
- 时序：`delta...delta...delta → session_event(assistant) → session_event(tool) → delta...delta → session_event(assistant)`
- 中间迭代（有 tool_calls 的 assistant）的 content 通常为空（LLM 决定调用工具时不产生文本），delta 主要来自最终回复

**前端处理 delta 的策略：**
- 收到 delta 时，如果当前无「进行中」的 assistant 气泡，创建一个
- 收到 session_event(assistant + tool_calls) 时，将「进行中」气泡转化为工具调用卡片
- 如果中间迭代产生了少量 delta 文本，它会作为工具调用卡片的上下文保留

**错误处理不变**：abort/error 逻辑保持现有实现。

---

## 4. 密钥管理（确认现状）

密钥注入链路已完整打通，无需额外改动：

1. `SecretsRepository.getDecryptedForScope()` 查询并解密
2. `_runTurnCore()` 构建 `envOverlay`
3. `ExecTool.execute()` 将 `envOverlay` merge 到 `process.env`
4. 子进程（Node/Python）自动继承环境变量

Node skills 通过 `process.env.KEY` 读取，Python skills 通过 `os.environ['KEY']` 读取。

---

## 影响分析

| 改动 | 包 | 风险 |
|---|---|---|
| 内置 skills 强制覆盖 | digital-employee | 低 — 仅影响启动流程 |
| 导入同名冲突检查 | digital-employee | 低 — 新增校验 |
| `buildSkillsSummary` 过滤 | core | 低 — 可选参数，向后兼容 |
| `buildSystemPrompt` 传递 skillNames | core | 低 — 利用已有参数 |
| 前端流式渲染重构 | digital-employee | 中 — chat.vue 逻辑重写 |

## 验证计划

1. **Skills 更新**：修改一个内置 skill → 重启 → 验证 workspace 中版本已更新
2. **Skills 可见性**：员工只绑定 1 个 skill → 对话问 "你有哪些技能" → 只回答 1 个
3. **流式渲染**：发送需要工具调用的指令 → 观察 思考→工具调用→工具结果→回复 的完整实时链条
4. **导入冲突**：尝试导入与内置同名的 skill → 应报错
