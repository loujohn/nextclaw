---
name: employee-creator
name_zh: 数字员工创建向导
version: 1.0.0
description: "通过平台 API 创建和配置新的数字员工。当用户要求创建新员工、设置新 Agent、或为新数字员工配置技能和调度时使用。"
metadata:
  nextclaw:
    emoji: "👤",
    category: "product-rd"
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
# 返回：{"ok":true,"data":{"model":"dashscope/qwen-plus"}}
```

如需指定模型，使用返回的 `data.model` 值；**省略 `model` 字段**则平台自动使用默认模型，推荐省略。

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

## 工作区文件说明

创建员工前，**主动向用户询问**以下信息，根据回答填充对应的工作区文件：

### USER.md — 服务对象
员工需要了解它服务的人是谁。询问用户：
- 用户的名称/称呼方式是什么？
- 时区？
- 正在推进哪些项目？有哪些偏好与约束？

示例内容：
```
# USER.md
- 名称：张三
- 称呼方式：张总
- 时区：Asia/Shanghai
- 备注：偏好简洁回复，关注项目进度和风险
```

### TOOLS.md — 本地环境配置
员工需要知道它能访问哪些系统。询问用户：
- 有哪些业务系统需要访问（如钉钉、飞书、数据库、内部 API）？
- 相关的访问地址或配置说明？

### BOOT.md — 启动指令
员工每次启动时自动执行的任务。询问用户：
- 员工启动时需要自动做什么？（如：检查今日待办、发送早报、同步数据）
- 如果不需要启动任务，留空即可。

示例内容：
```
# BOOT.md
- 读取今日日历，汇总今日重要事项
- 检查昨日未完成任务
```

### HEARTBEAT.md — 定期心跳任务
员工定期自动执行的后台任务（需配合 `scheduleKind: "heartbeat"` 使用）。询问用户：
- 需要定期自动执行什么任务？（如：每小时检查消息、每天生成报告）
- 如果不需要定期任务，留空即可。

### MEMORY.md — 长期记忆初始化
员工的初始知识库。询问用户：
- 有哪些关键信息需要员工从一开始就知道？（如：公司规范、常用联系人、重要决策）

### 询问策略

根据员工的用途判断需要询问哪些文件，不要无脑全问：

- `USER.md` — 员工需要服务特定用户时（如助手类员工）
- `TOOLS.md` — 需要访问外部系统时（如钉钉、飞书、内部 API）
- `BOOT.md` — 有启动时自动执行的任务时
- `HEARTBEAT.md` — 有定期后台任务时（需配合 `scheduleKind: "heartbeat"`）
- `MEMORY.md` — 有需要预置的初始知识时

用户说"不需要"或"跳过"时，对应文件不传入 `workspaceFiles`。

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
