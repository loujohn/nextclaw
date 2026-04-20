---
name: schedule
name_zh: 定时任务
description: 管理定时任务：查看、创建、修改、删除和立即执行。
metadata: {"nextclaw":{"always":true,"emoji":"⏰"}}
---

# Schedule

Use the `schedule` tool to manage scheduled tasks for the current employee.

## Actions

| Action | Required params | Description |
|--------|----------------|-------------|
| `list` | — | List all scheduled tasks |
| `create` | `name`, `taskPrompt`, `scheduleKind` | Create a new task |
| `update` | `jobId` + fields to change | Update an existing task |
| `delete` | `jobId` | Delete a task |
| `run_now` | `jobId` | Trigger immediate execution |

## Schedule Types

| scheduleKind | Additional param | Example |
|-------------|-----------------|---------|
| `cron` | `cronExpr` | `"0 9 * * *"` (daily at 9am) |
| `every` | `everyMs` | `1800000` (every 30 minutes) |
| `heartbeat` | — | Runs on heartbeat cycle |

## Examples

List all tasks:
```json
schedule({ "action": "list" })
```

Create a daily morning summary:
```json
schedule({ "action": "create", "name": "daily-summary", "taskPrompt": "Summarize yesterday's work", "scheduleKind": "cron", "cronExpr": "0 9 * * *" })
```

Create a recurring check every 30 minutes:
```json
schedule({ "action": "create", "name": "status-check", "taskPrompt": "Check system status", "scheduleKind": "every", "everyMs": 1800000 })
```

Update schedule:
```json
schedule({ "action": "update", "jobId": "<id>", "cronExpr": "0 8 * * *" })
```

Disable a task:
```json
schedule({ "action": "update", "jobId": "<id>", "enabled": false })
```

Delete a task:
```json
schedule({ "action": "delete", "jobId": "<id>" })
```

Run immediately:
```json
schedule({ "action": "run_now", "jobId": "<id>" })
```

## Time Expression Mapping

| User says | Parameters |
|-----------|------------|
| every 20 minutes | scheduleKind: "every", everyMs: 1200000 |
| every hour | scheduleKind: "every", everyMs: 3600000 |
| every day at 8am | scheduleKind: "cron", cronExpr: "0 8 * * *" |
| weekdays at 5pm | scheduleKind: "cron", cronExpr: "0 17 * * 1-5" |

## Constraints

- All tasks are scoped to the current employee.
- During scheduled execution, `create` is blocked to prevent recursion.
- Use `list` to find job IDs before `update`, `delete`, or `run_now`.
