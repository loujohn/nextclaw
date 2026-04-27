---
name: dingtalk-notify
name_zh: 钉钉通知
version: 1.0.1
description: "发送消息通知，支持群机器人通知（text/markdown/link/actionCard）和个人消息。当需要向群发送汇报、提醒、告警，或向个人发送通知时使用。"
metadata:
  nextclaw:
    emoji: "🔔"
    category: "project-management"
---

# 通知技能

发送消息，支持群机器人通知和个人消息。

**⚠️ 重要说明：本技能仅负责发送消息，不负责生成消息内容。消息内容由其他技能生成。**

**📁 日志文件目录：工作区下 `skills-log-files/dingtalk-notify/`**

## 使用方法

```bash
# 群机器人通知
python scripts/dingtalk-notify.py markdown '标题' --file content.md --cleanup

# 个人消息
python scripts/dingtalk-notify.py work --user <userId> --msgtype markdown --file content.md --cleanup
```

## 一、群机器人通知

发送到群。

### 消息类型

| 类型 | 说明 |
|------|------|
| `text` | 文本消息 |
| `markdown` | Markdown 消息（推荐） |
| `link` | 链接消息 |
| `actionCard` | 卡片消息 |

### 示例

```bash
# Markdown 消息（从文件读取）
python scripts/dingtalk-notify.py markdown '标题' --file content.md --cleanup

# 文本消息
python scripts/dingtalk-notify.py text '' '这是一条测试消息'

# 链接消息
python scripts/dingtalk-notify.py link '链接标题' '链接描述' 'https://example.com'

# 卡片消息
python scripts/dingtalk-notify.py actioncard '卡片标题' '卡片内容' '查看详情' 'https://example.com'
```

## 二、个人消息

通过接口发送到个人。

### 参数说明

| 参数 | 必填 | 说明 |
|------|------|------|
| `--user` | 是 | 接收者 ID |
| `--msgtype` | 是 | 消息类型：`text` 或 `markdown` |
| `--file` | 是 | 消息内容文件 |

### 示例

```bash
# 从文件发送
python scripts/dingtalk-notify.py work --user <userId> --msgtype markdown --file content.md --cleanup
```

- **--cleanup**: 发送后自动删除文件

### 自动提取接收者 ID

如果文件名格式为 `user_{userId}_{timestamp}.md`，脚本会自动从文件名提取接收者 ID，无需手动指定 `--user`。

## 环境变量

| 变量 | 说明 |
|------|------|
| DINGTALK_WEBHOOK_URL | 群机器人 Webhook 地址 |
| DINGTALK_APP_KEY | 应用 AppKey |
| DINGTALK_APP_SECRET | 应用 AppSecret |
| DINGTALK_AGENT_ID | 应用 AgentID |
| DINGTALK_WORK_NOTIFY_URL | 个人消息接口地址（可选） |
| DINGTALK_TOKEN_URL | Token 接口地址（可选） |

## 文件读取

本技能支持从文件读取消息内容，适用于其他技能生成的文件。

### 自动提取接收者 ID

当文件名格式为 `user_{userId}_{timestamp}.md` 时，本技能会自动从文件名提取接收者 ID，无需手动指定 `--user`。

**示例**：
- 文件名：`user_123456_20260424150000.md`
- 自动提取：`userId = 123456`

### 文件路径说明

本技能支持以下文件路径格式：
- 绝对路径：`D:\workspace\...\skills-log-files\...\file.md`
- 相对路径：`skills-log-files/xxx/20260424150000/group_20260424150000.md`

**推荐**：直接复制其他技能输出的文件路径使用。

## 内容规范

**禁止在消息中暴露以下信息：**
- userId / dingtalkId
- appkey / appSecret
- agent_id
- token
- 任何内部编号或ID

**消息内容只能包含用户可见的业务信息：**
- 姓名
- 项目名称
- 任务名称
- 统计数字
- 其他面向用户的业务信息

## 消息长度限制

- 单条消息最长 **2048 字节**
- 超长内容已自动截断（保留 1800 字节 + 提示）
