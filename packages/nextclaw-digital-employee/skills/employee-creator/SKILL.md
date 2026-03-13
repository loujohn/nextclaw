---
name: employee-creator
description: "通过平台 API 创建和配置新的数字员工。当用户要求创建新员工、设置新 Agent、或为新数字员工配置技能和调度时使用。"
metadata:
  nextclaw:
    emoji: "👤"
---

# Employee Creator

当用户需要创建新的数字员工时，使用 `exec` 工具调用平台 API 完成创建。

## 平台地址

平台 API 地址从环境变量读取：

```bash
PLATFORM_URL="${NEXTCLAW_PLATFORM_URL:-http://localhost:3000}"
```

后续所有 curl 命令均使用 `$PLATFORM_URL` 替代硬编码地址。

## 操作步骤

### 第一步：查询可用技能

```bash
PLATFORM_URL="${NEXTCLAW_PLATFORM_URL:-http://localhost:3000}"
curl -s "$PLATFORM_URL/api/skills"
```

### 第二步：查询已有员工（避免 code 重复）

```bash
PLATFORM_URL="${NEXTCLAW_PLATFORM_URL:-http://localhost:3000}"
curl -s "$PLATFORM_URL/api/employees"
```

### 第三步：查询平台默认模型（可选）

```bash
PLATFORM_URL="${NEXTCLAW_PLATFORM_URL:-http://localhost:3000}"
curl -s "$PLATFORM_URL/api/config/model"
```

如果接口不可用，**省略 `model` 字段**即可，平台会自动使用环境变量 `NEXTCLAW_MODEL` 配置的默认模型。

### 第四步：创建员工

```bash
PLATFORM_URL="${NEXTCLAW_PLATFORM_URL:-http://localhost:3000}"
curl -s -X POST "$PLATFORM_URL/api/employees" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "员工名称",
    "code": "unique-code",
    "description": "角色描述",
    "systemPrompt": "系统提示词",
    "skillNames": ["skill-a"],
    "workspaceFiles": {
      "USER.md": "用户上下文..."
    }
  }'
```

## 请求字段说明

**必填**
- `name` — 显示名称
- `code` — 唯一标识符（小写字母 + 连字符，不含空格，创建后不可修改）

**可选**
- `description` — 角色描述
- `systemPrompt` — 系统指令，定义员工行为
- `model` — 模型（如 `anthropic/claude-sonnet-4-6`、`dashscope/qwen-plus`）。**省略此字段则使用平台默认模型**，推荐省略以避免模型不匹配错误
- `skillNames` — 要绑定的技能名称数组（技能必须已安装）
- `scheduleKind` — `"cron"` | `"every"` | `"heartbeat"`
- `cronExpr` — Cron 表达式（scheduleKind 为 cron 时）
- `everyMs` — 间隔毫秒数（scheduleKind 为 every 时）
- `workspaceFiles` — 初始工作区文件，可写：`AGENTS.md`、`TOOLS.md`、`USER.md`、`BOOT.md`、`HEARTBEAT.md`、`MEMORY.md`

## 注意事项

- 创建前先查询员工列表，确认 `code` 不重复
- `skillNames` 中的技能必须已在平台安装，否则绑定会静默失败
- 根据用户描述推断合适的 `systemPrompt`，不要让用户自己写
