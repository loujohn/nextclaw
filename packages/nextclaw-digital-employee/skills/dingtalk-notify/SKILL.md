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
<本技能目录>/scripts/dingtalk-notify.py
```

### 临时文件目录

所有脚本统一使用**用户主目录下的固定目录**（跨平台兼容）。

**目录位置：**
- **Windows**: `C:\Users\用户名\nextclaw-temp`
- **Linux**: `/home/用户名/nextclaw-temp`
- **Mac**: `/Users/用户名/nextclaw-temp`

**执行工时检查脚本时会输出绝对路径：**
```
[工时检查] 临时文件目录：C:\Users\用户名\nextclaw-temp
```

**推荐：直接复制上述路径使用**
```bash
# 使用绝对路径
python scripts/dingtalk-notify.py markdown '标题' --file C:\Users\用户名\nextclaw-temp\文件名.md --cleanup
```

## 使用方法

直接使用相对路径执行脚本。

## 一、群机器人通知

发送到钉钉群。

### 参数说明

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| 类型 | 1 | 是 | 消息类型：`text`、`markdown`、`link`、`actionCard` |
| 标题 | 2 | 否 | 消息标题（markdown/actionCard 必填） |
| 内容 | 3 | 是 | 消息内容（支持 `\n` 换行符） |

### 消息类型示例

#### Markdown 消息（推荐）

```bash
# 使用脚本输出的绝对路径（推荐）
python scripts/dingtalk-notify.py markdown '标题' --file <脚本输出的路径>/你的文件名.md --cleanup
```

#### 文本消息

```bash
# Bash/Shell 环境
python scripts/dingtalk-notify.py text '' '这是一条测试消息'
```

#### 链接消息

```bash
# Bash/Shell 环境
python scripts/dingtalk-notify.py link '链接标题' '链接描述内容' 'https://example.com'
```

#### ActionCard 卡片消息

```bash
# Bash/Shell 环境
python scripts/dingtalk-notify.py actioncard '卡片标题' '卡片内容描述' '查看详情' 'https://example.com'
```

### ⚠️ CMD 终端兼容性问题

CMD 环境下 `echo` 的管道 `|` 会被解析为管道符，导致命令失败。

**解决方案：使用 --file 从文件读取内容，发送后自动清理**

```cmd
python scripts/dingtalk-notify.py markdown '标题' --file <脚本输出的路径>\你的文件名.md --cleanup
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
| --user | 是 | 接收者 dingtalkId |
| --msgtype | 是 | 消息类型：`text` 或 `markdown` |
| --file | 是 | 消息内容文件 |

### 工作通知示例

```bash
# 使用脚本输出的绝对路径
python scripts/dingtalk-notify.py work '工时提醒' --user <dingtalkId> --msgtype markdown --file <脚本输出的路径>/你的文件名.md --cleanup
```

- **--cleanup**: 发送后自动删除文件
