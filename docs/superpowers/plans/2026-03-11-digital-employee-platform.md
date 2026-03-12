# Digital Employee Platform Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first usable version of the NextClaw digital employee platform with employee management, skill import, chat, automation, run records, and the project management assistant scenario.

**Architecture:** Implement a Nuxt application in `packages/nextclaw-digital-employee` and keep all NextClaw runtime access behind `server/engine/NextclawEngineGateway`. Reuse `@nextclaw/core`, `@nextclaw/runtime`, and `@nextclaw/openclaw-compat` for execution, scheduling, session, skills, and channel compatibility while storing platform-owned business state in SQLite via Knex.

**Tech Stack:** Nuxt 3, Vue 3, TypeScript, SQLite, Knex.js, `@nextclaw/core`, `@nextclaw/runtime`, `@nextclaw/openclaw-compat`

---

## Chunk 1: Workspace Scaffold

### Task 1: Create package skeleton

**Files:**
- Create: `packages/nextclaw-digital-employee/package.json`
- Create: `packages/nextclaw-digital-employee/nuxt.config.ts`
- Create: `packages/nextclaw-digital-employee/tsconfig.json`
- Create: `packages/nextclaw-digital-employee/app/app.vue`
- Create: `packages/nextclaw-digital-employee/app/pages/index.vue`

- [ ] Add the Nuxt workspace package with scripts for `dev`, `build`, `lint`, and `tsc`.
- [ ] Wire workspace dependencies to `@nextclaw/core`, `@nextclaw/runtime`, and `@nextclaw/openclaw-compat` using `workspace:*`.
- [ ] Add the minimal Nuxt entry page and verify the package can boot.
- [ ] Run the package-level install/build checks required by the repo once files exist.

### Task 2: Add database foundation

**Files:**
- Create: `packages/nextclaw-digital-employee/server/db/knex.ts`
- Create: `packages/nextclaw-digital-employee/server/db/migrations/0001_initial.ts`
- Create: `packages/nextclaw-digital-employee/server/db/schema.ts`

- [ ] Initialize Knex for SQLite.
- [ ] Create the phase-one tables: `employees`, `employee_skills`, `employee_schedules`, `skill_installations`, `integration_connections`, `run_records`, `run_events`.
- [ ] Add a schema bootstrap utility for local development and tests.
- [ ] Verify migrations can run on a clean SQLite file.

## Chunk 2: Engine Gateway

### Task 3: Build the runtime boundary

**Files:**
- Create: `packages/nextclaw-digital-employee/server/engine/NextclawEngineGateway.ts`
- Create: `packages/nextclaw-digital-employee/server/engine/types.ts`
- Create: `packages/nextclaw-digital-employee/server/engine/runtime-context.ts`

- [ ] Define a stable gateway interface for skill listing, skill import, employee turn execution, schedule registration, and run event retrieval.
- [ ] Import `@nextclaw/runtime` once to register built-in providers/channels.
- [ ] Wrap `SkillsLoader`, `SessionManager`, `CronService`, and `HeartbeatService`.
- [ ] Keep all direct NextClaw imports inside `server/engine`.
- [ ] Add a smoke-level verification path that exercises `listSkills`.

### Task 4: Mirror engine events to platform records

**Files:**
- Create: `packages/nextclaw-digital-employee/server/services/run-record-service.ts`
- Modify: `packages/nextclaw-digital-employee/server/engine/NextclawEngineGateway.ts`

- [ ] Define how one execution creates `run_records`.
- [ ] Mirror session/events into `run_events` with a stable sequence order.
- [ ] Ensure both manual and scheduled runs use the same record creation path.
- [ ] Verify a simple run can persist events and final status.

## Chunk 3: Employee Management

### Task 5: Employee repository and APIs

**Files:**
- Create: `packages/nextclaw-digital-employee/server/repositories/employee-repository.ts`
- Create: `packages/nextclaw-digital-employee/server/api/employees/index.get.ts`
- Create: `packages/nextclaw-digital-employee/server/api/employees/index.post.ts`
- Create: `packages/nextclaw-digital-employee/server/api/employees/[id].get.ts`
- Create: `packages/nextclaw-digital-employee/server/api/employees/[id].patch.ts`

- [ ] Implement employee CRUD.
- [ ] Persist system prompt, status, skill bindings, and schedule config.
- [ ] Validate request payloads.
- [ ] Return data in a frontend-friendly shape.

### Task 6: Employee UI

**Files:**
- Create: `packages/nextclaw-digital-employee/app/pages/employees/index.vue`
- Create: `packages/nextclaw-digital-employee/app/pages/employees/[id].vue`
- Create: `packages/nextclaw-digital-employee/app/components/employees/EmployeeForm.vue`
- Create: `packages/nextclaw-digital-employee/app/composables/useEmployees.ts`

- [ ] Build employee list and detail pages.
- [ ] Support create/edit/enable/disable flows.
- [ ] Include schedule setup in the create/edit form.
- [ ] Show linked skills and recent runs on the detail page.

## Chunk 4: Skills Management

### Task 7: Skill installation backend

**Files:**
- Create: `packages/nextclaw-digital-employee/server/repositories/skill-installation-repository.ts`
- Create: `packages/nextclaw-digital-employee/server/services/skill-install-service.ts`
- Create: `packages/nextclaw-digital-employee/server/api/skills/index.get.ts`
- Create: `packages/nextclaw-digital-employee/server/api/skills/import.post.ts`
- Create: `packages/nextclaw-digital-employee/server/api/skills/[name].patch.ts`

- [ ] Implement local-path import.
- [ ] Implement Git-source import.
- [ ] Record source metadata and enabled state.
- [ ] Link installed skills to the engine gateway skill loader.
- [ ] Add usage-reference queries for employee bindings.

### Task 8: Skill management UI

**Files:**
- Create: `packages/nextclaw-digital-employee/app/pages/skills/index.vue`
- Create: `packages/nextclaw-digital-employee/app/components/skills/SkillImportForm.vue`
- Create: `packages/nextclaw-digital-employee/app/components/skills/SkillList.vue`

- [ ] Show installed skill list with source, version, and enabled state.
- [ ] Support import from local path or Git.
- [ ] Support enable/disable.
- [ ] Surface which employees reference each skill.

## Chunk 5: Chat and Manual Execution

### Task 9: Chat APIs

**Files:**
- Create: `packages/nextclaw-digital-employee/server/api/employees/[id]/chat.post.ts`
- Create: `packages/nextclaw-digital-employee/server/api/employees/[id]/runs.get.ts`
- Create: `packages/nextclaw-digital-employee/server/api/runs/[id].get.ts`

- [ ] Route one user message into `NextclawEngineGateway.runEmployeeTurn`.
- [ ] Return the assistant reply and linked run metadata.
- [ ] Provide run list and run detail endpoints.
- [ ] Verify chat-triggered runs create the same run record shape as scheduled runs.

### Task 10: Chat UI

**Files:**
- Create: `packages/nextclaw-digital-employee/app/pages/employees/[id]/chat.vue`
- Create: `packages/nextclaw-digital-employee/app/components/chat/EmployeeChatPanel.vue`
- Create: `packages/nextclaw-digital-employee/app/components/chat/RunSidebar.vue`

- [ ] Build the employee chat page.
- [ ] Show conversation messages and linked run state.
- [ ] Allow manual triggering from chat.
- [ ] Show recent run details beside the chat context.

## Chunk 6: Automation and Integrations

### Task 11: Schedule runtime integration

**Files:**
- Modify: `packages/nextclaw-digital-employee/server/engine/NextclawEngineGateway.ts`
- Create: `packages/nextclaw-digital-employee/server/services/schedule-service.ts`
- Create: `packages/nextclaw-digital-employee/server/api/employees/[id]/schedule.patch.ts`

- [ ] Materialize employee schedules into `CronService` and `HeartbeatService`.
- [ ] Ensure schedule changes update runtime jobs.
- [ ] Support manual rerun of scheduled jobs for debugging.
- [ ] Verify one cron run and one heartbeat run end-to-end.

### Task 12: Integration settings

**Files:**
- Create: `packages/nextclaw-digital-employee/server/repositories/integration-connection-repository.ts`
- Create: `packages/nextclaw-digital-employee/server/api/integrations/index.get.ts`
- Create: `packages/nextclaw-digital-employee/server/api/integrations/index.post.ts`
- Create: `packages/nextclaw-digital-employee/app/pages/integrations/index.vue`

- [ ] Persist integration connection metadata and business targets.
- [ ] Reuse NextClaw credential schema/secret resolution for secrets.
- [ ] Keep business target config platform-owned.
- [ ] Surface employee-to-integration relationships in the UI.

## Chunk 7: Project Management Assistant Closure

### Task 13: Ship the reference employee flow

**Files:**
- Create: `packages/nextclaw-digital-employee/server/services/reference-employees/project-manager-assistant.ts`
- Create: `packages/nextclaw-digital-employee/app/components/employees/ProjectManagerAssistantPreset.vue`
- Modify: `packages/nextclaw-digital-employee/server/services/schedule-service.ts`

- [ ] Add a preset for the project management assistant.
- [ ] Define recommended skills, prompt, output contract, and default schedule.
- [ ] Support report structure: AI summary, project dimension, owner/member dimension.
- [ ] Verify a full smoke flow from data retrieval to DingTalk push result recording.

### Task 14: Docs and release readiness

**Files:**
- Create: `packages/nextclaw-digital-employee/README.md`
- Modify: `docs/logs/<next-iteration>/README.md`

- [ ] Document local development, configuration, and verification commands.
- [ ] Document skill import expectations and trust boundaries.
- [ ] Record the smoke test path and expected observations.
- [ ] Prepare release notes inputs once implementation is complete.
