# Scheduled Task Dispatch Target Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让定时任务在创建/修改时从自然语言提示词中编译出稳定的投递目标，执行时按已保存目标确定性回送结果，并顺手统一 `/new` 命令解析入口。

**Architecture:** 在 `employee_schedule_jobs` 上新增 `dispatchTarget` 持久化字段，把原始提示词编译成“业务执行提示词 + 结构化投递目标”。`schedule` 创建/更新走同一个 compiler；调度执行只使用编译后的结构化目标发送结果，不再让运行期模型重新判断渠道。会话命令则升级为共享 parser，按 UI / channel / direct surface policy 分别消费。

**Tech Stack:** TypeScript, Nitro/H3, Knex, Vitest, NextClaw core session/message pipeline

---

## File Map

**Create**
- `packages/nextclaw-digital-employee/migrations/20260423120000_schedule_dispatch_target.ts`
  为 `employee_schedule_jobs` 增加 `task_prompt_raw`、`dispatch_*` 字段，并做历史数据回填。
- `packages/nextclaw-core/src/agent/delivery-context.ts`
  定义强类型 `DeliveryContextSnapshot`，供 core loop、extension tools、schedule compiler 共享。
- `packages/nextclaw-digital-employee/server/services/scheduled-task-dispatch.ts`
  定义 `DispatchMode`、`DispatchTarget`、序列化/反序列化与摘要格式化函数。
- `packages/nextclaw-digital-employee/server/services/scheduled-task-compiler.ts`
  把原始提示词编译成 `compiledPrompt + dispatchTarget + dispatchSummary`。
- `packages/nextclaw-digital-employee/tests/employee-schedule-job-repository.test.ts`
  覆盖 migration/repository 对 `taskPromptRaw / dispatchTarget` 新字段的 round-trip。
- `packages/nextclaw-digital-employee/tests/scheduled-task-compiler.test.ts`
  覆盖 `inherit / fixed / none`、重名歧义、未找到目标、剥离路由语义等核心路径。

**Modify**
- `packages/nextclaw-digital-employee/server/repositories/employee-schedule-job-repository.ts`
  暴露新字段到 repository input/view。
- `packages/nextclaw-digital-employee/server/services/automation-service.ts`
  在 `createJob/updateJob` 时调用 compiler，在调度完成后按 `dispatchTarget` 发消息。
- `packages/nextclaw-digital-employee/server/engine/platform-schedule-tool.ts`
  透出编译后的 `dispatchSummary`，并允许调度工具拿到当前 delivery context。
- `packages/nextclaw-digital-employee/server/api/employees/[id]/jobs.post.ts`
  创建任务时返回新字段。
- `packages/nextclaw-digital-employee/server/api/employees/[id]/jobs/[jobId].patch.ts`
  更新任务时复用同一编译逻辑。
- `packages/nextclaw-digital-employee/shared/api-types.ts`
  同步 `ScheduleJob / JobsPayload` 新字段，避免 UI / API 类型漂移。
- `packages/nextclaw-core/src/extensions/types.ts`
  给 `ExtensionToolContext` 增加 `deliveryContext`。
- `packages/nextclaw-core/src/agent/loop.ts`
  把 `last_delivery_context` 透给 extension tools。
- `packages/nextclaw-core/src/agent/tools/message.ts`
  改用共享 `DeliveryContextSnapshot`，不再在 message tool 内部把 delivery context 当作裸 `Record`。
- `packages/nextclaw-core/src/agent/tools/sessions.ts`
  改用共享 `DeliveryContextSnapshot` 读取 `last_delivery_context`，避免多处各自解析 raw object。
- `packages/nextclaw-digital-employee/app/pages/employees/[id]/jobs.vue`
  主要展示编译后的执行提示词与投递摘要；原始提示词仅用于编辑/详情。
- `packages/nextclaw-digital-employee/app/components/employees/JobFormDialog.vue`
  提示用户可以直接在提示词里写“发到钉钉销售群/飞书张三”。
- `packages/nextclaw-digital-employee/shared/chat-command.ts`
  从布尔判断升级成结构化 parser。
- `packages/nextclaw-digital-employee/app/pages/employees/[id]/chat.vue`
  使用共享 parser 的意图结果做 UI `/new` 乐观处理。
- `packages/nextclaw-digital-employee/server/services/employee-run-service.ts`
  服务端 UI 聊天入口改用共享 parser + surface policy。
- `packages/nextclaw-digital-employee/server/runtime/channel-runtime.ts`
  渠道入口改用共享 parser + surface policy。
- `packages/nextclaw-digital-employee/tests/automation-service.test.ts`
  增加任务创建、更新、执行后回送的集成测试。
- `packages/nextclaw-digital-employee/tests/platform-schedule-tool.test.ts`
  验证 `schedule` 工具在不同上下文下的 `inherit/fixed/none` 行为。
- `packages/nextclaw-digital-employee/tests/chat-command.test.ts`
  parser 单测。
- `packages/nextclaw-digital-employee/tests/employee-chat-command.test.ts`
  UI surface policy 单测。
- `packages/nextclaw-digital-employee/tests/channel-runtime-command.test.ts`
  channel surface policy 单测。

## Chunk 1: Dispatch Data Contract

### Task 1: Add persistence for compiled dispatch targets

**Files:**
- Create: `packages/nextclaw-digital-employee/migrations/20260423120000_schedule_dispatch_target.ts`
- Modify: `packages/nextclaw-digital-employee/server/repositories/employee-schedule-job-repository.ts`
- Test: `packages/nextclaw-digital-employee/tests/employee-schedule-job-repository.test.ts`

- [ ] **Step 1: Write the failing persistence test against the migrated test DB fixture**

```ts
const db = createTestKnex();
await ensureTestDatabase(db); // runs migrated test DB setup from tests/test-db.ts
const repo = new EmployeeScheduleJobRepository(db);
expect(job.taskPromptRaw).toBe("每天 9 点汇总昨天的销售数据，发到钉钉销售群");
expect(job.dispatchMode).toBe("fixed");
expect(job.dispatchTarget?.peerKind).toBe("group");
expect(job.dispatchSummary).toContain("钉钉");
expect(job.dispatchTarget?.chatId).toBe("cid-sales");
```

- [ ] **Step 2: Run the targeted test and confirm it fails**

Run: `pnpm -C packages/nextclaw-digital-employee exec vitest run tests/employee-schedule-job-repository.test.ts`
Expected: FAIL because `EmployeeScheduleJobView` 还没有 `taskPromptRaw / dispatchMode / dispatchSummary / dispatchTarget`

- [ ] **Step 3: Add the migration**

```ts
await knex.schema.alterTable("employee_schedule_jobs", (t) => {
  t.text("task_prompt_raw").notNullable().defaultTo("");
  t.string("dispatch_mode").notNullable().defaultTo("none");
  t.string("dispatch_channel").nullable();
  t.string("dispatch_peer_kind").nullable();
  t.string("dispatch_chat_id").nullable();
  t.string("dispatch_account_id").nullable();
  t.text("dispatch_metadata_json").nullable();
  t.string("dispatch_summary").nullable();
});
```

- [ ] **Step 4: Backfill historical rows in the migration**

```ts
await knex("employee_schedule_jobs").update({
  task_prompt_raw: knex.ref("task_prompt"),
  dispatch_mode: "none",
});
```

- [ ] **Step 5: Extend repository record/view/input types**

```ts
export type EmployeeScheduleJobView = {
  taskPrompt: string;
  taskPromptRaw: string;
  dispatchMode: "inherit" | "fixed" | "none";
  dispatchSummary: string | null;
  dispatchTarget: DispatchTarget | null;
};
```

- [ ] **Step 6: Re-run the targeted test**

Run: `pnpm -C packages/nextclaw-digital-employee exec vitest run tests/employee-schedule-job-repository.test.ts`
Expected: PASS（验证 migration + repository 对新字段的读写契约已经闭合）

- [ ] **Step 7: Commit**

```bash
git add packages/nextclaw-digital-employee/migrations/20260423120000_schedule_dispatch_target.ts packages/nextclaw-digital-employee/server/repositories/employee-schedule-job-repository.ts packages/nextclaw-digital-employee/tests/employee-schedule-job-repository.test.ts
git commit -m "feat: persist compiled dispatch targets for schedule jobs"
```

### Task 2: Thread delivery context into extension tools

**Files:**
- Create: `packages/nextclaw-core/src/agent/delivery-context.ts`
- Modify: `packages/nextclaw-core/src/extensions/types.ts`
- Modify: `packages/nextclaw-core/src/agent/loop.ts`
- Modify: `packages/nextclaw-core/src/agent/tools/message.ts`
- Modify: `packages/nextclaw-core/src/agent/tools/sessions.ts`
- Test: `packages/nextclaw-digital-employee/tests/platform-schedule-tool.test.ts`

- [ ] **Step 1: Write the failing tool-context test**

```ts
expect(scheduleToolContext.deliveryContext).toMatchObject({
  channel: "dingtalk",
  chatId: "user-123",
  accountId: "ops-bot",
});
```

- [ ] **Step 2: Run the targeted test and confirm it fails**

Run: `pnpm -C packages/nextclaw-digital-employee exec vitest run tests/platform-schedule-tool.test.ts`
Expected: FAIL because `ExtensionToolContext` 还没有 `deliveryContext`

- [ ] **Step 3: Extend `ExtensionToolContext`**

```ts
export type DeliveryContextSnapshot = {
  channel: string;
  chatId: string;
  replyTo?: string;
  accountId?: string;
  metadata?: Record<string, unknown>;
};

export function normalizeDeliveryContext(raw: unknown): DeliveryContextSnapshot | null
```

- [ ] **Step 4: Use the shared type in `ExtensionToolContext` and the compiler boundary**

```ts
export type ExtensionToolContext = {
  sessionKey?: string;
  channel?: string;
  chatId?: string;
  deliveryContext?: DeliveryContextSnapshot;
};
```

- [ ] **Step 5: Replace raw delivery-context parsing in `message.ts` and `sessions.ts`**

Rules:
- `MessageTool` 内部的 `deliveryContext` 字段改成 `DeliveryContextSnapshot`
- `sessions.ts` 读取 `metadata.last_delivery_context` 时先走共享 normalize/guard
- `loop.ts` 从 session metadata 注入 extension tool context 时也必须先走 `normalizeDeliveryContext`
- 除 normalize helper 外，禁止继续在这些路径里直接使用 `Record<string, unknown>` 表达 delivery context

- [ ] **Step 6: Pass `last_delivery_context` from the agent loop**

```ts
const deliveryContext = normalizeDeliveryContext(session.metadata.last_delivery_context);
this.currentExtensionToolContext = {
  ...existing,
  ...(deliveryContext ? { deliveryContext } : {}),
};
```

- [ ] **Step 7: Re-run the targeted test**

Run: `pnpm -C packages/nextclaw-digital-employee exec vitest run tests/platform-schedule-tool.test.ts`
Expected: FAIL moves from missing context to missing compiler behavior

- [ ] **Step 8: Commit**

```bash
git add packages/nextclaw-core/src/agent/delivery-context.ts packages/nextclaw-core/src/extensions/types.ts packages/nextclaw-core/src/agent/loop.ts packages/nextclaw-core/src/agent/tools/message.ts packages/nextclaw-core/src/agent/tools/sessions.ts packages/nextclaw-digital-employee/tests/platform-schedule-tool.test.ts
git commit -m "feat: expose delivery context to extension tools"
```

### Task 3: Build the scheduled-task compiler

**Files:**
- Create: `packages/nextclaw-digital-employee/server/services/scheduled-task-dispatch.ts`
- Create: `packages/nextclaw-digital-employee/server/services/scheduled-task-compiler.ts`
- Test: `packages/nextclaw-digital-employee/tests/scheduled-task-compiler.test.ts`

- [ ] **Step 1: Write failing compiler tests**

```ts
expect(result.compiledPrompt).toBe("每天 9 点汇总昨天的销售数据");
expect(result.dispatchTarget).toEqual({
  mode: "fixed",
  channel: "dingtalk",
  accountId: "ops-bot",
  peerKind: "group",
  chatId: "cid-sales",
});
expect(result.dispatchSummary).toBe("发送到 钉钉 / 销售群");
```

- [ ] **Step 2: Add edge-case tests**

```ts
expect(error.message).toContain("找到多个匹配");
expect(result.dispatchTarget?.mode).toBe("inherit");
expect(result.dispatchTarget?.mode).toBe("none");
```

- [ ] **Step 3: Run the new compiler test file**

Run: `pnpm -C packages/nextclaw-digital-employee exec vitest run tests/scheduled-task-compiler.test.ts`
Expected: FAIL because compiler files do not exist

- [ ] **Step 4: Implement shared dispatch types**

```ts
export type DispatchTarget =
  | { mode: "none" }
  | { mode: "inherit"; channel: string; chatId: string; peerKind: "direct" | "group"; accountId?: string; metadata?: Record<string, unknown> }
  | { mode: "fixed"; channel: string; peerKind: "direct" | "group"; chatId: string; accountId?: string; metadata?: Record<string, unknown> };
```

- [ ] **Step 5: Implement compiler service**

```ts
type CompileScheduledTaskResult = {
  compiledPrompt: string;
  dispatchTarget: DispatchTarget;
  dispatchSummary: string | null;
};
```

Implementation rules:
- 先识别 `发到钉钉... / 发给飞书... / 通知...`
- 解析目标到稳定 ID
- 从执行提示词里剥离路由语义
- 在非消息上下文且未显式指定目标时返回 `mode: "none"`
- 在消息上下文且未显式指定目标时返回 `mode: "inherit"`

- [ ] **Step 6: Re-run compiler tests**

Run: `pnpm -C packages/nextclaw-digital-employee exec vitest run tests/scheduled-task-compiler.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/nextclaw-digital-employee/server/services/scheduled-task-dispatch.ts packages/nextclaw-digital-employee/server/services/scheduled-task-compiler.ts packages/nextclaw-digital-employee/tests/scheduled-task-compiler.test.ts
git commit -m "feat: compile schedule prompts into dispatch targets"
```

## Chunk 2: Schedule Create/Update/Execute Flow

### Task 4: Compile prompts on job create/update

**Files:**
- Modify: `packages/nextclaw-digital-employee/server/services/automation-service.ts`
- Modify: `packages/nextclaw-digital-employee/server/engine/platform-schedule-tool.ts`
- Modify: `packages/nextclaw-digital-employee/server/api/employees/[id]/jobs.post.ts`
- Modify: `packages/nextclaw-digital-employee/server/api/employees/[id]/jobs/[jobId].patch.ts`
- Modify: `packages/nextclaw-digital-employee/shared/api-types.ts`
- Test: `packages/nextclaw-digital-employee/tests/automation-service.test.ts`
- Test: `packages/nextclaw-digital-employee/tests/platform-schedule-tool.test.ts`

- [ ] **Step 1: Write failing service tests for create/update**

```ts
expect(created.taskPromptRaw).toBe(rawPrompt);
expect(created.taskPrompt).toBe("汇总昨天的销售数据");
expect(created.dispatchMode).toBe("fixed");
expect(updated.dispatchSummary).toBe("发送到 飞书 / 张三");
```

- [ ] **Step 2: Run the targeted service tests**

Run: `pnpm -C packages/nextclaw-digital-employee exec vitest run tests/automation-service.test.ts tests/platform-schedule-tool.test.ts`
Expected: FAIL because `createJob/updateJob` 还没调用 compiler

- [ ] **Step 3: Thread compiler dependencies into `AutomationService`**

```ts
const compiled = await this.taskCompiler.compile({
  rawPrompt: input.taskPrompt ?? "",
  deliveryContext: input.deliveryContext ?? null,
});
```

`deliveryContext` 注入约定必须在这里写清楚：
- `schedule` tool 从 `ExtensionToolContext.deliveryContext` 传入
- UI / REST API 创建任务默认传 `null`
- 未来若有 webhook / channel 管理入口创建任务，可显式传入快照

- [ ] **Step 4: Persist both raw and compiled values**

```ts
taskPromptRaw: input.taskPrompt ?? "",
taskPrompt: compiled.compiledPrompt,
dispatchMode: compiled.dispatchTarget.mode,
dispatchSummary: compiled.dispatchSummary,
dispatchTarget: compiled.dispatchTarget,
```

- [ ] **Step 5: Update `schedule` tool contract**

The tool still accepts plain `taskPrompt`, but its response must expose:

```ts
{
  job: {
    taskPrompt: "...compiled prompt...",
    taskPromptRaw: "...original prompt...",
    dispatchMode: "inherit",
    dispatchSummary: "回到当前钉钉对话"
  }
}
```

- [ ] **Step 6: Sync shared DTOs before touching UI**

```ts
export type ScheduleJob = {
  taskPrompt: string;      // compiled prompt
  taskPromptRaw: string;   // original user prompt
  dispatchMode: "inherit" | "fixed" | "none";
  dispatchSummary: string | null;
};
```

- [ ] **Step 7: Re-run the targeted service tests**

Run: `pnpm -C packages/nextclaw-digital-employee exec vitest run tests/automation-service.test.ts tests/platform-schedule-tool.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/nextclaw-digital-employee/server/services/automation-service.ts packages/nextclaw-digital-employee/server/engine/platform-schedule-tool.ts packages/nextclaw-digital-employee/server/api/employees/[id]/jobs.post.ts packages/nextclaw-digital-employee/server/api/employees/[id]/jobs/[jobId].patch.ts packages/nextclaw-digital-employee/shared/api-types.ts packages/nextclaw-digital-employee/tests/automation-service.test.ts packages/nextclaw-digital-employee/tests/platform-schedule-tool.test.ts
git commit -m "feat: compile schedule prompts on create and update"
```

### Task 5: Dispatch scheduled run results deterministically

**Files:**
- Modify: `packages/nextclaw-digital-employee/server/services/automation-service.ts`
- Test: `packages/nextclaw-digital-employee/tests/automation-service.test.ts`

- [ ] **Step 1: Write the failing post-run dispatch test**

```ts
expect(publishedOutbound).toMatchObject({
  channel: "dingtalk",
  chatId: "cid-sales",
  content: "昨日销售汇总：...",
});
```

- [ ] **Step 2: Add a guard test against duplicate sends**

```ts
expect(sendCount).toBe(1);
expect(runResult.reply).toContain("昨日销售汇总");
expect(legacyDispatchCount).toBe(0);
```

- [ ] **Step 3: Run the targeted test**

Run: `pnpm -C packages/nextclaw-digital-employee exec vitest run tests/automation-service.test.ts`
Expected: FAIL because scheduled jobs currently only return `result.reply`

- [ ] **Step 4: Dispatch after successful scheduled execution**

```ts
if (job.dispatchMode !== "none" && result.reply.trim()) {
  await this.gateway.messageBus.publishOutbound({
    channel: resolved.channel,
    chatId: resolved.chatId,
    content: result.reply,
    media: [],
    metadata: resolved.metadata ?? {},
  });
}
```

- [ ] **Step 5: Resolve `inherit` vs `fixed` using saved target only**

Rules:
- `inherit` uses the delivery context snapshotted at create/update time
- `fixed` uses the parsed explicit target
- `none` skips outbound delivery
- No runtime LLM re-routing
- Reuse the same dispatch helper for `ejob:` / legacy `employee:` / legacy `agentId` branches; legacy branches may resolve to `mode: "none"`, but external delivery must still be centralized in one helper

- [ ] **Step 6: Re-run the targeted test**

Run: `pnpm -C packages/nextclaw-digital-employee exec vitest run tests/automation-service.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/nextclaw-digital-employee/server/services/automation-service.ts packages/nextclaw-digital-employee/tests/automation-service.test.ts
git commit -m "feat: deliver scheduled results through compiled dispatch targets"
```

### Task 6: Surface dispatch summaries in the jobs UI

**Files:**
- Modify: `packages/nextclaw-digital-employee/app/pages/employees/[id]/jobs.vue`
- Modify: `packages/nextclaw-digital-employee/app/components/employees/JobFormDialog.vue`
- Modify: `packages/nextclaw-digital-employee/shared/api-types.ts`
- Test: `packages/nextclaw-digital-employee/tests/ui-models.test.ts`

- [ ] **Step 1: Add a failing UI model or component test**

```ts
expect(rendered.text()).toContain("回到当前钉钉对话");
expect(rendered.text()).toContain("汇总昨天的销售数据");
```

- [ ] **Step 2: Run the targeted frontend test**

Run: `pnpm -C packages/nextclaw-digital-employee exec vitest run tests/ui-models.test.ts`
Expected: FAIL because UI does not render dispatch summary fields

- [ ] **Step 3: Update jobs list cards**

Render:
- 编译后的执行提示词（主展示）
- 投递摘要（系统编译结果）
- 原始提示词只在编辑表单或详情区域展示，不占 jobs 列表主卡片

- [ ] **Step 4: Update the form hint**

Example helper text:

```text
你可以直接写“完成后发到钉钉销售群”或“发给飞书张三”；系统会在保存任务时解析成固定投递目标。
```

- [ ] **Step 5: Re-run the targeted frontend test**

Run: `pnpm -C packages/nextclaw-digital-employee exec vitest run tests/ui-models.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/nextclaw-digital-employee/app/pages/employees/[id]/jobs.vue packages/nextclaw-digital-employee/app/components/employees/JobFormDialog.vue packages/nextclaw-digital-employee/shared/api-types.ts packages/nextclaw-digital-employee/tests/ui-models.test.ts
git commit -m "feat: surface compiled dispatch summaries in jobs ui"
```

## Chunk 3: Shared Conversation Command Parsing

### Task 7: Replace boolean reset checks with a shared parser + surface policies

**Files:**
- Modify: `packages/nextclaw-digital-employee/shared/chat-command.ts`
- Modify: `packages/nextclaw-digital-employee/app/pages/employees/[id]/chat.vue`
- Modify: `packages/nextclaw-digital-employee/server/services/employee-run-service.ts`
- Modify: `packages/nextclaw-digital-employee/server/runtime/channel-runtime.ts`
- Test: `packages/nextclaw-digital-employee/tests/chat-command.test.ts`
- Test: `packages/nextclaw-digital-employee/tests/employee-chat-command.test.ts`
- Test: `packages/nextclaw-digital-employee/tests/channel-runtime-command.test.ts`

- [ ] **Step 1: Write parser and policy tests**

```ts
expect(parseConversationCommand("/new")).toEqual({ kind: "reset_conversation" });
expect(parseConversationCommand(" /RESET ")).toEqual({ kind: "reset_conversation" });
expect(parseConversationCommand(" /ReSeT please ")).toEqual({ kind: "reset_conversation" });
expect(parseConversationCommand("/new please")).toEqual({ kind: "reset_conversation" });
expect(parseConversationCommand("/status")).toBeNull();
expect(uiPolicy("reset_conversation")).toBe("create_new_chat_session");
expect(channelPolicy("reset_conversation")).toBe("clear_runtime_session");
```

- [ ] **Step 2: Run the targeted command tests**

Run: `pnpm -C packages/nextclaw-digital-employee exec vitest run tests/chat-command.test.ts tests/employee-chat-command.test.ts tests/channel-runtime-command.test.ts`
Expected: FAIL because the shared parser/policy contract does not exist

- [ ] **Step 3: Implement the parser**

```ts
export type ConversationCommand = { kind: "reset_conversation" };

export function parseConversationCommand(input: string): ConversationCommand | null
```

- [ ] **Step 4: Convert each surface to policy-driven handling**

Policies:
- UI -> create local draft session / server fallback creates persistent session
- channel -> clear bound runtime session and send humanized reply
- direct server path -> create fresh persistent chat session

- [ ] **Step 5: Re-run the targeted tests**

Run: `pnpm -C packages/nextclaw-digital-employee exec vitest run tests/chat-command.test.ts tests/employee-chat-command.test.ts tests/channel-runtime-command.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/nextclaw-digital-employee/shared/chat-command.ts packages/nextclaw-digital-employee/app/pages/employees/[id]/chat.vue packages/nextclaw-digital-employee/server/services/employee-run-service.ts packages/nextclaw-digital-employee/server/runtime/channel-runtime.ts packages/nextclaw-digital-employee/tests/chat-command.test.ts packages/nextclaw-digital-employee/tests/employee-chat-command.test.ts packages/nextclaw-digital-employee/tests/channel-runtime-command.test.ts
git commit -m "refactor: unify conversation command parsing by surface"
```

### Task 8: Final verification and docs

**Files:**
- Modify: `packages/nextclaw-digital-employee/tests/automation-service.test.ts`
- Modify: `packages/nextclaw-digital-employee/tests/platform-schedule-tool.test.ts`
- Modify: `packages/nextclaw-digital-employee/tests/scheduled-task-compiler.test.ts`
- Modify: `docs/logs/<new-iteration>/README.md`

- [ ] **Step 1: Run the focused backend test suite**

Run:

```bash
pnpm -C packages/nextclaw-digital-employee exec vitest run \
  tests/employee-schedule-job-repository.test.ts \
  tests/scheduled-task-compiler.test.ts \
  tests/automation-service.test.ts \
  tests/platform-schedule-tool.test.ts \
  tests/ui-models.test.ts \
  tests/chat-command.test.ts \
  tests/employee-chat-command.test.ts \
  tests/channel-runtime-command.test.ts
```

Expected: PASS

- [ ] **Step 2: Run type checking**

Run: `pnpm -C packages/nextclaw-digital-employee tsc`
Expected: exit 0

- [ ] **Step 3: Run targeted lint**

Run:

```bash
pnpm -C packages/nextclaw-digital-employee exec eslint \
  'server/services/scheduled-task-compiler.ts' \
  'server/services/scheduled-task-dispatch.ts' \
  'server/services/automation-service.ts' \
  'server/engine/platform-schedule-tool.ts' \
  'app/pages/employees/[id]/jobs.vue' \
  'app/components/employees/JobFormDialog.vue' \
  'shared/chat-command.ts' \
  'app/pages/employees/[id]/chat.vue' \
  'server/services/employee-run-service.ts' \
  'server/runtime/channel-runtime.ts'
```

Expected: exit 0

- [ ] **Step 4: Run minimal `/new` behavior smoke outside repo-local runtime data**

Run:

```bash
NEXTCLAW_HOME=/tmp/nextclaw-smoke-chat-command \
pnpm -C packages/nextclaw-digital-employee exec vitest run tests/employee-chat-command.test.ts tests/channel-runtime-command.test.ts
```

Expected: PASS without writing runtime data into the repo, and explicit observation notes must confirm:
- UI `/new` -> fresh internal chat session key
- channel `/new` -> current peer runtime session cleared + humanized reply emitted
- If a local browser session is available, also do one manual page smoke on the employee chat page:
  - open the chat UI
  - type `/new`
  - confirm active session switches to a fresh draft and message list resets

- [ ] **Step 5: Update iteration log with commands and observations**

Record:
- which prompt compiled to `inherit / fixed / none`
- one successful scheduled dispatch observation
- `/new` behavior in UI and channel paths

- [ ] **Step 6: Commit**

```bash
git add packages/nextclaw-digital-employee/tests docs/logs
git commit -m "test: verify scheduled dispatch targets and command parser unification"
```
