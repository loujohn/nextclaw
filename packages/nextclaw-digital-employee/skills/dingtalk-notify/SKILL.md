---
name: dingtalk-notify
name_zh: 钉钉通知
description: "发送钉钉消息通知，支持群机器人通知（text/markdown/link/actionCard）和工作通知（个人消息）。当需要向钉钉群发送汇报、提醒、告警，或向个人发送工作通知时使用。"
metadata:
  nextclaw:
    emoji: "🔔"
    category: "solutions"
---

# 钉钉通知技能

发送钉钉消息，支持群机器人通知和工作通知（个人消息）。

## 脚本位置

```
skills/dingtalk-notify/scripts/dingtalk-notify.js
```

## 使用方法

先获取技能位置，再设置 workingDir 执行脚本。

### 执行步骤

1. 从系统提供的 `available_skills` 中获取技能 `location` 字段
2. 提取技能目录作为 `workingDir`
3. 使用相对路径执行脚本

### ⚠️ 重要：使用唯一文件名

传递消息内容时**必须使用带时间戳的唯一文件名**，避免残留文件干扰后续发送：

```
notify-<timestamp>.md
```

示例流程：
1. `write_file` 写入 `notify-1711440000.md`
2. `exec` 调用 `node scripts/dingtalk-notify.js markdown '标题' --file notify-1711440000.md`
3. 脚本发送成功后自动删除该文件

**禁止使用固定文件名**（如 `content.md`），否则多次运行会导致发送旧内容。

## 一、群机器人通知

发送到钉钉群。

### 消息类型示例

#### Markdown 消息（推荐）

```bash
node scripts/dingtalk-notify.js markdown '工时提醒' --file notify-1711440000.md
```

#### 文本消息

```bash
node scripts/dingtalk-notify.js text '' '这是一条测试消息'
```

#### 链接消息

```bash
node scripts/dingtalk-notify.js link '链接标题' '链接描述内容' 'https://example.com'
```

#### ActionCard 卡片消息

```bash
node scripts/dingtalk-notify.js actioncard '卡片标题' '卡片内容描述' '查看详情' 'https://example.com'
```

## 二、工作通知（个人消息）

通过钉钉工作通知接口发送到个人消息（不是群消息）。

### ⚠️ 重要：消息内容规范

**禁止在 --content 参数中暴露以下信息：**
- dingtalkId
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

### 参数说明

| 参数 | 必填 | 说明 |
|------|------|------|
| --token | 否 | 应用 access_token（有默认值） |
| --appkey | 否 | 应用 appKey（有默认值） |
| --secret | 否 | 应用 appSecret（有默认值） |
| --agent | 否 | 应用 AgentID（有默认值） |
| --user | 是 | 接收者 userid（使用工时接口返回的 dingtalkId） |
| --type | 是 | 消息类型：`text` 或 `markdown` |
| --title | 否 | 标题（markdown 必填） |
| --content | 是 | 消息内容（使用 --file 读取文件） |

### 工作通知示例

```bash
# 发送 text 消息
node scripts/dingtalk-notify.js work --user <dingtalkId> --type text --content '这是一条提醒'

# 发送 markdown 消息
node scripts/dingtalk-notify.js work --user <dingtalkId> --type markdown --title '工时提醒' --content --file content.md
```

- **user**: 使用工时接口返回的 `dingtalkId` 字段
- **content.md**: 文件路径，文件内容支持 Markdown 格式
```