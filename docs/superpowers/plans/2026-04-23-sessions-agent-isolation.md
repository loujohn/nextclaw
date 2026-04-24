# Sessions Agent Isolation & Employee Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 限制 `sessions_list` / `sessions_history` 只返回当前 agentId 的会话，并提供员工间互相通知的 inbox 机制（`employee` 内部渠道），避免多员工场景下的跨员工数据泄漏。

**Architecture:** 分两个独立可交付的部分。Part A：给 `SessionsListTool` 和 `SessionsHistoryTool` 增加 `setContext({ agentId })` 并在 `loop.ts` 的 `setSessionsToolContext`（将现有 `setSessionsSendToolContext` 扩展）里注入，过滤时只返回属于当前 agentId 的 session。Part B：`sessions_send` 新增一个 early path——只传 `agentId` 不传 `sessionKey` 时直接构造 `employee` 渠道路由，绕过现有复杂的路由解析；`ChannelRuntime` 新增 `handleEmployeeInbound` 处理 `employee` 渠道消息，直接按 `chatId`（即 employee code）分派给对应员工。

**Tech Stack:** TypeScript, Vitest, `@nextclaw/core`（packages/nextclaw-core），`nextclaw-digital-employee`（packages/nextclaw-digital-employee）

---

## Part A：sessions_list / sessions_history agentId 过滤

### Task 1：SessionsListTool 增加 agentId 过滤

**Files:**
- Modify: `packages/nextclaw-core/src/agent/tools/sessions.ts`（`SessionsListTool` 类，约第 194–308 行）
- Create: `packages/nextclaw-core/src/agent/tools/sessions-list.test.ts`

- [ ] **Step 1：写失败测试**

新建 `packages/nextclaw-core/src/agent/tools/sessions-list.test.ts`：

```typescript
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SessionManager } from "../../session/manager.js";
import { SessionsListTool } from "./sessions.js";

const HOME_ENV_KEY = "NEXTCLAW_HOME";

function makeTempHome(): { tempHome: string; cleanup: () => void } {
  const tempHome = mkdtempSync(join(tmpdir(), "nextclaw-sessions-list-test-"));
  return {
    tempHome,
    cleanup: () => rmSync(tempHome, { recursive: true, force: true })
  };
}

describe("SessionsListTool agentId filtering", () => {
  let tempHome: string;
  let cleanup: () => void;
  let previousHome: string | undefined;

  beforeEach(() => {
    previousHome = process.env[HOME_ENV_KEY];
    ({ tempHome, cleanup } = makeTempHome());
    process.env[HOME_ENV_KEY] = tempHome;
  });

  afterEach(() => {
    cleanup();
    if (previousHome === undefined) {
      delete process.env[HOME_ENV_KEY];
    } else {
      process.env[HOME_ENV_KEY] = previousHome;
    }
  });

  function seedSession(sessions: SessionManager, key: string): void {
    const s = sessions.getOrCreate(key);
    sessions.addMessage(s, "user", "hello");
    sessions.save(s);
  }

  it("returns all sessions when no agentId is set", async () => {
    const sessions = new SessionManager(tempHome);
    seedSession(sessions, "agent:alice:dingtalk:acc:group:g1");
    seedSession(sessions, "agent:bob:dingtalk:acc:group:g2");

    const tool = new SessionsListTool(sessions);
    const result = JSON.parse(await tool.execute({})) as { sessions: Array<{ key: string }> };

    const keys = result.sessions.map((s) => s.key);
    expect(keys.some((k) => k.includes("alice"))).toBe(true);
    expect(keys.some((k) => k.includes("bob"))).toBe(true);
  });

  it("returns only own sessions when agentId is set", async () => {
    const sessions = new SessionManager(tempHome);
    seedSession(sessions, "agent:alice:dingtalk:acc:group:g1");
    seedSession(sessions, "agent:bob:dingtalk:acc:group:g2");

    const tool = new SessionsListTool(sessions);
    tool.setContext({ agentId: "alice" });
    const result = JSON.parse(await tool.execute({})) as { sessions: Array<{ key: string }> };

    const keys = result.sessions.map((s) => s.key);
    expect(keys.some((k) => k.includes("alice"))).toBe(true);
    expect(keys.some((k) => k.includes("bob"))).toBe(false);
  });

  it("agentId filter is case-insensitive", async () => {
    const sessions = new SessionManager(tempHome);
    seedSession(sessions, "agent:alice:dingtalk:acc:group:g1");

    const tool = new SessionsListTool(sessions);
    tool.setContext({ agentId: "ALICE" });
    const result = JSON.parse(await tool.execute({})) as { sessions: Array<{ key: string }> };

    expect(result.sessions.length).toBe(1);
  });

  it("does not leak a session whose agentId is a prefix of the filter agentId", async () => {
    // guard against prefix false-positive: "alice" must not match "alice-bot"
    const sessions = new SessionManager(tempHome);
    seedSession(sessions, "agent:alice:dingtalk:acc:group:g1");
    seedSession(sessions, "agent:alice-bot:dingtalk:acc:group:g2");

    const tool = new SessionsListTool(sessions);
    tool.setContext({ agentId: "alice" });
    const result = JSON.parse(await tool.execute({})) as { sessions: Array<{ key: string }> };

    const keys = result.sessions.map((s) => s.key);
    expect(keys.every((k) => k.includes("agent:alice:"))).toBe(true);
    expect(keys.some((k) => k.includes("alice-bot"))).toBe(false);
  });
});
```

- [ ] **Step 2：确认测试失败**

```bash
cd packages/nextclaw-core && npx vitest run src/agent/tools/sessions-list.test.ts
```

预期：FAIL，报 `tool.setContext is not a function`

- [ ] **Step 3：在 `SessionsListTool` 里添加 `setContext` 和过滤逻辑**

在 `packages/nextclaw-core/src/agent/tools/sessions.ts` 的 `SessionsListTool` 类中，添加 context 字段和 `setContext` 方法，并在 `execute` 里插入过滤：

```typescript
// 在 SessionsListTool 类顶部添加：
private agentId: string | undefined = undefined;

setContext(ctx: { agentId?: string }): void {
  this.agentId = ctx.agentId?.trim().toLowerCase() || undefined;
}
```

在 `execute` 方法的 `listSessions()` 调用之后，`.sort(...)` 之前插入过滤（agentId 过滤加在 activeMinutes/kinds 过滤前）：

```typescript
const agentIdFilter = this.agentId;
const sessions = this.sessions
  .listSessions()
  .sort((a, b) => (toTimestamp(b.updated_at) ?? 0) - (toTimestamp(a.updated_at) ?? 0))
  .filter((entry) => {
    // agentId 隔离过滤（新增）
    if (agentIdFilter) {
      const key = String(entry.key ?? "").toLowerCase();
      if (!key.startsWith(`agent:${agentIdFilter}:`)) {
        return false;
      }
    }
    // 原有 activeMinutes 过滤
    if (activeMinutes > 0 && entry.updated_at) {
      const updated = Date.parse(String(entry.updated_at));
      if (Number.isFinite(updated) && now - updated > activeMinutes * 60 * 1000) {
        return false;
      }
    }
    // 原有 kinds 过滤
    if (kinds) {
      const kind = classifySessionKind(String(entry.key ?? ""));
      if (!kinds.has(kind)) {
        return false;
      }
    }
    return true;
  })
  // ... slice / map 原有逻辑不变
```

- [ ] **Step 4：运行测试确认通过**

```bash
cd packages/nextclaw-core && npx vitest run src/agent/tools/sessions-list.test.ts
```

预期：PASS（4 tests）

- [ ] **Step 5：提交**

```bash
git add packages/nextclaw-core/src/agent/tools/sessions.ts \
        packages/nextclaw-core/src/agent/tools/sessions-list.test.ts
git commit -m "feat(core): add agentId scoping to SessionsListTool"
```

---

### Task 2：SessionsHistoryTool 增加 agentId 访问控制

**Files:**
- Modify: `packages/nextclaw-core/src/agent/tools/sessions.ts`（`SessionsHistoryTool` 类，约第 310–372 行）
- Modify: `packages/nextclaw-core/src/agent/tools/sessions-list.test.ts`（追加测试用例）

- [ ] **Step 1：追加失败测试**

在 `sessions-list.test.ts` 末尾添加新的 `describe` 块（复用文件顶部的 imports，但需要新增 `SessionsHistoryTool`）：

```typescript
import { SessionsHistoryTool } from "./sessions.js";

describe("SessionsHistoryTool agentId access control", () => {
  let tempHome: string;
  let cleanup: () => void;
  let previousHome: string | undefined;

  beforeEach(() => {
    previousHome = process.env[HOME_ENV_KEY];
    ({ tempHome, cleanup } = makeTempHome());
    process.env[HOME_ENV_KEY] = tempHome;
  });

  afterEach(() => {
    cleanup();
    if (previousHome === undefined) {
      delete process.env[HOME_ENV_KEY];
    } else {
      process.env[HOME_ENV_KEY] = previousHome;
    }
  });

  it("allows reading own session when agentId is set", async () => {
    const sessions = new SessionManager(tempHome);
    const s = sessions.getOrCreate("agent:alice:dingtalk:acc:group:g1");
    sessions.addMessage(s, "user", "hello");
    sessions.save(s);

    const tool = new SessionsHistoryTool(sessions);
    tool.setContext({ agentId: "alice" });
    const result = JSON.parse(
      await tool.execute({ sessionKey: "agent:alice:dingtalk:acc:group:g1" })
    ) as { messages?: unknown[]; error?: string };

    expect(result.error).toBeUndefined();
    expect(result.messages).toHaveLength(1);
  });

  it("blocks reading another agent session when agentId is set", async () => {
    const sessions = new SessionManager(tempHome);
    const s = sessions.getOrCreate("agent:bob:dingtalk:acc:group:g2");
    sessions.addMessage(s, "user", "secret");
    sessions.save(s);

    const tool = new SessionsHistoryTool(sessions);
    tool.setContext({ agentId: "alice" });
    const result = JSON.parse(
      await tool.execute({ sessionKey: "agent:bob:dingtalk:acc:group:g2" })
    ) as { error?: string };

    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/not found/i);
  });

  it("allows reading any session when agentId is not set (backward compat)", async () => {
    const sessions = new SessionManager(tempHome);
    const s = sessions.getOrCreate("agent:bob:dingtalk:acc:group:g2");
    sessions.addMessage(s, "user", "data");
    sessions.save(s);

    const tool = new SessionsHistoryTool(sessions);
    // 不调用 setContext，模拟 CLI 模式（无隔离需求）
    const result = JSON.parse(
      await tool.execute({ sessionKey: "agent:bob:dingtalk:acc:group:g2" })
    ) as { messages?: unknown[]; error?: string };

    expect(result.error).toBeUndefined();
    expect(result.messages).toHaveLength(1);
  });
});
```

- [ ] **Step 2：确认测试失败**

```bash
cd packages/nextclaw-core && npx vitest run src/agent/tools/sessions-list.test.ts
```

预期：FAIL，`tool.setContext is not a function`

- [ ] **Step 3：在 `SessionsHistoryTool` 里添加 `setContext` 和访问控制**

```typescript
// 在 SessionsHistoryTool 类顶部添加：
private agentId: string | undefined = undefined;

setContext(ctx: { agentId?: string }): void {
  this.agentId = ctx.agentId?.trim().toLowerCase() || undefined;
}
```

在 `execute` 方法里，`sessionKey` 非空检查之后、session 查找之前插入访问控制：

```typescript
// sessionKey 非空检查（原有）
if (!sessionKey) {
  return "Error: sessionKey is required";
}

// agentId 访问控制（新增）
if (this.agentId) {
  const normalizedKey = sessionKey.trim().toLowerCase();
  if (!normalizedKey.startsWith(`agent:${this.agentId}:`)) {
    return `Error: session '${sessionKey}' not found`;
  }
}

// 原有 session 查找逻辑保持不变 ...
let session = this.sessions.getIfExists(sessionKey);
```

- [ ] **Step 4：运行测试确认通过**

```bash
cd packages/nextclaw-core && npx vitest run src/agent/tools/sessions-list.test.ts
```

预期：PASS（全部 7 tests）

- [ ] **Step 5：提交**

```bash
git add packages/nextclaw-core/src/agent/tools/sessions.ts \
        packages/nextclaw-core/src/agent/tools/sessions-list.test.ts
git commit -m "feat(core): add agentId access control to SessionsHistoryTool"
```

---

### Task 3：在 loop.ts 中注入 agentId 到 list/history 工具

**Files:**
- Modify: `packages/nextclaw-core/src/agent/loop.ts`（`setSessionsSendToolContext` 约第 200 行，`processMessage` 约第 620 行和第 846 行）

> **背景：** `this.agentId` 在 `loop.ts:51` 已存在。`setSessionsSendToolContext` 目前只注入 `sessions_send`，把它改名并扩展为同时注入 `sessions_list` 和 `sessions_history`。两个 call site 在 `processMessage`（约第 620 行）和 `processSystemMessage`（约第 846 行）。

- [ ] **Step 1：写失败测试**

在 `sessions-list.test.ts` 末尾追加：

```typescript
describe("AgentLoop injects agentId into sessions_list and sessions_history", () => {
  it("sessions_list context is set with the loop agentId after setSessionsToolContext", () => {
    // 通过 type cast 访问私有成员来验证注入逻辑，避免真实 LLM 调用
    // 这是一个轻量的"配线测试"，验证 loop 正确把 agentId 注入工具

    const sessions = new SessionManager(tempHome);
    // 模拟最小化的 AgentLoop 依赖（不实际调用 LLM）
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AgentLoop } = require("../../agent/loop.js") as typeof import("../../agent/loop.js");
    const { MessageBus } = require("../../bus/queue.js") as typeof import("../../bus/queue.js");
    const { ProviderManager } = require("../../providers/provider_manager.js") as typeof import("../../providers/provider_manager.js");

    const bus = new MessageBus();
    // ProviderManager 最简构造，不需要真实 provider
    const providerManager = new ProviderManager({ defaultProvider: { chat: async () => ({ content: "", toolCalls: [] }), getDefaultModel: () => "test" } as never });

    const loop = new AgentLoop({
      bus,
      providerManager,
      workspace: tempHome,
      sessionManager: sessions,
      agentId: "alice"
    });

    // 直接调用私有方法验证注入
    const loopAny = loop as unknown as {
      setSessionsToolContext: (p: { sessionKey: string; channel: string; chatId: string; handoffDepth: number }) => void;
      tools: { get: (name: string) => { context?: { agentId?: string } } | undefined };
    };

    loopAny.setSessionsToolContext({
      sessionKey: "agent:alice:dingtalk:acc:group:g1",
      channel: "dingtalk",
      chatId: "g1",
      handoffDepth: 0
    });

    const listTool = loopAny.tools.get("sessions_list");
    const historyTool = loopAny.tools.get("sessions_history");
    expect(listTool?.context?.agentId).toBe("alice");
    expect(historyTool?.context?.agentId).toBe("alice");
  });
});
```

- [ ] **Step 2：确认测试失败**

```bash
cd packages/nextclaw-core && npx vitest run src/agent/tools/sessions-list.test.ts
```

预期：FAIL，`loopAny.setSessionsToolContext is not a function`（因为方法还叫 `setSessionsSendToolContext`，且未注入 list/history）

- [ ] **Step 3：修改 loop.ts**

把 `setSessionsSendToolContext` 改名为 `setSessionsToolContext`，并扩展：

```typescript
// loop.ts — 原来的 setSessionsSendToolContext 改为 setSessionsToolContext
private setSessionsToolContext(params: {
  sessionKey: string;
  channel: string;
  chatId: string;
  handoffDepth: number;
}): void {
  // 原有：注入 sessions_send
  const sessionsSendTool = this.tools.get("sessions_send");
  if (sessionsSendTool instanceof SessionsSendTool) {
    sessionsSendTool.setContext({
      currentSessionKey: params.sessionKey,
      currentAgentId: this.agentId,
      channel: params.channel,
      chatId: params.chatId,
      maxPingPongTurns: this.options.config?.session?.agentToAgent?.maxPingPongTurns ?? 0,
      currentHandoffDepth: params.handoffDepth
    });
  }

  // 新增：注入 sessions_list
  const sessionsListTool = this.tools.get("sessions_list");
  if (sessionsListTool instanceof SessionsListTool) {
    sessionsListTool.setContext({ agentId: this.agentId });
  }

  // 新增：注入 sessions_history
  const sessionsHistoryTool = this.tools.get("sessions_history");
  if (sessionsHistoryTool instanceof SessionsHistoryTool) {
    sessionsHistoryTool.setContext({ agentId: this.agentId });
  }
}
```

把 `processMessage`（约第 620 行）和 `processSystemMessage`（约第 846 行）中两处 `setSessionsSendToolContext(` 调用改为 `setSessionsToolContext(`（参数签名不变）。

- [ ] **Step 4：运行测试确认通过**

```bash
cd packages/nextclaw-core && npx vitest run src/agent/tools/sessions-list.test.ts
```

预期：PASS（全部 8 tests）

- [ ] **Step 5：运行全量 core 测试确认无回归**

```bash
cd packages/nextclaw-core && npx vitest run
```

预期：全部通过

- [ ] **Step 6：提交**

```bash
git add packages/nextclaw-core/src/agent/loop.ts
git commit -m "feat(core): inject agentId into sessions list/history tools via setSessionsToolContext"
```

---

## Part B：员工 inbox —— employee 内部渠道

### Task 4：sessions_send 仅凭 agentId 直接发 employee inbox

**Files:**
- Modify: `packages/nextclaw-core/src/agent/tools/sessions.ts`（`SessionsSendTool.execute`，约第 419–580 行）
- Modify: `packages/nextclaw-core/src/agent/tools/sessions-send.test.ts`（追加测试）

> **设计决策：** 当前 `sessions_send` 在没有 `sessionKey` 且没有 `label` 时立即报错（约第 438 行）。新增一条 early path：当且仅当 `agentId` 参数明确指定了与当前 agent 不同的目标，且未提供 `sessionKey` 时，跳过现有路由解析，直接构造 `{ channel: "employee", chatId: targetAgentId }` 路由并发 InboundMessage。这条 path 在现有 "sessionKey or label is required" 检查之前生效。

- [ ] **Step 1：写失败测试**

在 `packages/nextclaw-core/src/agent/tools/sessions-send.test.ts` 末尾追加：

```typescript
describe("SessionsSendTool employee inbox (agentId only)", () => {
  it("delivers to employee channel when only agentId is given", async () => {
    const bus = new MessageBus();
    const sessions = new SessionManager(tempHome);
    // 不创建任何 target session，模拟 B 从未跟 A 说过话

    const tool = new SessionsSendTool(sessions, bus);
    tool.setContext({
      currentAgentId: "alice",
      currentSessionKey: "agent:alice:dingtalk:acc:group:g1",
      channel: "dingtalk",
      chatId: "g1",
      maxPingPongTurns: 2,
      currentHandoffDepth: 0
    });

    const published: import("../../bus/events.js").InboundMessage[] = [];
    // MessageBus.subscribeInbound 如不存在则直接消费后断言
    const originalPublish = bus.publishInbound.bind(bus);
    bus.publishInbound = async (msg) => {
      published.push(msg);
      return originalPublish(msg);
    };

    const result = JSON.parse(
      await tool.execute({
        agentId: "bob",
        message: "请处理报销申请"
        // 注意：没有 sessionKey 也没有 label
      })
    ) as { status: string; dispatched?: string; targetAgentId?: string };

    expect(result.status).toBe("ok");
    expect(result.dispatched).toBe("inbound");
    expect(result.targetAgentId).toBe("bob");
    expect(published).toHaveLength(1);
    expect(published[0]?.channel).toBe("employee");
    expect(published[0]?.chatId).toBe("bob");
  });

  it("still requires sessionKey or label when sending to self", async () => {
    const bus = new MessageBus();
    const sessions = new SessionManager(tempHome);
    const tool = new SessionsSendTool(sessions, bus);
    tool.setContext({ currentAgentId: "alice", maxPingPongTurns: 0, currentHandoffDepth: 0 });

    const result = JSON.parse(
      await tool.execute({ agentId: "alice", message: "hello" })
    ) as { status: string };

    expect(result.status).toBe("error");
  });
});
```

- [ ] **Step 2：确认测试失败**

```bash
cd packages/nextclaw-core && npx vitest run src/agent/tools/sessions-send.test.ts
```

预期：第一个新 test FAIL（返回 `error: sessionKey or label is required`）

- [ ] **Step 3：在 `execute` 方法开头添加 employee inbox early path**

在 `SessionsSendTool.execute` 里，`message` 非空检查之后、现有 `if (!sessionKey)` 报错之前插入：

```typescript
const message = String(params.message ?? params.content ?? "");
if (!message) {
  return JSON.stringify({ runId, status: "error", error: "message is required" }, null, 2);
}

// ── employee inbox early path（新增）──────────────────────────────────────
// 仅传 agentId、不传 sessionKey / label 时，直接投递到目标员工的 employee 渠道 inbox
// 用途：员工 A 通知员工 B 执行任务，A 不需要知道 B 在哪个渠道活跃
const callerAgentId = this.context.currentAgentId;
const inboxTargetId = targetAgentParam; // targetAgentParam 已在前面解析
if (inboxTargetId && !sessionKeyParam && !labelParam && callerAgentId && inboxTargetId !== callerAgentId) {
  const inbound: InboundMessage = {
    channel: "employee",
    chatId: inboxTargetId,
    senderId: callerAgentId ? `agent:${callerAgentId}` : "agent:unknown",
    content: message,
    timestamp: new Date(),
    attachments: [],
    metadata: {
      source: "sessions_send",
      target_agent_id: inboxTargetId,
      ...(callerAgentId ? { agent_handoff_from: callerAgentId } : {})
    }
  };
  await this.bus.publishInbound(inbound);
  return JSON.stringify(
    { runId, status: "ok", dispatched: "inbound", targetAgentId: inboxTargetId },
    null,
    2
  );
}
// ── end employee inbox early path ─────────────────────────────────────────

// 原有逻辑：sessionKey or label is required
if (!sessionKey) {
  // ...
}
```

- [ ] **Step 4：运行测试确认通过**

```bash
cd packages/nextclaw-core && npx vitest run src/agent/tools/sessions-send.test.ts
```

预期：PASS（全部原有 + 新增 2 tests）

- [ ] **Step 5：提交**

```bash
git add packages/nextclaw-core/src/agent/tools/sessions.ts \
        packages/nextclaw-core/src/agent/tools/sessions-send.test.ts
git commit -m "feat(core): sessions_send delivers to employee inbox when only agentId is given"
```

---

### Task 5：ChannelRuntime 处理 employee 渠道消息

**Files:**
- Modify: `packages/nextclaw-digital-employee/server/runtime/channel-runtime.ts`（`handleInbound` 约第 158 行，新增 `handleEmployeeInbound` 私有方法）
- Create: `packages/nextclaw-digital-employee/tests/employee-channel-routing.test.ts`

> **Session key 格式：** inbox session key 为 `agent:{code}:employee:direct:{code}`，匹配 `buildSessionKey` 的 per-channel-peer 模式（5 段：`agent:{id}:{channel}:direct:{peerId}`），channel=employee，peerId=code。`parseAgentSessionRoute` 能正确解析此格式（parts[3]="direct" 匹配第 59 行分支）。
>
> **关于 `publishResponse: false`：** employee inbox 采用 fire-and-forget 语义——B 收到任务后自主决定通过自己绑定的渠道（如 DingTalk 群）响应，而不是原路回传给 A。这与 B 正常处理 DingTalk 消息的行为一致；A 若需要知道 B 的执行结果，应通过 B 主动调用 `sessions_send` 回传。

- [ ] **Step 1：写失败测试**

新建 `packages/nextclaw-digital-employee/tests/employee-channel-routing.test.ts`：

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { InboundMessage } from "@nextclaw/core";

// 直接测试私有方法 handleEmployeeInbound 通过 type-cast，避免启动完整 runLoop
// 参考 tests/employee-run-service.test.ts 的 mock 模式

describe("ChannelRuntime.handleEmployeeInbound", () => {
  let tempHome: string;

  beforeEach(() => {
    tempHome = mkdtempSync(join(tmpdir(), "nextclaw-emp-channel-test-"));
  });

  afterEach(() => {
    rmSync(tempHome, { recursive: true, force: true });
  });

  it("routes employee channel message to target employee engine by code", async () => {
    const mockEngine = { handleInbound: vi.fn(async () => null) };
    const mockGateway = {
      homeDir: tempHome,
      workspaceDir: tempHome,
      messageBus: { publishOutbound: vi.fn() },
      runtimeConfig: {
        bindings: [],
        agents: { list: [], defaults: { model: "test", maxToolIterations: 5 } },
        session: {}
      },
      getOrCreateEngineWithSecrets: vi.fn(async () => mockEngine),
      applyRuntimeConfig: vi.fn(),
      sessions: { getOrCreate: vi.fn(() => ({ messages: [], metadata: {} })) }
    };

    const financeEmployee = {
      id: "emp-finance",
      code: "finance-bot",
      name: "财务助手",
      model: "",
      systemPrompt: "",
      description: "",
      status: "active",
      departmentId: null,
      webhookEnabled: false,
      webhookSecret: null,
      createdByUserId: null,
      updatedByUserId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const mockEmployeeRepo = {
      getByCode: vi.fn(async (code: string) =>
        code === "finance-bot" ? financeEmployee : null
      ),
      getById: vi.fn(async () => null)
    };

    const mockSkillRepo = { listByEmployeeId: vi.fn(async () => []) };

    // 动态导入避免模块副作用
    const { DigitalEmployeeChannelRuntime } = await import(
      "../server/runtime/channel-runtime.js"
    );

    const runtime = new DigitalEmployeeChannelRuntime({
      gateway: mockGateway as never,
      employeeRepo: mockEmployeeRepo as never,
      employeeSkillRepo: mockSkillRepo as never,
      loadState: async () => ({
        config: mockGateway.runtimeConfig as never,
        extensionRegistry: { tools: [], channels: [], diagnostics: [], engines: [] },
        pluginRegistry: { channels: [] }
      })
    });

    const message: InboundMessage = {
      channel: "employee",
      chatId: "finance-bot",
      senderId: "agent:hr-bot",
      content: "请处理这个报销申请",
      timestamp: new Date(),
      attachments: [],
      metadata: { target_agent_id: "finance-bot" }
    };

    // 直接调用私有方法
    await (runtime as unknown as {
      handleEmployeeInbound: (msg: InboundMessage) => Promise<void>;
    }).handleEmployeeInbound(message);

    expect(mockEmployeeRepo.getByCode).toHaveBeenCalledWith("finance-bot");
    expect(mockGateway.getOrCreateEngineWithSecrets).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "finance-bot" })
    );
    expect(mockEngine.handleInbound).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionKey: "agent:finance-bot:employee:direct:finance-bot",
        publishResponse: false
      })
    );
  });

  it("logs warning and returns when target employee code does not exist", async () => {
    const mockGateway = {
      homeDir: tempHome,
      workspaceDir: tempHome,
      messageBus: { publishOutbound: vi.fn() },
      runtimeConfig: { bindings: [], agents: { list: [], defaults: { model: "test" } }, session: {} },
      getOrCreateEngineWithSecrets: vi.fn(),
      applyRuntimeConfig: vi.fn()
    };
    const mockEmployeeRepo = { getByCode: vi.fn(async () => null), getById: vi.fn(async () => null) };
    const mockSkillRepo = { listByEmployeeId: vi.fn(async () => []) };

    const { DigitalEmployeeChannelRuntime } = await import("../server/runtime/channel-runtime.js");
    const runtime = new DigitalEmployeeChannelRuntime({
      gateway: mockGateway as never,
      employeeRepo: mockEmployeeRepo as never,
      employeeSkillRepo: mockSkillRepo as never,
      loadState: async () => ({
        config: mockGateway.runtimeConfig as never,
        extensionRegistry: { tools: [], channels: [], diagnostics: [], engines: [] },
        pluginRegistry: { channels: [] }
      })
    });

    const message: InboundMessage = {
      channel: "employee",
      chatId: "nonexistent-bot",
      senderId: "agent:hr-bot",
      content: "hello",
      timestamp: new Date(),
      attachments: [],
      metadata: {}
    };

    // 不应 throw，只静默返回
    await expect(
      (runtime as unknown as { handleEmployeeInbound: (msg: InboundMessage) => Promise<void> })
        .handleEmployeeInbound(message)
    ).resolves.toBeUndefined();

    expect(mockGateway.getOrCreateEngineWithSecrets).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2：确认测试失败**

```bash
cd packages/nextclaw-digital-employee && npx vitest run tests/employee-channel-routing.test.ts
```

预期：FAIL，`runtime.handleEmployeeInbound is not a function`

- [ ] **Step 3：在 `channel-runtime.ts` 里添加 `handleEmployeeInbound` 和 early return**

```typescript
// handleInbound 方法最开头添加 early return：
private async handleInbound(message: InboundMessage): Promise<void> {
  // employee 内部渠道：直接按 chatId（employee code）分派，不走 routeResolver
  if (message.channel === "employee") {
    await this.handleEmployeeInbound(message);
    return;
  }
  // 原有逻辑不变 ...
}

// 新增私有方法：
private async handleEmployeeInbound(message: InboundMessage): Promise<void> {
  const targetCode = message.chatId;
  const employee = await this.options.employeeRepo.getByCode(targetCode);
  if (!employee) {
    log.warn(`employee inbox: 目标员工不存在 code=${targetCode}`);
    return;
  }

  // inbox session key: agent:{code}:employee:direct:{code}
  // 匹配 buildSessionKey per-channel-peer 格式，channel=employee
  const sessionKey = `agent:${employee.code}:employee:direct:${employee.code}`;
  log.info(`employee inbox 分派 code=${employee.code} session=${sessionKey}`);

  const { workspace } = await prepareEmployeeRuntime({
    employee,
    employeeSkillRepo: this.options.employeeSkillRepo,
    skillInstallationRepo: this.options.skillInstallationRepo,
    homeDir: this.gateway.homeDir,
    workspaceDir: this.gateway.workspaceDir
  });

  const engine = await this.gateway.getOrCreateEngineWithSecrets({
    agentId: employee.code,
    employeeId: employee.id,
    workspace,
    model: employee.model || undefined
  });

  // publishResponse: false — fire-and-forget 语义
  // B 执行任务后通过自己绑定的渠道（如 DingTalk）主动响应，不原路回传
  await engine.handleInbound({
    message,
    sessionKey,
    publishResponse: false
  });
}
```

- [ ] **Step 4：运行测试确认通过**

```bash
cd packages/nextclaw-digital-employee && npx vitest run tests/employee-channel-routing.test.ts
```

预期：PASS（2 tests）

- [ ] **Step 5：运行全量 digital-employee 测试确认无回归**

```bash
cd packages/nextclaw-digital-employee && npx vitest run
```

预期：全部通过

- [ ] **Step 6：提交**

```bash
git add packages/nextclaw-digital-employee/server/runtime/channel-runtime.ts \
        packages/nextclaw-digital-employee/tests/employee-channel-routing.test.ts
git commit -m "feat(dm): route employee inbox channel messages directly by employee code"
```

---

## 交付顺序与独立性

| 顺序 | 任务 | 独立可交付 | 说明 |
|------|------|-----------|------|
| 1 | Task 1–3（Part A） | **是** | 独立 PR，修复数据隔离 |
| 2 | Task 4–5（Part B） | 依赖 Part A 已合并 | Part A 完成后方可交付，否则 B 发给 A 时 A 仍会看到 B 的 sessions |
