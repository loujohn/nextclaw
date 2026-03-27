# Digital Employee 三项修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复内置 skills 更新机制、skill 可见性过滤、流式聊天实时渲染三个问题。

**Architecture:** 三个独立方向可并行实施。A（Skills 更新+可见性）改动 `@nextclaw/core` 和 `@nextclaw/digital-employee`；B（流式渲染）仅改前端 `chat.vue`。每个方向可独立交付和验证。

**Tech Stack:** TypeScript, Vue 3 Composition API, Nuxt 4, H3 EventStream (SSE), `@nextclaw/core` SkillsLoader

**Spec:** `docs/superpowers/specs/2026-03-27-digital-employee-three-fixes-design.md`

---

## Phase A: Skills 系统修复

### Task A1: `seedBuiltinSkills()` 强制覆盖

**Files:**
- Modify: `packages/nextclaw-digital-employee/server/engine/NextclawEngineGateway.ts:149-167`

- [ ] **Step 1: 修改 `seedBuiltinSkills` 移除跳过检查**

将现有的 `seedBuiltinSkills` 函数中的跳过逻辑改为强制覆盖：

```typescript
function seedBuiltinSkills(workspaceDir: string): Set<string> {
  const builtinNames = new Set<string>();
  const builtinSkillsDir = resolveBuiltinSkillsDir();
  if (!builtinSkillsDir) {
    return builtinNames;
  }
  const workspaceSkillsDir = join(workspaceDir, "skills");
  mkdirSync(workspaceSkillsDir, { recursive: true });
  for (const entry of readdirSync(builtinSkillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    builtinNames.add(entry.name);
    const sourceDir = join(builtinSkillsDir, entry.name);
    const targetDir = join(workspaceSkillsDir, entry.name);
    cpSync(sourceDir, targetDir, { recursive: true, force: true });
  }
  return builtinNames;
}
```

注意：函数返回值从 `void` 改为 `Set<string>`（内置 skill 名称集合），后续 Task A3 需要用到。

- [ ] **Step 2: 在 `NextclawEngineGateway` 构造函数中保存 builtinNames**

在 class 中新增属性并在构造函数中赋值：

```typescript
private readonly builtinSkillNames: Set<string>;

// 在构造函数中：
this.builtinSkillNames = seedBuiltinSkills(this.workspaceDir);
```

替换原有的 `seedBuiltinSkills(this.workspaceDir);` 调用。

- [ ] **Step 3: 验证 build**

Run: `pnpm -C packages/nextclaw-digital-employee build`
Expected: 编译成功

- [ ] **Step 4: Commit**

```bash
git add packages/nextclaw-digital-employee/server/engine/NextclawEngineGateway.ts
git commit -m "feat(digital-employee): force-overwrite builtin skills on startup"
```

---

### Task A2: `seed-skills.ts` 强制覆盖

**Files:**
- Modify: `packages/nextclaw-digital-employee/server/plugins/seed-skills.ts:27`

- [ ] **Step 1: 移除跳过检查，改为强制覆盖**

删除第 27 行的 `if (existsSync(join(installPath, "SKILL.md"))) { continue; }` 检查。

开发模式 `cpSync` 调用加上 `force: true`：

```typescript
cpSync(srcPath, installPath, { recursive: true, force: true });
```

生产模式（serverAssets）：在写入前先清理目录：

```typescript
rmSync(installPath, { recursive: true, force: true });
mkdirSync(installPath, { recursive: true });
```

需要在文件头部的 import 中加入 `rmSync`（如果还没有的话）。

- [ ] **Step 2: 验证 build**

Run: `pnpm -C packages/nextclaw-digital-employee build`
Expected: 编译成功

- [ ] **Step 3: Commit**

```bash
git add packages/nextclaw-digital-employee/server/plugins/seed-skills.ts
git commit -m "feat(digital-employee): force-overwrite custom skills on startup via seed-skills plugin"
```

---

### Task A3: 导入时拒绝内置同名冲突

**Files:**
- Modify: `packages/nextclaw-digital-employee/server/engine/NextclawEngineGateway.ts` — `importFromLocalPath()` 和 `importFromGit()`

- [ ] **Step 1: 在 `importFromLocalPath` 中添加冲突检查**

在解析出 `skillName` 后（第 369 行之后），添加检查：

```typescript
if (this.builtinSkillNames.has(skillName)) {
  throw new Error(`Cannot import skill "${skillName}" — conflicts with built-in skill`);
}
```

- [ ] **Step 2: 在 `importFromGit` 中添加冲突检查**

`importFromGit` 最终调用 `importFromLocalPath`，已包含检查，无需额外处理。验证调用链即可。

- [ ] **Step 3: 验证 build**

Run: `pnpm -C packages/nextclaw-digital-employee build`
Expected: 编译成功

- [ ] **Step 4: Commit**

```bash
git add packages/nextclaw-digital-employee/server/engine/NextclawEngineGateway.ts
git commit -m "feat(digital-employee): reject skill imports that conflict with builtin names"
```

---

### Task A4: `buildSkillsSummary()` 可见性过滤

**Files:**
- Modify: `packages/nextclaw-core/src/agent/skills.ts:104`
- Modify: `packages/nextclaw-core/src/agent/context.ts:112`

- [ ] **Step 1: 修改 `buildSkillsSummary` 签名和逻辑**

在 `packages/nextclaw-core/src/agent/skills.ts` 中，将 `buildSkillsSummary()` 改为：

```typescript
buildSkillsSummary(filterNames?: string[]): string {
  let allSkills = this.listSkills(false);
  if (filterNames && filterNames.length > 0) {
    const nameSet = new Set(filterNames);
    allSkills = allSkills.filter((s) => nameSet.has(s.name));
  }
  if (!allSkills.length) {
    return "";
  }
  // ... 其余逻辑保持不变
```

- [ ] **Step 2: 在 `buildSystemPrompt` 中传递 skillNames**

在 `packages/nextclaw-core/src/agent/context.ts` 中，将第 112 行：

```typescript
const skillsSummary = this.skills.buildSkillsSummary();
```

改为：

```typescript
const skillsSummary = this.skills.buildSkillsSummary(skillNames);
```

- [ ] **Step 3: 验证 core build**

Run: `pnpm -C packages/nextclaw-core build`
Expected: 编译成功，无类型错误

- [ ] **Step 4: 验证 digital-employee build**

Run: `pnpm -C packages/nextclaw-digital-employee build`
Expected: 编译成功

- [ ] **Step 5: Commit**

```bash
git add packages/nextclaw-core/src/agent/skills.ts packages/nextclaw-core/src/agent/context.ts
git commit -m "feat(core): filter buildSkillsSummary by requested skill names for agent visibility"
```

---

## Phase B: 流式实时渲染

### Task B1: 前端流式渲染重构

**Files:**
- Modify: `packages/nextclaw-digital-employee/app/pages/employees/[id]/chat.vue`

- [ ] **Step 1: 添加流式状态变量**

在 `<script setup>` 中已有状态之后，添加：

```typescript
const streamingMessages = ref<ChatMessageView[]>([]);
const isStreaming = ref(false);
```

- [ ] **Step 2: 重写 `sendMessage` 函数**

替换整个 `sendMessage` 函数。核心变化：

1. 用 `streamingMessages` 替代手动创建的 `assistantMsg`
2. 处理 `session_event` 事件：根据 `data.role` 动态添加消息气泡
3. `delta` 事件追加到最后一个 assistant 消息
4. `done` 事件时用服务端完整数据替换

```typescript
async function sendMessage(input = draft.value) {
  if (!input.trim()) return;
  sending.value = true;
  isStreaming.value = true;
  errorMessage.value = "";
  abortController.value = new AbortController();
  
  streamingMessages.value = [
    ...messages.value,
    { role: "user", content: input, timestamp: new Date().toISOString() }
  ];
  draft.value = "";
  if (textareaEl.value) textareaEl.value.style.height = "auto";

  try {
    const response = await fetch(`/api/employees/${employeeId.value}/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: input }),
      signal: abortController.value.signal
    });

    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let pendingAssistantIdx = -1;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        if (!part.trim()) continue;
        const events = parseSSEChunk(part + "\n\n");
        for (const sse of events) {
          if (sse.event === "session_event") {
            const evt = JSON.parse(sse.data);
            const d = evt.data;
            if (!d || !d.role) continue;

            if (d.role === "user") continue;

            if (d.role === "assistant") {
              const toolCalls = Array.isArray(d.tool_calls) && d.tool_calls.length > 0
                ? d.tool_calls.map((tc: Record<string, unknown>) => ({
                    id: String(tc.id ?? ""),
                    name: String((tc.function as Record<string, unknown>)?.name ?? tc.name ?? ""),
                    arguments: typeof (tc.function as Record<string, unknown>)?.arguments === "string"
                      ? String((tc.function as Record<string, unknown>).arguments)
                      : JSON.stringify(tc.arguments ?? {})
                  }))
                : undefined;
              const reasoning = typeof d.reasoning_content === "string" && d.reasoning_content.trim()
                ? d.reasoning_content
                : undefined;

              if (pendingAssistantIdx >= 0) {
                const pending = streamingMessages.value[pendingAssistantIdx];
                if (pending) {
                  pending.toolCalls = toolCalls;
                  pending.reasoning = reasoning;
                  pending.content = typeof d.content === "string" ? d.content : (pending.content || "");
                }
                if (toolCalls) {
                  pendingAssistantIdx = -1;
                }
              } else {
                const msg: ChatMessageView = {
                  role: "assistant",
                  content: typeof d.content === "string" ? d.content : "",
                  timestamp: d.timestamp ?? new Date().toISOString(),
                  ...(toolCalls ? { toolCalls } : {}),
                  ...(reasoning ? { reasoning } : {})
                };
                streamingMessages.value = [...streamingMessages.value, msg];
                if (!toolCalls) {
                  pendingAssistantIdx = streamingMessages.value.length - 1;
                }
              }
            } else if (d.role === "tool") {
              const msg: ChatMessageView = {
                role: "tool",
                content: typeof d.content === "string" ? d.content : "",
                timestamp: d.timestamp ?? new Date().toISOString(),
                toolCallId: typeof d.tool_call_id === "string" ? d.tool_call_id : undefined,
                toolName: typeof d.name === "string" ? d.name : undefined
              };
              streamingMessages.value = [...streamingMessages.value, msg];
            }
          } else if (sse.event === "delta") {
            const parsed = JSON.parse(sse.data);
            if (pendingAssistantIdx < 0) {
              const msg: ChatMessageView = {
                role: "assistant",
                content: parsed.delta,
                timestamp: new Date().toISOString()
              };
              streamingMessages.value = [...streamingMessages.value, msg];
              pendingAssistantIdx = streamingMessages.value.length - 1;
            } else {
              const target = streamingMessages.value[pendingAssistantIdx];
              if (target) {
                target.content = (target.content || "") + parsed.delta;
                streamingMessages.value = [...streamingMessages.value];
              }
            }
          } else if (sse.event === "done") {
            const parsed = JSON.parse(sse.data);
            resultCards.value = parsed.resultCards ?? [];
            lastRunId.value = parsed.runId ?? "";
            messages.value = (parsed.messages ?? []).filter(
              (m: ChatMessageView) => m.content?.trim() || m.toolCalls?.length || m.role === "tool"
            );
          } else if (sse.event === "error") {
            const parsed = JSON.parse(sse.data);
            errorMessage.value = parsed.message;
          }
        }
      }
    }

    isStreaming.value = false;
    await Promise.all([refresh(), refreshEmployee(), refreshHistory()]);
  } catch (error) {
    const e = error as Error & { cause?: Error };
    const isAbort =
      e?.name === "AbortError" ||
      e?.cause?.name === "AbortError" ||
      (typeof e?.message === "string" && e.message.toLowerCase().includes("aborted"));
    if (isAbort) {
      draft.value = input;
    } else {
      errorMessage.value = e instanceof Error ? e.message : String(e);
    }
  } finally {
    sending.value = false;
    isStreaming.value = false;
    abortController.value = null;
    streamingMessages.value = [];
  }
}
```

- [ ] **Step 3: 更新模板中的消息源**

将模板中的 `messages` 引用改为计算属性，在流式期间使用 `streamingMessages`：

```typescript
const displayMessages = computed(() =>
  isStreaming.value && streamingMessages.value.length > 0
    ? streamingMessages.value
    : messages.value
);
```

在 `<template>` 中将 `v-for="(msg, i) in messages"` 改为 `v-for="(msg, i) in displayMessages"`。

- [ ] **Step 4: 验证 build**

Run: `pnpm -C packages/nextclaw-digital-employee build`
Expected: 编译成功

- [ ] **Step 5: Commit**

```bash
git add packages/nextclaw-digital-employee/app/pages/employees/\[id\]/chat.vue
git commit -m "feat(digital-employee): real-time streaming chat with thinking/tool-call/reply rendering"
```

---

## 验证清单（全流程冒烟）

- [ ] **Phase A 冒烟 - Skills 更新**: 修改一个内置 skill 的 SKILL.md → 重启 dev server → 检查 workspace/skills/ 下对应文件已更新
- [ ] **Phase A 冒烟 - Skills 可见性**: 员工仅绑定 1 个 skill → 对话问 "你有哪些技能" → agent 只回答绑定的那个
- [ ] **Phase A 冒烟 - 导入冲突**: 尝试导入名为 "dingtalk-notify" 的外部 skill → 应报错
- [ ] **Phase B 冒烟 - 流式渲染**: 发送需要工具调用的指令 → 观察实时渲染：思考→工具调用→工具结果→最终回复逐字出现
