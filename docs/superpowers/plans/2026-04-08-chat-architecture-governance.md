# Chat Architecture Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build multi-session, database-backed employee chat with `sessionKey`-based history, then layer SSE streaming and server-side cancellation on top of the existing run tracking pipeline.

**Architecture:** Add `chat_sessions` and `chat_messages` persistence in `packages/nextclaw-digital-employee`, thread `sessionKey` through the run/service/API path, and move history reads off the fixed `employee:${employeeId}:ui:direct:web` session. Keep `run_records / run_events` as the run observability layer, then add SSE/cancel using the same run lifecycle instead of inventing a second execution path.

**Tech Stack:** Nuxt 4, h3 server routes, Vue 3, Knex, SQLite/DM, Vitest, SessionManager compatibility layer

---

## File Map

### Create

- `packages/nextclaw-digital-employee/migrations/003_chat_sessions_messages.ts` — create `chat_sessions`, `chat_messages`, and add `session_key` to `run_records`
- `packages/nextclaw-digital-employee/server/repositories/chat-session-repository.ts` — create/list/get/update chat sessions by `employeeId + sessionKey`
- `packages/nextclaw-digital-employee/server/repositories/chat-message-repository.ts` — append and paginate chat messages by `session_id`
- `packages/nextclaw-digital-employee/server/services/chat-history-service.ts` — central session/history orchestration for the employee chat APIs
- `packages/nextclaw-digital-employee/server/api/employees/[id]/sessions/index.get.ts` — list sessions
- `packages/nextclaw-digital-employee/server/api/employees/[id]/sessions/index.post.ts` — create session
- `packages/nextclaw-digital-employee/server/api/employees/[id]/sessions/[key]/messages.get.ts` — fetch paginated messages by `sessionKey`
- `packages/nextclaw-digital-employee/server/api/employees/[id]/chat/[runId]/cancel.post.ts` — cancel an in-flight chat run
- `packages/nextclaw-digital-employee/app/composables/useEmployeeChat.ts` — frontend chat/session API state and helpers
- `packages/nextclaw-digital-employee/tests/chat-session-repository.test.ts` — repository-level DB persistence coverage
- `packages/nextclaw-digital-employee/tests/chat-history-service.test.ts` — session/history orchestration coverage
- `packages/nextclaw-digital-employee/tests/chat-stream-events.test.ts` — streaming/cancel event flow coverage

### Modify

- `packages/nextclaw-digital-employee/server/db/schema.ts` — add table constants and record types
- `packages/nextclaw-digital-employee/server/repositories/run-record-repository.ts` — persist `session_key` alongside existing run metadata
- `packages/nextclaw-digital-employee/server/runtime/platform-context.ts` — instantiate new repositories/services and wire them into the app context
- `packages/nextclaw-digital-employee/server/services/employee-run-service.ts` — accept `sessionKey`, persist chat rows, and return DB-backed message history
- `packages/nextclaw-digital-employee/server/engine/NextclawEngineGateway.ts` — expose event callbacks/abort handling without making `getSessionHistory()` the product history source
- `packages/nextclaw-digital-employee/server/api/employees/[id]/chat.post.ts` — accept `sessionKey`, return `sessionKey`, and stop assuming one fixed session
- `packages/nextclaw-digital-employee/server/api/employees/[id]/chat/history.get.ts` — convert the old bootstrap route to a compatibility wrapper around session-aware reads or remove once the page is switched
- `packages/nextclaw-digital-employee/shared/api-types.ts` — add payload types for sessions, messages, chat runs, and streaming state
- `packages/nextclaw-digital-employee/app/pages/employees/[id]/chat.vue` — replace fixed-session chat UI with multi-session selection, DB-backed history fetches, and streaming UI state
- `packages/nextclaw-digital-employee/tests/employee-run-service.test.ts` — extend run service tests with `sessionKey` and DB-backed history assertions
- `packages/nextclaw-digital-employee/tests/skill-import-and-run-service.test.ts` — update integration expectations to include `sessionKey` and DB-backed messages

---

### Task 1: Add chat session/message persistence

**Files:**
- Create: `packages/nextclaw-digital-employee/migrations/003_chat_sessions_messages.ts`
- Create: `packages/nextclaw-digital-employee/server/repositories/chat-session-repository.ts`
- Create: `packages/nextclaw-digital-employee/server/repositories/chat-message-repository.ts`
- Modify: `packages/nextclaw-digital-employee/server/db/schema.ts`
- Test: `packages/nextclaw-digital-employee/tests/chat-session-repository.test.ts`

- [ ] **Step 1: Write the failing repository test**

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createPlatformKnex, ensurePlatformDatabase } from "../server/db/knex";
import { EmployeeRepository } from "../server/repositories/employee-repository";
import { ChatSessionRepository } from "../server/repositories/chat-session-repository";
import { ChatMessageRepository } from "../server/repositories/chat-message-repository";

const tempDirs: string[] = [];
const makeHome = () => {
  const dir = mkdtempSync(join(tmpdir(), "chat-session-repo-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe("Chat session repositories", () => {
  it("creates sessions and paginates messages by session key", async () => {
    const homeDir = makeHome();
    const db = createPlatformKnex(join(homeDir, "platform.sqlite"));
    await ensurePlatformDatabase(db);

    const employeeRepo = new EmployeeRepository(db);
    const sessionRepo = new ChatSessionRepository(db);
    const messageRepo = new ChatMessageRepository(db);
    const employee = await employeeRepo.create({
      name: "项目经理", code: "pm-bot", description: "", systemPrompt: "你是项目经理"
    });

    const session = await sessionRepo.create({
      employeeId: employee.id,
      sessionKey: "employee:pm-bot:ui:web:1",
      title: "项目周报"
    });
    await messageRepo.append({
      sessionId: session.id,
      role: "user",
      content: "先给我风险清单"
    });
    await messageRepo.append({
      sessionId: session.id,
      role: "assistant",
      content: "当前有 2 个高风险项目"
    });

    const page = await messageRepo.listBySessionId({
      sessionId: session.id,
      limit: 1
    });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.role).toBe("assistant");
    expect(page.nextCursor).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/nextclaw-digital-employee test -- chat-session-repository.test.ts`
Expected: FAIL with module-not-found or missing table errors for `ChatSessionRepository`, `ChatMessageRepository`, or `chat_sessions`

- [ ] **Step 3: Write the minimal schema, migration, and repositories**

```ts
// server/db/schema.ts
export const PLATFORM_TABLES = {
  // existing tables...
  chatSessions: "chat_sessions",
  chatMessages: "chat_messages",
} as const;

export type ChatSessionRecord = {
  id: string;
  employee_id: string;
  session_key: string;
  title: string;
  preview: string;
  message_count: number;
  created_at: string;
  updated_at: string;
};

export type ChatMessageRecord = {
  id: string;
  session_id: string;
  role: string;
  content: string;
  tool_name: string | null;
  tool_call_id: string | null;
  metadata_json: string;
  created_at: string;
};
```

```ts
// migrations/003_chat_sessions_messages.ts
import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("chat_sessions"))) {
    await knex.schema.createTable("chat_sessions", (t) => {
      t.string("id").primary();
      t.string("employee_id").notNullable().references("id").inTable("employees").onDelete("CASCADE");
      t.string("session_key").notNullable();
      t.string("title").notNullable().defaultTo("新对话");
      t.text("preview").notNullable().defaultTo("");
      t.integer("message_count").notNullable().defaultTo(0);
      t.timestamp("created_at").notNullable();
      t.timestamp("updated_at").notNullable();
      t.unique(["employee_id", "session_key"]);
    });
  }

  if (!(await knex.schema.hasTable("chat_messages"))) {
    await knex.schema.createTable("chat_messages", (t) => {
      t.string("id").primary();
      t.string("session_id").notNullable().references("id").inTable("chat_sessions").onDelete("CASCADE");
      t.string("role").notNullable();
      t.text("content").notNullable().defaultTo("");
      t.string("tool_name").nullable();
      t.string("tool_call_id").nullable();
      t.text("metadata_json").notNullable().defaultTo("{}");
      t.timestamp("created_at").notNullable();
    });
  }

  if (!(await knex.schema.hasColumn("run_records", "session_key"))) {
    await knex.schema.alterTable("run_records", (t) => {
      t.string("session_key").nullable();
    });
  }
}
```

```ts
// server/repositories/chat-session-repository.ts
export class ChatSessionRepository {
  constructor(private readonly db: Knex) {}

  async create(input: { employeeId: string; sessionKey: string; title: string }): Promise<ChatSessionView> {
    const now = dbNow();
    const record: ChatSessionRecord = {
      id: randomUUID(),
      employee_id: input.employeeId,
      session_key: input.sessionKey,
      title: input.title.trim() || "新对话",
      preview: "",
      message_count: 0,
      created_at: now,
      updated_at: now
    };
    await this.db<ChatSessionRecord>(PLATFORM_TABLES.chatSessions).insert(record);
    return toChatSessionView(record);
  }

  async getByEmployeeAndSessionKey(employeeId: string, sessionKey: string): Promise<ChatSessionView | null> {
    const record = await this.db<ChatSessionRecord>(PLATFORM_TABLES.chatSessions)
      .where({ employee_id: employeeId, session_key: sessionKey })
      .first();
    return record ? toChatSessionView(record) : null;
  }
}
```

```ts
// server/repositories/chat-message-repository.ts
export class ChatMessageRepository {
  constructor(private readonly db: Knex) {}

  async append(input: {
    sessionId: string;
    role: string;
    content: string;
    toolName?: string | null;
    toolCallId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<ChatMessageView> {
    const record: ChatMessageRecord = {
      id: randomUUID(),
      session_id: input.sessionId,
      role: input.role,
      content: input.content,
      tool_name: input.toolName ?? null,
      tool_call_id: input.toolCallId ?? null,
      metadata_json: JSON.stringify(input.metadata ?? {}),
      created_at: dbNow()
    };
    await this.db<ChatMessageRecord>(PLATFORM_TABLES.chatMessages).insert(record);
    return toChatMessageView(record);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/nextclaw-digital-employee test -- chat-session-repository.test.ts`
Expected: PASS with 1 test passing for session creation and message pagination

- [ ] **Step 5: Commit**

```bash
git add packages/nextclaw-digital-employee/migrations/003_chat_sessions_messages.ts \
  packages/nextclaw-digital-employee/server/db/schema.ts \
  packages/nextclaw-digital-employee/server/repositories/chat-session-repository.ts \
  packages/nextclaw-digital-employee/server/repositories/chat-message-repository.ts \
  packages/nextclaw-digital-employee/tests/chat-session-repository.test.ts
git commit -m "feat: add chat session storage"
```

### Task 2: Persist employee chat through the new repositories

**Files:**
- Create: `packages/nextclaw-digital-employee/server/services/chat-history-service.ts`
- Modify: `packages/nextclaw-digital-employee/server/repositories/run-record-repository.ts`
- Modify: `packages/nextclaw-digital-employee/server/runtime/platform-context.ts`
- Modify: `packages/nextclaw-digital-employee/server/services/employee-run-service.ts`
- Modify: `packages/nextclaw-digital-employee/tests/employee-run-service.test.ts`
- Modify: `packages/nextclaw-digital-employee/tests/skill-import-and-run-service.test.ts`

- [ ] **Step 1: Write the failing service test**

```ts
it("persists user and assistant messages under the requested session key", async () => {
  const homeDir = createTempDir("run-service-session-");
  const db = createPlatformKnex(join(homeDir, "platform.sqlite"));
  await ensurePlatformDatabase(db);

  const employeeRepo = new EmployeeRepository(db);
  const skillRepo = new EmployeeSkillRepository(db);
  const runRepo = new RunRecordRepository(db);
  const sessionRepo = new ChatSessionRepository(db);
  const messageRepo = new ChatMessageRepository(db);
  const historyService = new ChatHistoryService(sessionRepo, messageRepo);
  const gateway = buildGateway(homeDir, "项目周报已生成");

  const employee = await employeeRepo.create({
    name: "执行测试", code: "run-test", description: "", systemPrompt: "你好"
  });

  const runService = new EmployeeRunService(
    employeeRepo,
    skillRepo,
    runRepo,
    gateway,
    undefined,
    historyService
  );

  const result = await runService.runEmployeeTurn({
    employeeId: employee.id,
    sessionKey: "employee:run-test:ui:web:1",
    message: "请生成周报",
    triggerType: "manual",
    triggerSource: "chat"
  });

  expect(result.sessionKey).toBe("employee:run-test:ui:web:1");
  expect(result.messages.map((item) => item.role)).toEqual(["user", "assistant"]);
  const runs = await runRepo.listByEmployeeId(employee.id);
  expect(runs[0]?.result).toMatchObject({ sessionKey: "employee:run-test:ui:web:1" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/nextclaw-digital-employee test -- employee-run-service.test.ts skill-import-and-run-service.test.ts`
Expected: FAIL because `EmployeeRunService` does not accept `sessionKey` or write chat rows to the database-backed history service

- [ ] **Step 3: Write the minimal orchestration and run persistence changes**

```ts
// server/services/chat-history-service.ts
export class ChatHistoryService {
  constructor(
    private readonly sessions: ChatSessionRepository,
    private readonly messages: ChatMessageRepository
  ) {}

  async getOrCreateSession(params: {
    employeeId: string;
    sessionKey?: string;
    titleFromMessage?: string;
  }) {
    const sessionKey = params.sessionKey ?? `employee:${params.employeeId}:ui:web:${randomUUID()}`;
    const existing = await this.sessions.getByEmployeeAndSessionKey(params.employeeId, sessionKey);
    if (existing) return existing;
    return this.sessions.create({
      employeeId: params.employeeId,
      sessionKey,
      title: params.titleFromMessage?.slice(0, 24) || "新对话"
    });
  }
}
```

```ts
// server/repositories/run-record-repository.ts
async create(params: {
  employeeId: string;
  triggerType: string;
  triggerSource: string;
  sessionKey?: string;
}): Promise<RunRecordView> {
  const record: RunRecord = {
    id: randomUUID(),
    employee_id: params.employeeId,
    trigger_type: params.triggerType,
    trigger_source: params.triggerSource,
    status: RunStatus.Running,
    started_at: dbNow(),
    finished_at: null,
    summary: "",
    result_json: "{}",
    session_key: params.sessionKey ?? null
  };
  await this.db<RunRecord>(PLATFORM_TABLES.runRecords).insert(record);
  return toRunRecordView(record);
}
```

```ts
// server/services/employee-run-service.ts
const session = await this.chatHistoryService.getOrCreateSession({
  employeeId: employee.id,
  sessionKey: params.sessionKey,
  titleFromMessage: params.message
});

const run = await this.runRepo.create({
  employeeId: employee.id,
  triggerType: params.triggerType,
  triggerSource: params.triggerSource,
  sessionKey: session.sessionKey
});

await this.chatHistoryService.appendUserMessage(session.id, params.message);
const result = await this.gateway.runEmployeeTurn({
  employeeId: employee.id,
  sessionKey: session.sessionKey,
  // existing params...
});
await this.chatHistoryService.appendAssistantMessage(session.id, result.reply, result.events);
const messages = await this.chatHistoryService.listLatestMessages({
  employeeId: employee.id,
  sessionKey: session.sessionKey,
  limit: 100
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm -C packages/nextclaw-digital-employee test -- employee-run-service.test.ts skill-import-and-run-service.test.ts chat-session-repository.test.ts`
Expected: PASS with session-aware run results and DB-backed message history

- [ ] **Step 5: Commit**

```bash
git add packages/nextclaw-digital-employee/server/services/chat-history-service.ts \
  packages/nextclaw-digital-employee/server/repositories/run-record-repository.ts \
  packages/nextclaw-digital-employee/server/runtime/platform-context.ts \
  packages/nextclaw-digital-employee/server/services/employee-run-service.ts \
  packages/nextclaw-digital-employee/tests/employee-run-service.test.ts \
  packages/nextclaw-digital-employee/tests/skill-import-and-run-service.test.ts
git commit -m "feat: persist employee chat sessions"
```

### Task 3: Replace fixed-session chat/history APIs with session-aware endpoints

**Files:**
- Create: `packages/nextclaw-digital-employee/server/api/employees/[id]/sessions/index.get.ts`
- Create: `packages/nextclaw-digital-employee/server/api/employees/[id]/sessions/index.post.ts`
- Create: `packages/nextclaw-digital-employee/server/api/employees/[id]/sessions/[key]/messages.get.ts`
- Modify: `packages/nextclaw-digital-employee/server/api/employees/[id]/chat.post.ts`
- Modify: `packages/nextclaw-digital-employee/server/api/employees/[id]/chat/history.get.ts`
- Modify: `packages/nextclaw-digital-employee/shared/api-types.ts`
- Test: `packages/nextclaw-digital-employee/tests/chat-history-service.test.ts`

- [ ] **Step 1: Write the failing history service/API-shape test**

```ts
import { describe, expect, it } from "vitest";
import { ChatHistoryService } from "../server/services/chat-history-service";

describe("ChatHistoryService API contract", () => {
  it("lists sessions and returns paginated messages by session key", async () => {
    const service = buildChatHistoryServiceForTest();

    const first = await service.getOrCreateSession({
      employeeId: "employee-1",
      sessionKey: "employee:employee-1:ui:web:1",
      titleFromMessage: "先做风险盘点"
    });
    await service.appendUserMessage(first.id, "第一条");
    await service.appendAssistantMessage(first.id, "第一条回复", []);

    const sessions = await service.listSessions("employee-1");
    const page = await service.listMessages({
      employeeId: "employee-1",
      sessionKey: "employee:employee-1:ui:web:1",
      limit: 50
    });

    expect(sessions[0]?.sessionKey).toBe("employee:employee-1:ui:web:1");
    expect(page.items.map((item) => item.role)).toEqual(["user", "assistant"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/nextclaw-digital-employee test -- chat-history-service.test.ts`
Expected: FAIL because `ChatHistoryService` does not yet expose `listSessions()` or `listMessages()`

- [ ] **Step 3: Implement the service methods and route handlers**

```ts
// server/services/chat-history-service.ts
async listSessions(employeeId: string) {
  return this.sessions.listByEmployeeId(employeeId);
}

async listMessages(params: { employeeId: string; sessionKey: string; limit: number; before?: string | null }) {
  const session = await this.sessions.getByEmployeeAndSessionKey(params.employeeId, params.sessionKey);
  if (!session) return { sessionKey: params.sessionKey, items: [], nextCursor: null };
  return this.messages.listBySessionId({
    sessionId: session.id,
    limit: params.limit,
    before: params.before ?? null
  });
}
```

```ts
// server/api/employees/[id]/chat.post.ts
type ChatBody = {
  message?: string;
  sessionKey?: string;
};

const result = await ctx.employeeRunService.runEmployeeTurn({
  employeeId,
  sessionKey: body?.sessionKey?.trim() || undefined,
  message,
  triggerType: "manual",
  triggerSource: "chat"
});
return { ok: true, data: result };
```

```ts
// server/api/employees/[id]/sessions/[key]/messages.get.ts
export default defineEventHandler(async (event) => {
  const employeeId = getRouterParam(event, "id") ?? "";
  const sessionKey = getRouterParam(event, "key") ?? "";
  const query = getQuery(event);
  const ctx = await getPlatformContext();
  return {
    ok: true,
    data: await ctx.chatHistoryService.listMessages({
      employeeId,
      sessionKey,
      limit: Number(query.limit ?? 50),
      before: typeof query.before === "string" ? query.before : null
    })
  };
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm -C packages/nextclaw-digital-employee test -- chat-history-service.test.ts employee-run-service.test.ts`
Expected: PASS with session-aware history results and `sessionKey` threaded through the chat POST handler contract

- [ ] **Step 5: Commit**

```bash
git add packages/nextclaw-digital-employee/server/api/employees/[id]/sessions/index.get.ts \
  packages/nextclaw-digital-employee/server/api/employees/[id]/sessions/index.post.ts \
  packages/nextclaw-digital-employee/server/api/employees/[id]/sessions/[key]/messages.get.ts \
  packages/nextclaw-digital-employee/server/api/employees/[id]/chat.post.ts \
  packages/nextclaw-digital-employee/server/api/employees/[id]/chat/history.get.ts \
  packages/nextclaw-digital-employee/shared/api-types.ts \
  packages/nextclaw-digital-employee/tests/chat-history-service.test.ts
git commit -m "feat: add session-aware chat APIs"
```

### Task 4: Update the employee chat page for multi-session history

**Files:**
- Create: `packages/nextclaw-digital-employee/app/composables/useEmployeeChat.ts`
- Modify: `packages/nextclaw-digital-employee/app/pages/employees/[id]/chat.vue`
- Modify: `packages/nextclaw-digital-employee/shared/api-types.ts`
- Test: `packages/nextclaw-digital-employee/tests/chat-optimistic-rollback.test.ts`

- [ ] **Step 1: Write the failing frontend state test**

```ts
import { describe, expect, it } from "vitest";
import { applyServerChatResult, selectInitialSession } from "../app/composables/useEmployeeChat";

describe("employee chat session state", () => {
  it("switches to the newest session and replaces optimistic history with server history", () => {
    const sessions = [
      { sessionKey: "employee:1:ui:web:old", updatedAt: "2026-04-08T09:00:00.000Z" },
      { sessionKey: "employee:1:ui:web:new", updatedAt: "2026-04-08T10:00:00.000Z" }
    ];

    expect(selectInitialSession(sessions)?.sessionKey).toBe("employee:1:ui:web:new");

    const optimistic = [{ role: "user", content: "先给我风险清单" }];
    const server = [{ role: "user", content: "先给我风险清单" }, { role: "assistant", content: "当前有 2 个风险项" }];

    expect(applyServerChatResult(optimistic, server)).toEqual(server);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/nextclaw-digital-employee test -- chat-optimistic-rollback.test.ts`
Expected: FAIL because `useEmployeeChat.ts` and the session-state helpers do not exist yet

- [ ] **Step 3: Add a chat composable and switch the page to it**

```ts
// app/composables/useEmployeeChat.ts
export function selectInitialSession<T extends { sessionKey: string; updatedAt: string }>(sessions: T[]): T | null {
  return [...sessions].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0] ?? null;
}

export function applyServerChatResult<T>(_: T[], serverMessages: T[]): T[] {
  return serverMessages;
}

export function useEmployeeChat(employeeId: ComputedRef<string>) {
  const activeSessionKey = ref<string>("");
  const sessions = useLazyFetch(() => `/api/employees/${employeeId.value}/sessions`);
  const messages = useLazyFetch(() =>
    activeSessionKey.value
      ? `/api/employees/${employeeId.value}/sessions/${encodeURIComponent(activeSessionKey.value)}/messages`
      : null
  );

  async function sendMessage(message: string) {
    return $fetch(`/api/employees/${employeeId.value}/chat`, {
      method: "POST",
      body: { message, sessionKey: activeSessionKey.value || undefined }
    });
  }

  return { activeSessionKey, sessions, messages, sendMessage };
}
```

```vue
<!-- app/pages/employees/[id]/chat.vue -->
const {
  activeSessionKey,
  sessions,
  messages: history,
  sendMessage,
} = useEmployeeChat(employeeId);

watchEffect(() => {
  const initial = selectInitialSession(sessions.value?.data ?? []);
  if (!activeSessionKey.value && initial) activeSessionKey.value = initial.sessionKey;
});

const result = await sendMessage(input);
messages.value = applyServerChatResult(messages.value, result.data.messages);
```

- [ ] **Step 4: Run tests and type-check**

Run: `pnpm -C packages/nextclaw-digital-employee test -- chat-optimistic-rollback.test.ts && pnpm -C packages/nextclaw-digital-employee tsc`
Expected: PASS with session-state helpers covered and the chat page compiling against the new API types

- [ ] **Step 5: Commit**

```bash
git add packages/nextclaw-digital-employee/app/composables/useEmployeeChat.ts \
  packages/nextclaw-digital-employee/app/pages/employees/[id]/chat.vue \
  packages/nextclaw-digital-employee/shared/api-types.ts \
  packages/nextclaw-digital-employee/tests/chat-optimistic-rollback.test.ts
git commit -m "feat: add multi-session employee chat ui"
```

### Task 5: Add SSE streaming and server-side cancellation

**Files:**
- Create: `packages/nextclaw-digital-employee/server/api/employees/[id]/chat/[runId]/cancel.post.ts`
- Modify: `packages/nextclaw-digital-employee/server/engine/NextclawEngineGateway.ts`
- Modify: `packages/nextclaw-digital-employee/server/services/employee-run-service.ts`
- Modify: `packages/nextclaw-digital-employee/server/repositories/run-record-repository.ts`
- Modify: `packages/nextclaw-digital-employee/app/composables/useEmployeeChat.ts`
- Modify: `packages/nextclaw-digital-employee/app/pages/employees/[id]/chat.vue`
- Test: `packages/nextclaw-digital-employee/tests/chat-stream-events.test.ts`

- [ ] **Step 1: Write the failing streaming/cancel test**

```ts
import { describe, expect, it } from "vitest";
import { createChatStreamAdapter } from "../app/composables/useEmployeeChat";

describe("chat stream adapter", () => {
  it("applies delta events and marks the run aborted when cancel arrives", () => {
    const adapter = createChatStreamAdapter();

    adapter.onEvent({ event: "run_started", data: { runId: "run-1", sessionKey: "employee:1:ui:web:1" } });
    adapter.onEvent({ event: "reply_delta", data: { runId: "run-1", delta: "你好" } });
    adapter.onEvent({ event: "reply_delta", data: { runId: "run-1", delta: "，世界" } });
    adapter.onEvent({ event: "run_aborted", data: { runId: "run-1", reason: "user_cancelled" } });

    expect(adapter.state.streamingReply).toBe("你好，世界");
    expect(adapter.state.runStatus).toBe("aborted");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/nextclaw-digital-employee test -- chat-stream-events.test.ts`
Expected: FAIL because there is no stream adapter, no SSE event application logic, and no cancel path

- [ ] **Step 3: Implement the stream/cancel path**

```ts
// server/engine/NextclawEngineGateway.ts
async runEmployeeTurn(params: RunEmployeeTurnParams): Promise<RunEmployeeTurnResult> {
  const controller = new AbortController();
  this.activeRuns.set(params.runId, controller);
  try {
    const reply = await engine.processDirect({
      content: params.message,
      sessionKey,
      metadata,
      abortSignal: controller.signal,
      onSessionEvent: (event) => {
        params.onSessionEvent?.(event);
      }
    });
    return { sessionKey, reply, events };
  } finally {
    this.activeRuns.delete(params.runId);
  }
}

cancelRun(runId: string): boolean {
  const controller = this.activeRuns.get(runId);
  if (!controller) return false;
  controller.abort();
  return true;
}
```

```ts
// app/composables/useEmployeeChat.ts
export function createChatStreamAdapter() {
  const state = reactive({
    streamingReply: "",
    runStatus: "idle" as "idle" | "running" | "completed" | "aborted" | "failed"
  });

  return {
    state,
    onEvent(input: { event: string; data: Record<string, unknown> }) {
      if (input.event === "run_started") state.runStatus = "running";
      if (input.event === "reply_delta") state.streamingReply += String(input.data.delta ?? "");
      if (input.event === "run_aborted") state.runStatus = "aborted";
      if (input.event === "run_failed") state.runStatus = "failed";
      if (input.event === "done") state.runStatus = "completed";
    }
  };
}
```

```ts
// server/api/employees/[id]/chat/[runId]/cancel.post.ts
export default defineEventHandler(async (event) => {
  const runId = getRouterParam(event, "runId") ?? "";
  const ctx = await getPlatformContext();
  const cancelled = await ctx.employeeRunService.cancelRun(runId);
  return { ok: true, data: { runId, cancelled } };
});
```

- [ ] **Step 4: Run tests and package validation**

Run: `pnpm -C packages/nextclaw-digital-employee test -- chat-stream-events.test.ts employee-run-service.test.ts && pnpm -C packages/nextclaw-digital-employee lint && pnpm -C packages/nextclaw-digital-employee tsc`
Expected: PASS with streaming/cancel state covered, package lint clean, and Nuxt typecheck green

- [ ] **Step 5: Commit**

```bash
git add packages/nextclaw-digital-employee/server/api/employees/[id]/chat/[runId]/cancel.post.ts \
  packages/nextclaw-digital-employee/server/engine/NextclawEngineGateway.ts \
  packages/nextclaw-digital-employee/server/services/employee-run-service.ts \
  packages/nextclaw-digital-employee/server/repositories/run-record-repository.ts \
  packages/nextclaw-digital-employee/app/composables/useEmployeeChat.ts \
  packages/nextclaw-digital-employee/app/pages/employees/[id]/chat.vue \
  packages/nextclaw-digital-employee/tests/chat-stream-events.test.ts
git commit -m "feat: stream employee chat runs"
```

---

## Final Verification

- [ ] Run focused backend tests:

```bash
pnpm -C packages/nextclaw-digital-employee test -- \
  chat-session-repository.test.ts \
  chat-history-service.test.ts \
  employee-run-service.test.ts \
  skill-import-and-run-service.test.ts \
  chat-stream-events.test.ts
```

- [ ] Run package checks:

```bash
pnpm -C packages/nextclaw-digital-employee lint
pnpm -C packages/nextclaw-digital-employee tsc
pnpm -C packages/nextclaw-digital-employee build
```

- [ ] Manually verify in the employee chat page:

```text
1. 打开 /employees/:id/chat
2. 创建新会话并确认侧边栏出现
3. 在会话 A、会话 B 各发送一条消息，确认历史互不串线
4. 刷新页面后确认当前会话与历史消息仍可读取
5. 发送长任务，确认 UI 持续收到流式事件
6. 点击取消，确认 run 状态变为 aborted，页面停止流式输出
```

---

## Self-Review

### Spec coverage

- 多会话：Task 1, Task 3, Task 4
- 按 `sessionKey` 统一历史：Task 2, Task 3, Task 4
- 聊天入库：Task 1, Task 2
- 复用现有 `run_records / run_events`：Task 2, Task 5
- SSE + 取消：Task 5

### Placeholder scan

- No placeholder markers remain in task content
- Every code-changing step includes code blocks
- Every test step includes an exact command and an expected failure/pass shape

### Type consistency

- `sessionKey` is the single external chat session identifier across migration, repositories, service, API, and UI
- `run_records.session_key` is the canonical run-to-session link
- `chat_sessions.id` is the internal FK target for `chat_messages.session_id`
