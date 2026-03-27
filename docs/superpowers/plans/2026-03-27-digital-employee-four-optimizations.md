# Digital Employee 四项优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 skill 启用/发现机制、去除 workspace symlink、实现流式聊天、新增 secrets 管理。

**Architecture:** 三个独立方向按依赖顺序实施：A（Skill 系统）→ B（流式聊天）→ C（Secrets），每个方向可独立交付和验证。改动集中在 `@nextclaw/core`（最小改动）和 `@nextclaw/digital-employee`。

**Tech Stack:** TypeScript, Nuxt 4, H3 EventStream (SSE), Vue 3 Composition API, Knex/SQLite, Node.js crypto (AES-256)

**Spec:** `docs/superpowers/specs/2026-03-27-digital-employee-four-optimizations-design.md`

---

## Phase A: Skill 系统重构

### Task A1: `SkillsLoader.getSkillDir()` 新增方法

**Files:**
- Modify: `packages/nextclaw-core/src/agent/skills.ts`

- [ ] **Step 1: 在 `SkillsLoader` class 中新增 `getSkillDir` 方法**

在 `loadSkill()` 方法之后添加：

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

- [ ] **Step 2: 修改 `loadSkillsForContext()` 注入绝对路径**

替换现有的 `loadSkillsForContext` 方法：

```typescript
loadSkillsForContext(skillNames: string[]): string {
  const parts: string[] = [];
  for (const name of skillNames) {
    const content = this.loadSkill(name);
    if (content) {
      const skillDir = this.getSkillDir(name);
      const locationHint = skillDir
        ? `\n\n**Skill Directory**: \`${skillDir}\`\n(Execute scripts from this directory, e.g. \`cd ${skillDir} && node scripts/xxx.js\`)\n`
        : "";
      parts.push(`### Skill: ${name}${locationHint}\n\n${this.stripFrontmatter(content)}`);
    }
  }
  return parts.length ? parts.join("\n\n---\n\n") : "";
}
```

- [ ] **Step 3: 验证 nextclaw-core build**

Run: `pnpm -C packages/nextclaw-core build`
Expected: 编译成功，无错误

- [ ] **Step 4: Commit**

```bash
git add packages/nextclaw-core/src/agent/skills.ts
git commit -m "feat(core): inject skill directory absolute path in loadSkillsForContext"
```

---

### Task A2: 全局启用的 Skill 自动可用

**Files:**
- Modify: `packages/nextclaw-digital-employee/server/services/employee-runtime-preparation.ts`

- [ ] **Step 1: 修改 `prepareEmployeeRuntime` 逻辑**

替换整个函数体为：

```typescript
export async function prepareEmployeeRuntime(params: {
  employee: EmployeeView;
  employeeSkillRepo: EmployeeSkillRepository;
  skillInstallationRepo?: SkillInstallationRepository;
  homeDir: string;
  workspaceDir: string;
}): Promise<{
  workspace: string;
  skillNames: string[];
}> {
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
    .filter((skill) => skill.enabled && !disabledGlobally.has(skill.skillName))
    .map((skill) => skill.skillName);

  const skillNames = [...new Set([...boundSkills, ...globallyEnabled])];

  const workspace = ensureEmployeeWorkspace(
    params.homeDir,
    {
      code: params.employee.code,
      name: params.employee.name,
      description: params.employee.description,
      systemPrompt: params.employee.systemPrompt
    },
    params.workspaceDir
  );

  return { workspace, skillNames };
}
```

- [ ] **Step 2: 更新相关测试**

Modify: `packages/nextclaw-digital-employee/tests/skill-import-and-run-service.test.ts`

确保测试覆盖：全局启用的 skill 自动出现在 `skillNames` 中。

- [ ] **Step 3: 运行测试**

Run: `pnpm -C packages/nextclaw-digital-employee test`
Expected: 所有测试通过

- [ ] **Step 4: Commit**

```bash
git add packages/nextclaw-digital-employee/server/services/employee-runtime-preparation.ts
git add packages/nextclaw-digital-employee/tests/skill-import-and-run-service.test.ts
git commit -m "feat(digital-employee): globally enabled skills auto-available to all employees"
```

---

### Task A3: 去除 symlink 机制

**Files:**
- Modify: `packages/nextclaw-digital-employee/server/engine/employee-workspace.ts`

- [ ] **Step 1: 删除 `linkGlobalSkills` 函数**

删除整个 `linkGlobalSkills` 函数（第 93-109 行左右）。

- [ ] **Step 2: 从 `ensureEmployeeWorkspace` 中移除调用**

在 `ensureEmployeeWorkspace` 函数中删除 `linkGlobalSkills(wsDir, globalWorkspaceDir);` 这一行。

- [ ] **Step 3: 验证 build**

Run: `pnpm -C packages/nextclaw-digital-employee build`
Expected: 编译成功

- [ ] **Step 4: 运行全部测试**

Run: `pnpm -C packages/nextclaw-digital-employee test`
Expected: 所有测试通过

- [ ] **Step 5: Commit**

```bash
git add packages/nextclaw-digital-employee/server/engine/employee-workspace.ts
git commit -m "refactor(digital-employee): remove skill symlink mechanism, rely on additionalSkillsDirs"
```

---

## Phase B: 流式聊天

### Task B1: Gateway 层重构 + 流式支持

**Files:**
- Modify: `packages/nextclaw-digital-employee/server/engine/NextclawEngineGateway.ts`

- [ ] **Step 1: 提取 `_runTurnCore` 私有方法**

在 `NextclawEngineGateway` class 中，将 `runEmployeeTurn` 的逻辑提取为：

```typescript
private async _runTurnCore(params: RunEmployeeTurnParams & {
  onAssistantDelta?: (delta: string) => void;
  onSessionEvent?: (event: SessionEvent) => void;
  abortSignal?: AbortSignal;
}): Promise<RunEmployeeTurnResult> {
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
    }
  });
  const historyCountAfter = this.sessionManager.getHistory(session).length;
  if (historyCountAfter === historyCountBefore) {
    this.sessionManager.addMessage(session, "user", params.message);
    this.sessionManager.addMessage(session, "assistant", reply);
  }
  return { sessionKey, reply, events };
}
```

- [ ] **Step 2: 重构 `runEmployeeTurn` 调用 `_runTurnCore`**

```typescript
async runEmployeeTurn(params: RunEmployeeTurnParams): Promise<RunEmployeeTurnResult> {
  return this._runTurnCore(params);
}
```

- [ ] **Step 3: 新增 `runEmployeeTurnStream` 方法**

```typescript
async runEmployeeTurnStream(params: RunEmployeeTurnParams & {
  onAssistantDelta?: (delta: string) => void;
  onSessionEvent?: (event: SessionEvent) => void;
  abortSignal?: AbortSignal;
}): Promise<RunEmployeeTurnResult> {
  return this._runTurnCore(params);
}
```

需要在文件顶部从 `@nextclaw/core` 引入 `SessionEvent` 类型（如果尚未引入）。

- [ ] **Step 4: 验证 build**

Run: `pnpm -C packages/nextclaw-digital-employee build`
Expected: 编译成功

- [ ] **Step 5: 运行测试确保无回归**

Run: `pnpm -C packages/nextclaw-digital-employee test`
Expected: 所有测试通过

- [ ] **Step 6: Commit**

```bash
git add packages/nextclaw-digital-employee/server/engine/NextclawEngineGateway.ts
git commit -m "refactor(digital-employee): extract _runTurnCore, add runEmployeeTurnStream"
```

---

### Task B2: Service 层流式方法

**Files:**
- Modify: `packages/nextclaw-digital-employee/server/services/employee-run-service.ts`

- [ ] **Step 1: 新增 `runEmployeeTurnStream` 方法**

在 `EmployeeRunService` class 中新增：

```typescript
async runEmployeeTurnStream(params: {
  employeeId: string;
  message: string;
  triggerType: string;
  triggerSource: string;
  onAssistantDelta?: (delta: string) => void;
  onSessionEvent?: (event: import("@nextclaw/core").SessionEvent) => void;
  abortSignal?: AbortSignal;
}): Promise<EmployeeTurnResult> {
  const employee = await this.employeeRepo.getById(params.employeeId);
  if (!employee) {
    throw new Error(`Employee not found: ${params.employeeId}`);
  }

  const { workspace, skillNames } = await prepareEmployeeRuntime({
    employee,
    employeeSkillRepo: this.employeeSkillRepo,
    skillInstallationRepo: this.skillInstallationRepo,
    homeDir: this.gateway.homeDir,
    workspaceDir: this.gateway.workspaceDir
  });

  const run = await this.runRepo.create({
    employeeId: employee.id,
    triggerType: params.triggerType,
    triggerSource: params.triggerSource
  });

  try {
    const result = await this.gateway.runEmployeeTurnStream({
      employeeId: employee.id,
      agentId: employee.code,
      workspace,
      message: params.message,
      model: employee.model || undefined,
      requestedSkills: skillNames.length > 0 ? skillNames : undefined,
      onAssistantDelta: params.onAssistantDelta,
      onSessionEvent: params.onSessionEvent,
      abortSignal: params.abortSignal
    });
    const messages = this.gateway.getSessionHistory(result.sessionKey);
    const resultCards = buildChatResultCards(result.reply);
    await this.runRepo.appendEvents(
      run.id,
      result.events.map((event) => ({
        eventType: event.type,
        payload: event.data
      }))
    );
    await this.runRepo.complete(run.id, {
      status: "completed",
      summary: result.reply,
      result: { reply: result.reply, sessionKey: result.sessionKey, messages, resultCards, runSummary: result.reply }
    });
    return {
      runId: run.id,
      reply: result.reply,
      sessionKey: result.sessionKey,
      messages,
      resultCards,
      runSummary: result.reply
    };
  } catch (error) {
    await this.runRepo.complete(run.id, {
      status: "failed",
      summary: String(error),
      result: { error: String(error) }
    });
    throw error;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/nextclaw-digital-employee/server/services/employee-run-service.ts
git commit -m "feat(digital-employee): add runEmployeeTurnStream to EmployeeRunService"
```

---

### Task B3: SSE 端点

**Files:**
- Create: `packages/nextclaw-digital-employee/server/api/employees/[id]/chat/stream.post.ts`

- [ ] **Step 1: 创建 SSE 端点**

```typescript
import { createError, createEventStream, getRouterParam, readBody } from "h3";
import { getPlatformContext } from "../../../../runtime/platform-context";

type ChatBody = {
  message?: string;
};

export default defineEventHandler(async (event) => {
  const employeeId = getRouterParam(event, "id") ?? "";
  const body = await readBody<ChatBody>(event);
  const message = body?.message?.trim() ?? "";
  if (!message) {
    throw createError({ statusCode: 400, statusMessage: "message is required" });
  }

  const ctx = await getPlatformContext();
  const eventStream = createEventStream(event);
  const abortController = new AbortController();

  event.node.req.on("close", () => {
    abortController.abort();
  });

  (async () => {
    try {
      const result = await ctx.employeeRunService.runEmployeeTurnStream({
        employeeId,
        message,
        triggerType: "manual",
        triggerSource: "chat",
        abortSignal: abortController.signal,
        onAssistantDelta: (delta) => {
          eventStream.push({ event: "delta", data: JSON.stringify({ delta }) });
        },
        onSessionEvent: (evt) => {
          eventStream.push({ event: "session_event", data: JSON.stringify(evt) });
        }
      });
      await eventStream.push({
        event: "done",
        data: JSON.stringify({
          reply: result.reply,
          runId: result.runId,
          sessionKey: result.sessionKey,
          messages: result.messages,
          resultCards: result.resultCards,
          runSummary: result.runSummary
        })
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (!abortController.signal.aborted) {
        await eventStream.push({ event: "error", data: JSON.stringify({ message: msg }) });
      }
    } finally {
      await eventStream.close();
    }
  })();

  return eventStream.send();
});
```

- [ ] **Step 2: 验证 build**

Run: `pnpm -C packages/nextclaw-digital-employee build`
Expected: 编译成功

- [ ] **Step 3: Commit**

```bash
git add packages/nextclaw-digital-employee/server/api/employees/\[id\]/chat/stream.post.ts
git commit -m "feat(digital-employee): add SSE streaming endpoint for employee chat"
```

---

### Task B4: 前端流式消费

**Files:**
- Modify: `packages/nextclaw-digital-employee/app/pages/employees/[id]/chat.vue`

- [ ] **Step 1: 新增 SSE 解析工具函数**

在 `<script setup>` 中添加 SSE 解析器：

```typescript
type SSEEvent = {
  event: string;
  data: string;
};

function parseSSEChunk(raw: string): SSEEvent[] {
  const events: SSEEvent[] = [];
  const blocks = raw.split("\n\n").filter(Boolean);
  for (const block of blocks) {
    let eventName = "message";
    let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) eventName = line.slice(7);
      else if (line.startsWith("data: ")) data += line.slice(6);
      else if (line.startsWith("data:")) data += line.slice(5);
    }
    if (data) events.push({ event: eventName, data });
  }
  return events;
}
```

- [ ] **Step 2: 替换 `sendMessage` 函数为流式版本**

替换现有的 `sendMessage` 函数（保留签名不变）：

```typescript
async function sendMessage(input = draft.value) {
  if (!input.trim()) return;
  sending.value = true;
  errorMessage.value = "";
  abortController.value = new AbortController();
  const optimisticMsg: ChatMessageView = { role: "user", content: input, timestamp: new Date().toISOString() };
  messages.value = [...messages.value, optimisticMsg];
  draft.value = "";
  if (textareaEl.value) textareaEl.value.style.height = "auto";

  const assistantMsg = reactive<ChatMessageView>({ role: "assistant", content: "", timestamp: new Date().toISOString() });
  messages.value = [...messages.value, assistantMsg];

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
          if (sse.event === "delta") {
            const parsed = JSON.parse(sse.data);
            assistantMsg.content += parsed.delta;
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

    await Promise.all([refresh(), refreshEmployee(), refreshHistory()]);
  } catch (error) {
    const e = error as Error & { cause?: Error };
    const isAbort =
      e?.name === "AbortError" ||
      e?.cause?.name === "AbortError" ||
      (typeof e?.message === "string" && e.message.toLowerCase().includes("aborted"));
    if (isAbort) {
      messages.value = messages.value.filter(m => m !== optimisticMsg && m !== assistantMsg);
      draft.value = input;
    } else {
      messages.value = messages.value.filter(m => m !== assistantMsg);
      errorMessage.value = e instanceof Error ? e.message : String(e);
    }
  } finally {
    sending.value = false;
    abortController.value = null;
  }
}
```

- [ ] **Step 3: 验证 build**

Run: `pnpm -C packages/nextclaw-digital-employee build`
Expected: 编译成功

- [ ] **Step 4: 冒烟测试**

启动 dev server，打开员工聊天页面，发送消息：
- 期望：文本逐字出现，完成后消息列表刷新
- 验证：取消按钮可中止流

- [ ] **Step 5: Commit**

```bash
git add packages/nextclaw-digital-employee/app/pages/employees/\[id\]/chat.vue
git commit -m "feat(digital-employee): implement SSE streaming chat UI"
```

---

## Phase C: Secrets 管理

### Task C1: 数据库 schema + migration

**Files:**
- Modify: `packages/nextclaw-digital-employee/server/db/schema.ts`
- Modify: `packages/nextclaw-digital-employee/server/db/knex.ts`

- [ ] **Step 1: 在 `schema.ts` 的 `PLATFORM_TABLES` 中添加 secrets 表名**

```typescript
export const PLATFORM_TABLES = {
  // ... existing tables
  secrets: "secrets"
} as const;
```

同时添加类型：

```typescript
export type SecretRecord = {
  id: string;
  key: string;
  value: string;
  scope: string;
  description: string;
  created_at: string;
  updated_at: string;
};
```

- [ ] **Step 2: 在 `knex.ts` 的 migration 中添加 secrets 表**

在 `createPlatformTables` 函数中添加：

```typescript
if (!(await knex.schema.hasTable(PLATFORM_TABLES.secrets))) {
  await knex.schema.createTable(PLATFORM_TABLES.secrets, (table) => {
    table.text("id").primary();
    table.text("key").notNullable().unique();
    table.text("value").notNullable();
    table.text("scope").notNullable().defaultTo("global");
    table.text("description").defaultTo("");
    table.text("created_at").notNullable();
    table.text("updated_at").notNullable();
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/nextclaw-digital-employee/server/db/schema.ts
git add packages/nextclaw-digital-employee/server/db/knex.ts
git commit -m "feat(digital-employee): add secrets table schema and migration"
```

---

### Task C2: Secrets Repository + 加密工具

**Files:**
- Create: `packages/nextclaw-digital-employee/server/repositories/secrets-repository.ts`

- [ ] **Step 1: 创建加密/解密工具 + SecretsRepository**

```typescript
import { randomUUID, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Knex } from "knex";
import { PLATFORM_TABLES, type SecretRecord } from "../db/schema";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

export type SecretView = {
  id: string;
  key: string;
  maskedValue: string;
  scope: string;
  description: string;
  createdAt: string;
  updatedAt: string;
};

function maskValue(raw: string): string {
  if (raw.length <= 4) return "••••";
  return "••••••" + raw.slice(-4);
}

function resolveEncryptionKey(homeDir: string): Buffer {
  const envKey = process.env.NEXTCLAW_SECRET_KEY?.trim();
  if (envKey) {
    const buf = Buffer.from(envKey, "base64");
    if (buf.length === 32) return buf;
    throw new Error("NEXTCLAW_SECRET_KEY must be 32 bytes (base64 encoded)");
  }
  const keyPath = join(homeDir, "secret.key");
  if (existsSync(keyPath)) {
    return Buffer.from(readFileSync(keyPath, "utf-8").trim(), "base64");
  }
  const newKey = randomBytes(32);
  writeFileSync(keyPath, newKey.toString("base64"), "utf-8");
  return newKey;
}

function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

function decrypt(ciphertext: string, key: Buffer): string {
  const data = Buffer.from(ciphertext, "base64");
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf-8");
}

function toView(record: SecretRecord, key: Buffer): SecretView {
  const plain = decrypt(record.value, key);
  return {
    id: record.id,
    key: record.key,
    maskedValue: maskValue(plain),
    scope: record.scope,
    description: record.description,
    createdAt: record.created_at,
    updatedAt: record.updated_at
  };
}

export class SecretsRepository {
  private encryptionKey: Buffer;

  constructor(private readonly db: Knex, homeDir: string) {
    this.encryptionKey = resolveEncryptionKey(homeDir);
  }

  async list(): Promise<SecretView[]> {
    const rows = await this.db<SecretRecord>(PLATFORM_TABLES.secrets).orderBy("created_at", "asc");
    return rows.map((r) => toView(r, this.encryptionKey));
  }

  async create(params: { key: string; value: string; scope?: string; description?: string }): Promise<SecretView> {
    const now = new Date().toISOString();
    const record: SecretRecord = {
      id: randomUUID(),
      key: params.key,
      value: encrypt(params.value, this.encryptionKey),
      scope: params.scope ?? "global",
      description: params.description ?? "",
      created_at: now,
      updated_at: now
    };
    await this.db<SecretRecord>(PLATFORM_TABLES.secrets).insert(record);
    return toView(record, this.encryptionKey);
  }

  async update(key: string, params: { value?: string; description?: string }): Promise<SecretView> {
    const updates: Partial<SecretRecord> = { updated_at: new Date().toISOString() };
    if (params.value !== undefined) {
      updates.value = encrypt(params.value, this.encryptionKey);
    }
    if (params.description !== undefined) {
      updates.description = params.description;
    }
    await this.db<SecretRecord>(PLATFORM_TABLES.secrets).where({ key }).update(updates);
    const row = await this.db<SecretRecord>(PLATFORM_TABLES.secrets).where({ key }).first();
    if (!row) throw new Error(`Secret not found: ${key}`);
    return toView(row, this.encryptionKey);
  }

  async delete(key: string): Promise<void> {
    await this.db<SecretRecord>(PLATFORM_TABLES.secrets).where({ key }).delete();
  }

  async getDecryptedForScope(employeeId?: string): Promise<Map<string, string>> {
    const scopes = ["global"];
    if (employeeId) scopes.push(`employee:${employeeId}`);
    const rows = await this.db<SecretRecord>(PLATFORM_TABLES.secrets).whereIn("scope", scopes);
    const result = new Map<string, string>();
    for (const row of rows) {
      result.set(row.key, decrypt(row.value, this.encryptionKey));
    }
    return result;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/nextclaw-digital-employee/server/repositories/secrets-repository.ts
git commit -m "feat(digital-employee): add SecretsRepository with AES-256-GCM encryption"
```

---

### Task C3: Secrets REST API

**Files:**
- Create: `packages/nextclaw-digital-employee/server/api/secrets/index.get.ts`
- Create: `packages/nextclaw-digital-employee/server/api/secrets/index.post.ts`
- Create: `packages/nextclaw-digital-employee/server/api/secrets/[key].patch.ts`
- Create: `packages/nextclaw-digital-employee/server/api/secrets/[key].delete.ts`

- [ ] **Step 1: 注册 SecretsRepository 到 platform-context**

Modify: `packages/nextclaw-digital-employee/server/runtime/platform-context.ts`

引入 `SecretsRepository` 并注册到 context 中。

- [ ] **Step 2: 创建 GET /api/secrets**

```typescript
import { getPlatformContext } from "../../runtime/platform-context";

export default defineEventHandler(async () => {
  const ctx = await getPlatformContext();
  const secrets = await ctx.secretsRepo.list();
  return { ok: true, data: secrets };
});
```

- [ ] **Step 3: 创建 POST /api/secrets**

```typescript
import { createError, readBody } from "h3";
import { getPlatformContext } from "../../runtime/platform-context";

type CreateBody = { key: string; value: string; scope?: string; description?: string };

export default defineEventHandler(async (event) => {
  const body = await readBody<CreateBody>(event);
  if (!body?.key?.trim() || !body?.value) {
    throw createError({ statusCode: 400, statusMessage: "key and value are required" });
  }
  const ctx = await getPlatformContext();
  const secret = await ctx.secretsRepo.create({
    key: body.key.trim(),
    value: body.value,
    scope: body.scope,
    description: body.description
  });
  return { ok: true, data: secret };
});
```

- [ ] **Step 4: 创建 PATCH /api/secrets/:key**

```typescript
import { createError, getRouterParam, readBody } from "h3";
import { getPlatformContext } from "../../../runtime/platform-context";

type UpdateBody = { value?: string; description?: string };

export default defineEventHandler(async (event) => {
  const key = getRouterParam(event, "key") ?? "";
  const body = await readBody<UpdateBody>(event);
  const ctx = await getPlatformContext();
  const secret = await ctx.secretsRepo.update(key, { value: body?.value, description: body?.description });
  return { ok: true, data: secret };
});
```

- [ ] **Step 5: 创建 DELETE /api/secrets/:key**

```typescript
import { getRouterParam } from "h3";
import { getPlatformContext } from "../../../runtime/platform-context";

export default defineEventHandler(async (event) => {
  const key = getRouterParam(event, "key") ?? "";
  const ctx = await getPlatformContext();
  await ctx.secretsRepo.delete(key);
  return { ok: true };
});
```

- [ ] **Step 6: 验证 build**

Run: `pnpm -C packages/nextclaw-digital-employee build`
Expected: 编译成功

- [ ] **Step 7: Commit**

```bash
git add packages/nextclaw-digital-employee/server/api/secrets/
git add packages/nextclaw-digital-employee/server/runtime/platform-context.ts
git commit -m "feat(digital-employee): add secrets CRUD API endpoints"
```

---

### Task C4: ExecTool envOverlay 支持

**Files:**
- Modify: `packages/nextclaw-core/src/agent/tools/shell.ts`
- Modify: `packages/nextclaw-core/src/engine/types.ts`

- [ ] **Step 1: 在 `AgentEngineFactoryContext` 新增 `envOverlay`**

Modify `packages/nextclaw-core/src/engine/types.ts`，在 `AgentEngineFactoryContext` 中添加：

```typescript
envOverlay?: Record<string, string>;
```

- [ ] **Step 2: 在 `ExecTool` 构造函数中接受 `envOverlay`**

Modify `packages/nextclaw-core/src/agent/tools/shell.ts`：

在 `options` 类型中新增：

```typescript
envOverlay?: Record<string, string>;
```

在 `execute` 方法中修改 env 构建：

```typescript
const env = { ...process.env, ...(this.options.envOverlay ?? {}) };
```

（替换现有的 `const env = { ...process.env };`）

- [ ] **Step 3: 在 `AgentLoop` 中传递 envOverlay 到 ExecTool**

确认 `AgentLoop` 创建 `ExecTool` 时将 `options.envOverlay` 传入。

查看 `packages/nextclaw-core/src/agent/loop.ts` 中 `ExecTool` 的创建位置并传入。

- [ ] **Step 4: 验证 core build**

Run: `pnpm -C packages/nextclaw-core build`
Expected: 编译成功

- [ ] **Step 5: Commit**

```bash
git add packages/nextclaw-core/src/agent/tools/shell.ts
git add packages/nextclaw-core/src/engine/types.ts
git add packages/nextclaw-core/src/agent/loop.ts
git commit -m "feat(core): add envOverlay support to ExecTool for runtime secrets injection"
```

---

### Task C5: Gateway 注入 Secrets 到 Engine

**Files:**
- Modify: `packages/nextclaw-digital-employee/server/engine/NextclawEngineGateway.ts`

- [ ] **Step 1: 在 `_runTurnCore` 中查询 secrets 并注入**

在 `_runTurnCore` 方法的 engine 调用前添加 secrets 查询：

```typescript
// 在获取 engine 之前
const secretsRepo = /* 从某处获取 — 需要通过构造函数注入 */;
let envOverlay: Record<string, string> | undefined;
if (secretsRepo) {
  const secrets = await secretsRepo.getDecryptedForScope(params.employeeId);
  if (secrets.size > 0) {
    envOverlay = Object.fromEntries(secrets);
  }
}
```

将 `envOverlay` 传入 `createEngineForWorkspace`，最终到达 `ExecTool`。

具体实现：在 `NextclawEngineGatewayOptions` 中添加可选 `secretsRepo`，在 `_runTurnCore` 中使用。

- [ ] **Step 2: 更新 platform-context 传入 secretsRepo**

确保 `NextclawEngineGateway` 构造时收到 `secretsRepo`。

- [ ] **Step 3: 验证 build + 测试**

Run: `pnpm -C packages/nextclaw-digital-employee build && pnpm -C packages/nextclaw-digital-employee test`
Expected: 编译成功，测试通过

- [ ] **Step 4: Commit**

```bash
git add packages/nextclaw-digital-employee/server/engine/NextclawEngineGateway.ts
git add packages/nextclaw-digital-employee/server/runtime/platform-context.ts
git commit -m "feat(digital-employee): inject secrets as envOverlay into agent engine"
```

---

### Task C6: Secrets 前端 UI

**Files:**
- Modify: `packages/nextclaw-digital-employee/app/pages/security/index.vue`

- [ ] **Step 1: 在安全页面新增 Secrets 管理区域**

在现有 `security/index.vue` 页面中新增 Secrets 管理部分：
- 列表：显示所有 secrets（key, scope, maskedValue, description）
- 添加按钮 → 弹窗表单（key, value, scope 下拉, description）
- 编辑按钮 → 弹窗表单（value, description）
- 删除按钮 → 确认后删除

使用与项目其他页面一致的 UI 风格（Tailwind + Lucide icons + 圆角卡片布局）。

- [ ] **Step 2: 验证 build**

Run: `pnpm -C packages/nextclaw-digital-employee build`
Expected: 编译成功

- [ ] **Step 3: 冒烟测试**

打开安全管理页面：
- 创建一个 secret → 列表显示脱敏值
- 编辑 secret → 值更新
- 删除 secret → 从列表消失

- [ ] **Step 4: Commit**

```bash
git add packages/nextclaw-digital-employee/app/pages/security/index.vue
git commit -m "feat(digital-employee): add secrets management UI to security page"
```

---

## 验证清单（全流程冒烟）

- [ ] **Phase A 冒烟**: 全局启用一个 skill → 员工对话时 agent 发现并使用该 skill → 脚本执行成功（使用绝对路径）
- [ ] **Phase B 冒烟**: 发送消息 → 文本逐字出现 → 工具调用实时展示 → 取消可中止 → done 后消息列表完整
- [ ] **Phase C 冒烟**: 在 UI 创建 secret → skill 脚本执行时 process.env 读到值 → 删除后读不到
