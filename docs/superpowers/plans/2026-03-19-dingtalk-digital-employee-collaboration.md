# DingTalk Digital Employee Collaboration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the built-in DingTalk channel implementation with a repo-local fork that supports DM, group entry, and multi-bot accounts, then connect it to digital employee routing and collaboration.

**Architecture:** Keep `@nextclaw/core` agent/session/handoff behavior unchanged. Replace the current bundled DingTalk plugin with a forked repo-local plugin that emits `accountId + peer` routing metadata and expose digital-employee level config for DingTalk accounts, employee bindings, and group routing. Roll the work out in four chunks so each chunk is independently testable.

**Tech Stack:** TypeScript, Vitest, NextClaw OpenClaw compatibility loader, NextClaw channel runtime, Nuxt 4, Knex/SQLite

---

## File Map

### Plugin Replacement

- Modify: `packages/extensions/nextclaw-channel-plugin-dingtalk/package.json`
- Modify: `packages/extensions/nextclaw-channel-plugin-dingtalk/openclaw.plugin.json`
- Modify: `packages/extensions/nextclaw-channel-plugin-dingtalk/index.js`
- Create: `packages/extensions/nextclaw-channel-plugin-dingtalk/tsconfig.json`
- Create: `packages/extensions/nextclaw-channel-plugin-dingtalk/src/index.ts`
- Create: `packages/extensions/nextclaw-channel-plugin-dingtalk/src/config-schema.ts`
- Create: `packages/extensions/nextclaw-channel-plugin-dingtalk/src/config.ts`
- Create: `packages/extensions/nextclaw-channel-plugin-dingtalk/src/channel.ts`
- Create: `packages/extensions/nextclaw-channel-plugin-dingtalk/src/message-normalizer.ts`
- Create: `packages/extensions/nextclaw-channel-plugin-dingtalk/src/outbound.ts`
- Create: `packages/extensions/nextclaw-channel-plugin-dingtalk/src/types.ts`
- Create: `packages/extensions/nextclaw-channel-plugin-dingtalk/src/channel.test.ts`
- Create: `packages/extensions/nextclaw-channel-plugin-dingtalk/src/config-schema.test.ts`

### Runtime / Compatibility

- Modify: `packages/nextclaw-openclaw-compat/src/plugins/loader.ts`
- Modify: `packages/nextclaw-openclaw-compat/src/plugins/loader.bundled-enable-state.test.ts`
- Modify: `packages/nextclaw-runtime/src/channels/builtin.ts` only if plugin id / package lookup requires adjustment

### Digital Employee Backend

- Modify: `packages/nextclaw-digital-employee/server/runtime/dingtalk-config.ts`
- Modify: `packages/nextclaw-digital-employee/server/runtime/platform-context.ts`
- Modify: `packages/nextclaw-digital-employee/server/engine/NextclawEngineGateway.ts`
- Modify: `packages/nextclaw-digital-employee/server/services/employee-run-service.ts`
- Modify: `packages/nextclaw-digital-employee/server/repositories/employee-repository.ts`
- Modify: `packages/nextclaw-digital-employee/server/db/schema.ts`
- Modify: `packages/nextclaw-digital-employee/server/api/integrations/dingtalk.get.ts`
- Modify: `packages/nextclaw-digital-employee/server/api/integrations/dingtalk.put.ts`
- Create: `packages/nextclaw-digital-employee/server/api/employees/[id]/dingtalk-binding.get.ts`
- Create: `packages/nextclaw-digital-employee/server/api/employees/[id]/dingtalk-binding.put.ts`
- Create: `packages/nextclaw-digital-employee/server/api/integrations/dingtalk-groups.get.ts`
- Create: `packages/nextclaw-digital-employee/server/repositories/employee-dingtalk-binding-repository.ts`
- Create: `packages/nextclaw-digital-employee/server/repositories/dingtalk-group-binding-repository.ts`
- Create: `packages/nextclaw-digital-employee/server/services/dingtalk-routing-service.ts`

### Digital Employee Frontend

- Modify: `packages/nextclaw-digital-employee/app/pages/integrations/index.vue`
- Modify: `packages/nextclaw-digital-employee/app/pages/employees/[id].vue`
- Create: `packages/nextclaw-digital-employee/app/components/DingTalkAccountEditor.vue`
- Create: `packages/nextclaw-digital-employee/app/components/EmployeeDingTalkBindingCard.vue`
- Create: `packages/nextclaw-digital-employee/app/components/DingTalkGroupBindingTable.vue`

### Tests

- Modify: `packages/nextclaw-digital-employee/tests/runtime-config.test.ts`
- Modify: `packages/nextclaw-digital-employee/tests/skill-import-and-run-service.test.ts`
- Create: `packages/nextclaw-digital-employee/tests/dingtalk-routing.test.ts`
- Create: `packages/nextclaw-digital-employee/tests/dingtalk-group-entry.test.ts`

## Chunk 1: Replace the Built-In DingTalk Plugin

### Task 1: Convert the bundled DingTalk plugin package from wrapper to real implementation

**Files:**
- Modify: `packages/extensions/nextclaw-channel-plugin-dingtalk/package.json`
- Modify: `packages/extensions/nextclaw-channel-plugin-dingtalk/openclaw.plugin.json`
- Modify: `packages/extensions/nextclaw-channel-plugin-dingtalk/index.js`
- Create: `packages/extensions/nextclaw-channel-plugin-dingtalk/tsconfig.json`
- Create: `packages/extensions/nextclaw-channel-plugin-dingtalk/src/index.ts`
- Create: `packages/extensions/nextclaw-channel-plugin-dingtalk/src/types.ts`

- [ ] Inspect the forked `soimy/openclaw-channel-dingtalk` package and copy only the runtime shape needed for this repo, keeping the package name and channel id as `dingtalk`.
- [ ] Replace the current wrapper-only entry so the package exports a real plugin implementation instead of delegating to `nextclaw-channel-runtime`.
- [ ] Add a package-local TypeScript build layout that matches existing monorepo conventions and keeps the runtime entry consumable by `nextclaw-openclaw-compat`.
- [ ] Verify `openclaw.plugin.json` still declares `dingtalk` as the only channel id and matches the plugin package metadata.
- [ ] Run: `pnpm -C packages/extensions/nextclaw-channel-plugin-dingtalk test`
- [ ] Expected: tests fail at first because config/channel implementation files are not complete yet.
- [ ] Checkpoint only if the user explicitly requests commit: stage package scaffold changes.

### Task 2: Add multi-account config schema and parser

**Files:**
- Create: `packages/extensions/nextclaw-channel-plugin-dingtalk/src/config-schema.ts`
- Create: `packages/extensions/nextclaw-channel-plugin-dingtalk/src/config.ts`
- Create: `packages/extensions/nextclaw-channel-plugin-dingtalk/src/config-schema.test.ts`

- [ ] Write failing tests for the new DingTalk config model covering `defaultAccountId`, `accounts.<accountId>`, `dmPolicy`, `groupPolicy`, `allowFrom`, and group overrides.
- [ ] Run: `pnpm -C packages/extensions/nextclaw-channel-plugin-dingtalk test -- src/config-schema.test.ts`
- [ ] Expected: FAIL because the schema/parser does not yet exist.
- [ ] Implement the schema/parser so a single legacy config can still be normalized into one default account and new multi-account configs validate directly.
- [ ] Re-run: `pnpm -C packages/extensions/nextclaw-channel-plugin-dingtalk test -- src/config-schema.test.ts`
- [ ] Expected: PASS with coverage for both legacy and multi-account cases.
- [ ] Checkpoint only if the user explicitly requests commit: stage config schema changes.

### Task 3: Add inbound/outbound message handling with DM + group semantics

**Files:**
- Create: `packages/extensions/nextclaw-channel-plugin-dingtalk/src/message-normalizer.ts`
- Create: `packages/extensions/nextclaw-channel-plugin-dingtalk/src/outbound.ts`
- Create: `packages/extensions/nextclaw-channel-plugin-dingtalk/src/channel.ts`
- Create: `packages/extensions/nextclaw-channel-plugin-dingtalk/src/channel.test.ts`

- [ ] Write failing tests that assert inbound messages preserve `accountId`, `conversationId`, `is_group`, `peer_kind`, `peer_id`, and mention metadata.
- [ ] Add a failing test that asserts outbound routing chooses the correct DingTalk account for DM vs group replies.
- [ ] Run: `pnpm -C packages/extensions/nextclaw-channel-plugin-dingtalk test -- src/channel.test.ts`
- [ ] Expected: FAIL because the runtime still lacks normalized metadata and account-aware outbound dispatch.
- [ ] Implement channel logic that:
- [ ] Uses stable conversation ids for groups instead of falling back to sender id.
- [ ] Tags inbound metadata with both camelCase and snake_case account fields for compatibility with existing `core` routing.
- [ ] Supports both DM reply and group reply code paths.
- [ ] Re-run: `pnpm -C packages/extensions/nextclaw-channel-plugin-dingtalk test -- src/channel.test.ts`
- [ ] Expected: PASS for DM, group, and mention-trigger behavior.
- [ ] Run: `pnpm -C packages/extensions/nextclaw-channel-plugin-dingtalk lint`
- [ ] Expected: PASS.

### Task 4: Make the bundled plugin loader consume the new package

**Files:**
- Modify: `packages/nextclaw-openclaw-compat/src/plugins/loader.ts`
- Modify: `packages/nextclaw-openclaw-compat/src/plugins/loader.bundled-enable-state.test.ts`

- [ ] Add/adjust tests proving the bundled DingTalk plugin is loaded from the repo-local package and not double-registered through the old channel-runtime wrapper path.
- [ ] Run: `pnpm -C packages/nextclaw-openclaw-compat test -- src/plugins/loader.bundled-enable-state.test.ts`
- [ ] Expected: FAIL until loader expectations are updated.
- [ ] Update the loader logic or fixture assumptions so bundled `dingtalk` resolves cleanly as the new implementation.
- [ ] Re-run: `pnpm -C packages/nextclaw-openclaw-compat test -- src/plugins/loader.bundled-enable-state.test.ts`
- [ ] Expected: PASS with no duplicate channel diagnostics.

## Chunk 2: Connect the New Plugin to Digital Employee Runtime

### Task 5: Upgrade digital-employee DingTalk runtime config from single bot to account map

**Files:**
- Modify: `packages/nextclaw-digital-employee/server/runtime/dingtalk-config.ts`
- Modify: `packages/nextclaw-digital-employee/tests/runtime-config.test.ts`

- [ ] Write failing tests for digital-employee runtime config read/write covering:
- [ ] legacy single-bot data still reads correctly;
- [ ] multi-account update payloads persist to `channels.dingtalk.accounts`;
- [ ] secret replacement keeps `clientSecretSet` style masking per account.
- [ ] Run: `pnpm -C packages/nextclaw-digital-employee test -- tests/runtime-config.test.ts`
- [ ] Expected: FAIL because current runtime config only knows `clientId/clientSecret/allowFrom`.
- [ ] Refactor the runtime config helper to expose:
- [ ] account list;
- [ ] default account id;
- [ ] per-account secret-set status;
- [ ] compatibility migration from legacy config.
- [ ] Re-run: `pnpm -C packages/nextclaw-digital-employee test -- tests/runtime-config.test.ts`
- [ ] Expected: PASS.

### Task 6: Ensure platform gateway boots with the replaced plugin and preserves routing metadata

**Files:**
- Modify: `packages/nextclaw-digital-employee/server/runtime/platform-context.ts`
- Modify: `packages/nextclaw-digital-employee/server/engine/NextclawEngineGateway.ts`
- Modify: `packages/nextclaw-digital-employee/tests/skill-import-and-run-service.test.ts`

- [ ] Add a failing integration test that boots the platform gateway with the new DingTalk config shape and verifies session metadata includes `agentId`, requested skills, and channel routing data.
- [ ] Run: `pnpm -C packages/nextclaw-digital-employee test -- tests/skill-import-and-run-service.test.ts`
- [ ] Expected: FAIL until gateway/runtime config pass-through is updated.
- [ ] Update `platform-context` and `NextclawEngineGateway` so the gateway default config can carry the richer DingTalk channel structure through to the plugin loader.
- [ ] Re-run: `pnpm -C packages/nextclaw-digital-employee test -- tests/skill-import-and-run-service.test.ts`
- [ ] Expected: PASS.

### Task 7: Replace the integrations API contract to manage multiple DingTalk accounts

**Files:**
- Modify: `packages/nextclaw-digital-employee/server/api/integrations/dingtalk.get.ts`
- Modify: `packages/nextclaw-digital-employee/server/api/integrations/dingtalk.put.ts`

- [ ] Update the API response shape to return the new account-map structure instead of a single top-level bot form.
- [ ] Add request validation that rejects missing account ids, duplicate ids, or invalid policy enums.
- [ ] Manually smoke the handlers through existing test harness or route-level fetches after backend tests are green.
- [ ] Run: `pnpm -C packages/nextclaw-digital-employee test -- tests/runtime-config.test.ts`
- [ ] Expected: PASS with API payload assumptions aligned to the new config model.

## Chunk 3: Add Employee and Group Routing Configuration

### Task 8: Persist employee-to-DingTalk account bindings

**Files:**
- Modify: `packages/nextclaw-digital-employee/server/db/schema.ts`
- Modify: `packages/nextclaw-digital-employee/server/repositories/employee-repository.ts`
- Create: `packages/nextclaw-digital-employee/server/repositories/employee-dingtalk-binding-repository.ts`
- Create: `packages/nextclaw-digital-employee/server/api/employees/[id]/dingtalk-binding.get.ts`
- Create: `packages/nextclaw-digital-employee/server/api/employees/[id]/dingtalk-binding.put.ts`

- [ ] Add failing repository/API tests for saving an employee’s default DingTalk account, DM enablement, and mention aliases.
- [ ] Run: `pnpm -C packages/nextclaw-digital-employee test -- tests/dingtalk-routing.test.ts`
- [ ] Expected: FAIL because no employee DingTalk binding model exists yet.
- [ ] Extend the schema/repository layer with the minimum columns or companion table needed to persist employee DingTalk entry configuration.
- [ ] Implement the GET/PUT endpoints used by the employee detail page.
- [ ] Re-run: `pnpm -C packages/nextclaw-digital-employee test -- tests/dingtalk-routing.test.ts`
- [ ] Expected: PASS for employee-level binding persistence.

### Task 9: Persist group-to-employee routing rules

**Files:**
- Create: `packages/nextclaw-digital-employee/server/repositories/dingtalk-group-binding-repository.ts`
- Create: `packages/nextclaw-digital-employee/server/api/integrations/dingtalk-groups.get.ts`
- Create: `packages/nextclaw-digital-employee/server/services/dingtalk-routing-service.ts`
- Create: `packages/nextclaw-digital-employee/tests/dingtalk-group-entry.test.ts`

- [ ] Write failing tests for group-level routing rules that cover:
- [ ] default employee for a group;
- [ ] allowed named employees in a group;
- [ ] whether collaboration is permitted in that group.
- [ ] Run: `pnpm -C packages/nextclaw-digital-employee test -- tests/dingtalk-group-entry.test.ts`
- [ ] Expected: FAIL because group binding persistence/service does not exist.
- [ ] Implement repository + service logic that can translate platform group config into `bindings`-friendly runtime decisions.
- [ ] Re-run: `pnpm -C packages/nextclaw-digital-employee test -- tests/dingtalk-group-entry.test.ts`
- [ ] Expected: PASS.

### Task 10: Feed DingTalk routing config into employee execution

**Files:**
- Modify: `packages/nextclaw-digital-employee/server/services/employee-run-service.ts`
- Modify: `packages/nextclaw-digital-employee/server/engine/NextclawEngineGateway.ts`
- Modify: `packages/nextclaw-digital-employee/tests/dingtalk-routing.test.ts`

- [ ] Extend execution tests so employee turns can be started with DingTalk account and peer context and still map to `agentId=employee.code`.
- [ ] Run: `pnpm -C packages/nextclaw-digital-employee test -- tests/dingtalk-routing.test.ts`
- [ ] Expected: FAIL until runtime handoff metadata is threaded through.
- [ ] Update run service / gateway plumbing so DingTalk-bound sessions and agent ids remain stable for DM and group entry.
- [ ] Re-run: `pnpm -C packages/nextclaw-digital-employee test -- tests/dingtalk-routing.test.ts`
- [ ] Expected: PASS.

## Chunk 4: Expose Operations UI and Collaboration Controls

### Task 11: Replace the single-bot integrations editor with account management UI

**Files:**
- Modify: `packages/nextclaw-digital-employee/app/pages/integrations/index.vue`
- Create: `packages/nextclaw-digital-employee/app/components/DingTalkAccountEditor.vue`
- Create: `packages/nextclaw-digital-employee/app/components/DingTalkGroupBindingTable.vue`

- [ ] Refactor the integrations page so DingTalk config can create/edit/remove multiple accounts and choose the default account.
- [ ] Surface group bindings in a dedicated table section rather than mixing them into raw JSON.
- [ ] Run: `pnpm -C packages/nextclaw-digital-employee lint`
- [ ] Expected: FAIL until the old single-bot editor assumptions are removed.
- [ ] Finish the UI refactor and re-run: `pnpm -C packages/nextclaw-digital-employee lint`
- [ ] Expected: PASS.

### Task 12: Add employee-level DingTalk binding UI

**Files:**
- Modify: `packages/nextclaw-digital-employee/app/pages/employees/[id].vue`
- Create: `packages/nextclaw-digital-employee/app/components/EmployeeDingTalkBindingCard.vue`

- [ ] Add UI for:
- [ ] selecting the employee’s default DingTalk account;
- [ ] enabling/disabling DM entry;
- [ ] editing mention aliases used in group routing.
- [ ] Verify the employee detail page loads and saves the new binding API contract.
- [ ] Run: `pnpm -C packages/nextclaw-digital-employee build`
- [ ] Expected: PASS.

### Task 13: Add collaboration-safe entry policy and smoke tests

**Files:**
- Modify: `packages/nextclaw-digital-employee/server/services/dingtalk-routing-service.ts`
- Modify: `packages/nextclaw-digital-employee/server/services/employee-run-service.ts`
- Modify: `packages/nextclaw-digital-employee/tests/dingtalk-group-entry.test.ts`

- [ ] Add tests asserting that only the entry employee replies outward while helper employees stay background-only.
- [ ] Run: `pnpm -C packages/nextclaw-digital-employee test -- tests/dingtalk-group-entry.test.ts`
- [ ] Expected: FAIL until collaboration guardrails are encoded.
- [ ] Implement the minimum policy layer:
- [ ] one outward responder per group request;
- [ ] helper employees can still be invoked with `spawn` / `sessions_send`;
- [ ] no direct multi-employee race to the same DingTalk conversation.
- [ ] Re-run: `pnpm -C packages/nextclaw-digital-employee test -- tests/dingtalk-group-entry.test.ts`
- [ ] Expected: PASS.

### Task 14: End-to-end validation and docs update

**Files:**
- Modify: `docs/superpowers/specs/2026-03-19-dingtalk-digital-employee-collaboration-design.md` only if implementation drift requires clarifying notes
- Modify: `packages/nextclaw-digital-employee/README.md`
- Modify: `docs/logs/<next-implementation-iteration>/README.md`

- [ ] Run the minimum sufficient verification set:
- [ ] `pnpm -C packages/extensions/nextclaw-channel-plugin-dingtalk test`
- [ ] `pnpm -C packages/nextclaw-openclaw-compat test -- src/plugins/loader.bundled-enable-state.test.ts`
- [ ] `pnpm -C packages/nextclaw-digital-employee test`
- [ ] `pnpm -C packages/nextclaw-digital-employee lint`
- [ ] `pnpm -C packages/nextclaw-digital-employee tsc`
- [ ] Perform DingTalk smoke tests outside the repo workspace using an isolated `NEXTCLAW_HOME`:
- [ ] DM one bound employee and verify reply/session continuity.
- [ ] In a DingTalk group, `@` the bound robot and verify only the entry employee replies.
- [ ] With two configured accounts, verify each account routes to its bound employee.
- [ ] Update docs with actual verification commands, observed behavior, and any non-applicable release steps.

## Notes for Execution

- Do not introduce a second `dingtalk` channel id. This plan assumes replacement, not coexistence.
- Preserve legacy config migration for existing single-bot users.
- Do not commit unless the user explicitly asks for commit/checkpoint actions.
- When smoke testing, use an isolated `NEXTCLAW_HOME` or digital-employee home outside the repository tree.
