# NextClaw Digital Employee Platform Design

## 1. Background

NextClaw already provides reusable agent, skill, session, scheduler, heartbeat, channel, and OpenClaw-compatible plugin capabilities. The missing layer is an internal-facing digital employee platform that turns those engine capabilities into business objects and operational workflows.

The target product is a single-company digital employee platform that allows operators to:

- create and manage digital employees,
- import and manage skills,
- chat with employees,
- configure scheduled execution,
- review execution traces and results,
- complete a real business scenario such as a project management assistant that summarizes ZenTao data and pushes a mixed-format report to DingTalk.

## 2. Product Goals

### 2.1 Goals

- Build an independent Nuxt-based product surface under the monorepo while embedding NextClaw runtime capabilities.
- Reuse NextClaw skill loading, scheduling, session/event, channel delivery, and OpenClaw compatibility instead of rebuilding an execution engine.
- Make one employee support both chat and scheduled automation through the same runtime.
- Support skill import from local directories and Git repositories.
- Support a first production scenario: project management assistant.

### 2.2 Non-Goals

- No multi-tenant SaaS in phase one.
- No generic visual workflow engine in phase one.
- No complex approval system in phase one.
- No standalone marketplace product in phase one.
- No independent remote engine service in phase one.

## 3. Core Decisions

### 3.1 Product placement

The product should live in `packages/nextclaw-digital-employee`, not `apps/*`, because the current repository treats core product surfaces such as NextClaw UI and server as package-level workspaces.

### 3.2 Execution strategy

The platform should embed NextClaw runtime code in-process instead of calling a separate HTTP API service. This reduces integration overhead and keeps access to native sessions, skills, scheduling, and event streams.

### 3.3 Boundary strategy

The platform must not call `@nextclaw/core` modules from arbitrary API handlers. All engine-facing logic should go through a single gateway layer under `server/engine`.

## 4. High-Level Architecture

```text
packages/nextclaw-digital-employee
  Nuxt UI + server routes
        |
        v
  Platform services / repositories / SQLite
        |
        v
  NextclawEngineGateway
        |
        v
  @nextclaw/core + @nextclaw/runtime + @nextclaw/openclaw-compat
```

### 4.1 Responsibilities

- Platform layer:
  - employees,
  - skill management UI,
  - integration binding,
  - schedule configuration,
  - chat pages,
  - run records,
  - business-oriented defaults.
- Engine layer:
  - skill loading,
  - agent turn execution,
  - session/event tracking,
  - cron and heartbeat scheduling,
  - channel delivery,
  - OpenClaw-compatible plugin resolution.

## 5. Reuse Boundaries

### 5.1 Reuse from NextClaw

- `SkillsLoader`
- `SessionManager`
- `CronService`
- `HeartbeatService`
- provider/channel registration from `@nextclaw/runtime`
- OpenClaw-compatible plugin/channel packages
- config schema and secret resolution

### 5.2 Platform-owned additions

- employee entity and CRUD,
- employee-to-skill bindings,
- employee-to-integration bindings,
- employee schedule UI and defaults,
- run list and run detail views,
- business target configuration such as project scope and notification recipients.

## 6. Credentials and Target Configuration Boundary

Credentials and business targets should be split deliberately:

- Reuse NextClaw for credential schema and secret resolution.
  - Example: DingTalk `clientId/clientSecret`, ZenTao account secrets.
- Store business targets in the digital employee platform.
  - Example: which DingTalk group to push to,
  - which projects to include,
  - whether to output project and member dimensions,
  - who should receive the final summary by default.

This keeps engine concerns and business concerns separate.

## 7. Core Modules

### 7.1 Employee Management

- create, edit, enable, disable employees,
- configure system prompt,
- bind skills,
- bind integrations and default business targets,
- optionally configure schedules during creation.

### 7.2 Skills Management

- view installed skills,
- import from local path,
- import from Git,
- enable/disable skills,
- inspect metadata and usage references.

### 7.3 Chat

- one-to-one conversation with an employee,
- manual task triggering,
- chat and scheduled runs share the same underlying employee runtime.

### 7.4 Automation

- support cron, interval, and heartbeat styles,
- allow user-defined or recommended schedules,
- write automatic runs into the same run record system.

### 7.5 Run Records

- run list,
- run detail,
- event stream,
- final result,
- failure details,
- push delivery status.

### 7.6 Integration Settings

- ZenTao connection management,
- DingTalk connection management,
- platform defaults,
- employee-level overrides.

## 8. Data Model

Phase one should start with these seven tables.

### 8.1 `employees`

- `id`
- `name`
- `code`
- `description`
- `system_prompt`
- `status`
- `created_at`
- `updated_at`

### 8.2 `employee_skills`

- `id`
- `employee_id`
- `skill_name`
- `enabled`
- `config_json`

### 8.3 `employee_schedules`

- `id`
- `employee_id`
- `schedule_kind`
- `cron_expr`
- `every_ms`
- `heartbeat_enabled`
- `heartbeat_interval_s`
- `enabled`
- `next_run_at`

### 8.4 `skill_installations`

- `id`
- `skill_name`
- `source_type`
- `source_uri`
- `version`
- `install_path`
- `enabled`
- `metadata_json`

### 8.5 `integration_connections`

- `id`
- `type`
- `name`
- `config_json`
- `enabled`

### 8.6 `run_records`

- `id`
- `employee_id`
- `trigger_type`
- `trigger_source`
- `status`
- `started_at`
- `finished_at`
- `summary`
- `result_json`

### 8.7 `run_events`

- `id`
- `run_id`
- `seq`
- `event_type`
- `payload_json`
- `created_at`

## 9. Key Runtime Flows

### 9.1 Create Employee

1. Operator enters basic information and system prompt.
2. Operator selects installed skills.
3. Operator binds ZenTao and DingTalk connections.
4. Operator configures schedule manually or accepts a recommended schedule.
5. Platform stores employee state in SQLite.
6. Engine gateway materializes the runtime when the employee is used.

### 9.2 Import Skill

1. Operator submits a local path or Git repository URL.
2. Platform validates the source.
3. Platform invokes the existing NextClaw-compatible install/load flow.
4. Platform stores installation metadata.
5. Installed skill becomes selectable for employee bindings.

### 9.3 Chat with Employee

1. User opens employee chat.
2. UI sends the user message to a Nuxt server route.
3. Server calls `NextclawEngineGateway.runEmployeeTurn(employeeId, message)`.
4. Session events are collected and mirrored into `run_records` and `run_events`.
5. UI renders assistant reply and linked run information.

### 9.4 Scheduled Run

1. Scheduler wakes based on employee configuration.
2. Platform triggers the same employee runtime entry used by chat/manual runs.
3. Run events are persisted.
4. Final output is stored and optionally delivered through DingTalk.

## 10. Project Management Assistant Reference Scenario

### 10.1 Employee profile

- Name: `项目管理助手`
- Role: summarize project execution and team status every day.

### 10.2 Skills

- ZenTao data retrieval skill,
- aggregation/analysis skill,
- summary generation skill,
- DingTalk delivery skill.

### 10.3 Output contract

- section 1: AI executive summary,
- section 2: project-dimension details,
- section 3: owner/member-dimension details.

### 10.4 Trigger modes

- daily scheduled run,
- on-demand chat request such as “只看今天延期项目”.

## 11. Phase-One Pages

- employee list,
- employee detail,
- employee chat,
- skills management,
- run records,
- integration settings.

The employee detail page should contain:

- basic information,
- skills,
- automation,
- recent runs.

## 12. Risks and Constraints

- Skill import needs trust and validation boundaries; phase one should not silently auto-trust arbitrary remote code.
- Embedding runtime improves velocity but requires disciplined gateway boundaries to avoid internal coupling spread.
- Credential reuse from NextClaw is beneficial, but business target configuration must stay in platform tables to avoid configuration sprawl.

## 13. Acceptance Criteria

- A user can create an employee and start chatting from the UI.
- A user can import a skill from local path or Git.
- An employee can run on a schedule.
- Each run exposes process events and final results.
- The project management assistant can summarize ZenTao data and push a mixed-format report to DingTalk.
