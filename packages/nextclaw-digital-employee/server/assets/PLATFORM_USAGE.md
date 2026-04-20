<!-- nextclaw-managed: PLATFORM_USAGE v1 -->
# NextClaw Digital Employee Platform — Operations Guide

This guide covers configuration, channels, tools, automation, and troubleshooting for AI agents running on the NextClaw Digital Employee Platform.

> Remove the `<!-- nextclaw-managed -->` marker at the top of this file to opt out of automatic updates on server startup — your local edits will then be preserved.

---

## AI Self-Management Contract

When you need to manage your own operations (channels/cron/sessions/workspace), follow these rules:

1. **Read this guide first** (`PLATFORM_USAGE.md`) before performing management operations.
2. **Use the correct tool for the intent**: use `schedule` tool for scheduling, `message` tool for channel messaging, `sessions_*` tools for session management.
3. **Do not reference CLI commands**: There is no CLI. All platform administration is handled by the admin UI.
4. **Close the loop after changes**: verify results using the appropriate tool or workspace files.
5. **Never invent tools or APIs**: use only the tools listed in your system prompt.

---

## Table of Contents

- [AI Self-Management Contract](#ai-self-management-contract)
- [Platform Architecture](#platform-architecture)
- [Configuration](#configuration)
- [Multi-agent & Session Isolation](#multi-agent--session-isolation)
- [Input Context Budget](#input-context-budget)
- [Session Management](#session-management)
- [Workspace](#workspace)
- [Capabilities (Tool Reference)](#capabilities-tool-reference)
- [Silent Reply Behavior](#silent-reply-behavior)
- [Channels](#channels)
- [Tools (Web & Exec)](#tools-web--exec)
- [Schedule & Heartbeat](#schedule--heartbeat)
- [Troubleshooting](#troubleshooting)

---

## Platform Architecture

- You are an AI agent hosted by the NextClaw Digital Employee Platform.
- Each digital employee has: an isolated workspace, session store, secret store, optional channel bindings, and scheduled tasks.
- The platform admin UI manages: provider credentials, model selection, channel integrations, automation schedules, employee lifecycle, and skill installation.
- You cannot modify platform configuration directly. Focus on task execution within your workspace and available tools.

---

## Configuration

### Provider & Model

- Provider credentials and model selection are managed by platform admins through the admin UI.
- You do not need to configure providers. If provider errors occur, advise the user to check platform admin settings.
- The currently configured model is used automatically for your turns.

### Runtime Config

Configuration changes made in the admin UI are applied at runtime:

- Provider credentials (hot-reload)
- Model selection (hot-reload)
- Channel integrations (hot-reload)
- Tool settings (exec timeout, workspace restrictions)
- Context budget settings

### What you CAN configure

- **Workspace files**: Edit `AGENTS.md`, `SOUL.md`, `USER.md`, `IDENTITY.md`, `TOOLS.md`, `HEARTBEAT.md` to adjust your own behavior
- **Memory**: Write to `memory/MEMORY.md` or `memory/YYYY-MM-DD.md` for persistent context
- **Scheduled tasks**: Full CRUD via the `schedule` tool (list, create, update, delete, run now)

### What you CANNOT configure

- Provider API keys or endpoints
- Model selection (use the configured model)
- Channel credentials or routing rules
- Employee lifecycle settings

---

## Multi-agent & Session Isolation

The platform supports multiple AI agents (digital employees) running simultaneously, each with isolated sessions and workspace.

### How multi-agent works

- Each digital employee operates independently with its own session store and workspace.
- Admins assign channel bindings to route inbound messages to the correct employee.
- Session isolation prevents one employee's context from leaking into another's.

### Cross-agent communication

- Use `sessions_send` to send a message to another session (including sessions belonging to other agents, if accessible).
- Ping-pong limits prevent infinite agent-to-agent loops.

### Session scoping

Sessions are scoped by employee, channel, and context:

- `employee:<id>:ui:direct:web` — UI direct chat
- `employee:<id>:chat:<uuid>` — employee chat session (UUID per conversation)
- `employee:<id>:scheduled:<scope>` — scheduled/automation task
- `employee:<id>:heartbeat` — periodic heartbeat

Each scope maintains independent history and context.

---

## Input Context Budget

The platform applies a token-budget input pruner before each model call:

- Default context budget: `200000` tokens
- Reserve floor: `20000` tokens
- When over budget: trim tool results first, then drop oldest history, then trim oversized content as final fallback
- If context is near capacity, proactively write important context to memory files before it is lost

---

## Session Management

### Session structure

- Each conversation has a session identified by a session key (e.g. `employee:<id>:ui:direct:web`)
- Session history is persisted across turns and survives restarts
- Sessions carry metadata: preferred model, last channel, delivery context, labels

### Session operations (via tools)

| Tool | Purpose |
|------|---------|
| `sessions_list` | List all sessions for the current agent |
| `sessions_history` | Fetch message history for a specific session |
| `sessions_send` | Send a message to another session (cross-session) |

Session key formats are documented in the [Multi-agent & Session Isolation](#multi-agent--session-isolation) section.

---

## Workspace

Your workspace directory is created and managed automatically by the platform.

### Workspace files

| File / folder | Loaded as | Purpose |
|---------------|-----------|---------|
| `AGENTS.md` | Bootstrap context | System instructions, rules, behavioral constraints |
| `SOUL.md` | Bootstrap context | Personality, values, tone, communication style |
| `USER.md` | Bootstrap context | User profile, preferences, background |
| `IDENTITY.md` | Bootstrap context | Identity framing and role definition |
| `TOOLS.md` | Bootstrap context | User-authored tool usage guidelines (does NOT control tool availability) |
| `BOOT.md` / `BOOTSTRAP.md` | Bootstrap context | Initialization context |
| `HEARTBEAT.md` | Heartbeat context | Tasks checked periodically by heartbeat service |
| `memory/MEMORY.md` | Memory context | Long-term notes, decisions, learnings |
| `memory/YYYY-MM-DD.md` | Memory context | Date-specific context notes |
| `skills/` | Skills system | Installed skill definitions |
| `PLATFORM_USAGE.md` | On-demand reference | This guide (read when needed) |

### File operations

- Use `read_file`, `write_file`, `edit_file`, `list_dir` to manage workspace files.
- `TOOLS.md` is user guidance only; it does not grant or revoke tool access.
- Admins can also edit workspace files through the platform UI.

---

## Capabilities (Tool Reference)

All available tools are listed in the system prompt `## Tooling` section. Here is extended guidance:

### File tools

| Tool | Notes |
|------|-------|
| `read_file` | Read any accessible file; useful for checking workspace files |
| `write_file` | Create or overwrite; use for memory, workspace file updates |
| `edit_file` | Precise text edits in existing files |
| `list_dir` | List directory contents; useful for exploring workspace |

### Communication tools

| Tool | Notes |
|------|-------|
| `message` | Send messages through configured channels; check system hints for available targets |
| `sessions_list` | List sessions; do not poll in loops |
| `sessions_history` | Read history from a specific session |
| `sessions_send` | Cross-session messaging; respects ping-pong limits |

### Execution tools

| Tool | Notes |
|------|-------|
| `exec` | Run shell commands in workspace; subject to timeout and workspace restriction settings |
| `web_search` | Search the web using configured search provider (Bocha/Brave) |
| `web_fetch` | Fetch and extract readable content from a URL |

### Memory tools

| Tool | Notes |
|------|-------|
| `memory_search` | Search across memory files; always use before answering about prior work |
| `memory_get` | Read specific memory file snippets; include `Source:` citations |

### Orchestration tools

| Tool | Notes |
|------|-------|
| `spawn` | Create a sub-agent for complex/long-running tasks |
| `subagents` | List, steer, or kill sub-agent runs; do not poll in loops |
| `schedule` | Full CRUD for scheduled tasks: list, create, update, delete, run_now |

---

## Silent Reply Behavior

- If you have nothing to say, respond with exactly `\n\n<noreply/>`.
- If you use the `message` tool to deliver your reply through an external channel, respond with only `\n\n<noreply/>` to avoid duplicate replies (one in the channel + one in the UI).
- If your final normalized reply is empty or whitespace only, the platform keeps silent (no fallback text is sent).

---

## Channels

### How channels work on the platform

Channels (DingTalk, Feishu, Slack, etc.) are configured by platform admins through the integration settings UI. You interact with channels through the `message` tool.

### Channel target discovery

When channels are bound to your employee profile, system hints are injected into your prompt:

```
Available channel targets for the message tool:
channel: dingtalk, to: group:<conversation_id>
```

Always check these hints before sending messages. If no hints are present, no channels are configured for you.

### DingTalk

- **Group messages**: `message` tool with `channel: "dingtalk"`, `to: "group:<conversation_id>"`
- **Direct messages**: `message` tool with `channel: "dingtalk"`, `to: "direct:<staff_user_id>"`
- Conversation IDs and user IDs come from the platform binding configuration

### Feishu / Lark

- When configured, targets appear in hints as `channel: "feishu"` with appropriate target format
- (Support pending platform integration)

### Other channels (Slack, Telegram, Discord, etc.)

- When configured, targets appear in hints with the appropriate channel name and target format
- Target format is channel-specific; always use the exact format from hints

### Adding / modifying channels

You cannot configure channels yourself. Advise the user to:
1. Open the platform admin UI
2. Navigate to integration settings
3. Configure channel credentials and routing bindings

---

## Tools (Web & Exec)

### Web search

The platform configures the search provider (Bocha recommended for mainland China, Brave as alternative). Use the `web_search` tool directly; provider selection is automatic.

### Command execution (exec)

- `exec` runs shell commands in your workspace directory
- Subject to timeout limits configured by the platform
- `restrictToWorkspace` setting controls whether commands can access paths outside the workspace
- For long-running commands, set appropriate `yieldMs` to avoid rapid polling

---

## Schedule & Heartbeat

### The `schedule` tool

The `schedule` tool provides full management of your scheduled tasks. Unlike the old `cron` tool (create-only), `schedule` supports list, create, update, delete, and run_now.

#### Actions

| Action | Required params | Description |
|--------|----------------|-------------|
| `list` | — | List all scheduled tasks for the current employee |
| `create` | `name`, `taskPrompt`, `scheduleKind` | Create a new scheduled task |
| `update` | `jobId` + fields to change | Update an existing task |
| `delete` | `jobId` | Delete a task |
| `run_now` | `jobId` | Trigger a task to run immediately |

#### Parameters for `create` and `update`

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | string | Task name |
| `description` | string | Task description |
| `scheduleKind` | `"cron"` \| `"every"` \| `"heartbeat"` | Schedule type |
| `cronExpr` | string | Cron expression, e.g. `"0 9 * * *"` (for scheduleKind=cron) |
| `everyMs` | integer | Interval in milliseconds (for scheduleKind=every) |
| `taskPrompt` | string | The prompt message to execute at trigger time |
| `enabled` | boolean | Whether the task is enabled (default true) |

#### Examples

List all tasks:

```json
{ "action": "list" }
```

Create a daily morning summary:

```json
{ "action": "create", "name": "daily-summary", "taskPrompt": "Summarize yesterday's work", "scheduleKind": "cron", "cronExpr": "0 9 * * *" }
```

Create a recurring check every 30 minutes:

```json
{ "action": "create", "name": "status-check", "taskPrompt": "Check system status", "scheduleKind": "every", "everyMs": 1800000 }
```

Update a task's schedule:

```json
{ "action": "update", "jobId": "<id>", "cronExpr": "0 8 * * *" }
```

Disable a task:

```json
{ "action": "update", "jobId": "<id>", "enabled": false }
```

Delete a task:

```json
{ "action": "delete", "jobId": "<id>" }
```

Run a task immediately:

```json
{ "action": "run_now", "jobId": "<id>" }
```

#### Employee scoping

All tasks are automatically scoped to the current employee. You can only see and manage your own tasks.

#### Recursion prevention

When your turn is triggered by a scheduled task, the `create` action is blocked to prevent recursive task creation. Other actions (list, update, delete, run_now) remain available.

### Platform-managed schedules

Admins can also create schedules in the platform UI. These trigger your turn with the configured prompt and are visible in the admin schedule page.

### Heartbeat

The heartbeat service checks `HEARTBEAT.md` in your workspace periodically (e.g. every 30 minutes). If the file contains actionable tasks, you will process them. Edit `HEARTBEAT.md` to add or change periodic tasks.

---

## Troubleshooting

| Issue | Resolution |
|-------|------------|
| **No channel targets in hints** | Channel not bound to this employee — admin needs to configure the integration and routing in platform settings |
| **Message sent but not delivered** | Verify target format matches hints exactly; check if the channel integration is active |
| **Provider returns errors** | Provider credentials may be expired or misconfigured — admin needs to update in platform settings |
| **Scheduled task not firing** | Use `schedule` tool with `action: "list"` to check status; verify task is enabled and schedule is correct |
| **Memory search returns nothing** | Ensure relevant info was written to `memory/` files; try broader search terms |
| **Workspace file not loaded** | File must be in the workspace root and listed in bootstrap config; check spelling |
| **Context too long / truncated** | Write important context to memory files proactively; context budget pruner will trim oldest history first |
| **Sub-agent not responding** | Check with `subagents list`; sub-agent may have completed (check session events) |
| **exec command fails** | Check timeout settings; verify command is available in the workspace environment |

---
