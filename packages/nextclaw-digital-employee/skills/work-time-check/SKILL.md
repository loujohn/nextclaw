---
name: work-time-check
name_zh: 工时检查
description: "获取团队成员工时填写情况，识别未填工时人员并生成通知内容。当需要检查工时填报情况、催促填写工时、或生成工时统计报告时使用。"
metadata:
  nextclaw:
    emoji: "⏱️"
    category: "project-management"
---

# 工时检查技能

获取团队成员工时填写情况数据，供 Agent 分析和通知使用。

## ⚠️ 性能提示

**接口耗时：请求工时数据接口非常耗时，通常需要 2-5 分钟，请耐心等待。**

## 使用方法

```bash
python skills/work-time-check/scripts/work-time-check.py --output --per-user --per-leader
```

### 命令行选项

| 选项           | 说明                         |
| -------------- | ---------------------------- |
| `--output`     | 输出群通知 Markdown 文件     |
| `--per-user`   | 为每个未填写人员生成通知文件 |
| `--per-leader` | 为每个项目负责人生成通知文件 |
| （无参数）     | 输出 JSON 格式数据           |

### 环境变量

| 变量          | 说明                              |
| ------------- | --------------------------------- |
| PM_BASE_URL   | 基础 URL                          |
| PM_API        | 工时数据接口地址（可选）          |
| PM_TIMEOUT    | 请求超时时间（毫秒），默认 600000 |
| PM_BASIC_AUTH | Basic 认证凭证                    |
| PM_USERNAME   | API 用户名                        |
| PM_PASSWORD   | API 密码                          |

## 接口返回格式

```json
{
  "code": 0,
  "data": {
    "queryDate": "2026-03-23",
    "filledUsersCount": 3,
    "unfilledUsersCount": 48,
    "unfilledUsers": [
      {
        "dingtalkId": "xxxxxxxx",
        "cnName": "张三",
        "unfilledTasks": [
          {
            "projectName": "示例项目A",
            "projectLeader": "李四",
            "projectLeaderDingtalkId": "yyyyyyyy",
            "tasks": ["任务1", "任务2"]
          },
          {
            "projectName": "示例项目B",
            "projectLeader": "王五",
            "projectLeaderDingtalkId": "zzzzzz",
            "tasks": ["任务3"]
          }
        ]
      },
      {
        "dingtalkId": "aaaaaaaa",
        "cnName": "李四",
        "unfilledTasks": []
      }
    ]
  }
}
```

## 协作说明

Agent 执行工时检查任务的完整流程：

1. **调用 work-time-check** 获取工时数据并生成通知文件（一次请求）
   - ⚠️ 此步骤非常耗时，通常需要 2-5 分钟

2. **生成所有通知文件（推荐）**


    ```bash
    python work-time-check/scripts/work-time-check.py --output --per-user --per-leader
    ```

    脚本会输出：
    ```
    [工时检查] 临时文件目录：C:\Users\用户名\nextclaw-temp
    [工时检查] 已生成群通知：C:\Users\用户名\nextclaw-temp\group_xxx.md
    [工时检查] 已生成个人通知文件
    [工时检查] 已生成负责人通知文件
    [工时检查] 已生成通知清单：C:\Users\用户名\nextclaw-temp\notify_list_xxx.txt
    ```

    **直接复制输出的路径使用即可。**

3. **查看通知清单**
   - 脚本会输出临时文件目录的绝对路径
   - 打开 `<输出路径>/notify_list_时间戳.txt` 查看所有需要发送的通知
   - 清单包含：文件路径、接收人、dingtalkId

4. **发送通知**

   ```bash
   # 发送群通知（使用脚本输出的绝对路径）
   python dingtalk-notify/scripts/dingtalk-notify.py markdown '工时填写提醒' --file <脚本输出的路径>/group_时间戳.md --cleanup

   # 发送个人/负责人通知（文件名已包含钉钉 ID，可自动提取，无需手动指定--user）
   python dingtalk-notify/scripts/dingtalk-notify.py work '工时提醒' --msgtype markdown --file <脚本输出的路径>/user_钉钉 ID_时间戳.md --cleanup
   ```

5. **核对清单确保无遗漏**
   - 钉钉ID在文件名中（如 `user_钉钉ID_时间戳.md`），发送工作通知时会自动从文件名提取
   - **注意**: 钉钉ID必须正确，ID错误将导致工作通知无法发送到对应用户

### ⚠️ 重要：通知内容规范

**禁止在任何通知消息中暴露以下信息：**

- dingtalkId
- projectLeaderDingtalkId
- appkey / appSecret
- agent_id
- token
- 任何内部编号或ID

**消息内容只能包含：**

- 姓名（cnName）
- 项目名称（projectName）
- 任务名称（tasks）
- 统计数字
- 其他用户可见的业务信息

### 临时文件目录

所有脚本统一使用**用户主目录下的固定目录**（跨平台兼容）。

**目录位置：**

- **Windows**: `C:\Users\用户名\nextclaw-temp`
- **Linux**: `/home/用户名/nextclaw-temp`
- **Mac**: `/Users/用户名/nextclaw-temp`

**执行脚本时会输出绝对路径：**

```
[工时检查] 临时文件目录：C:\Users\用户名\nextclaw-temp
```

**推荐：直接复制上述路径使用**

```bash
# 使用绝对路径
python dingtalk-notify/scripts/dingtalk-notify.py markdown '标题' --file C:\Users\用户名\nextclaw-temp\group_时间戳.md --cleanup
```

### ⚠️ 工作通知消息长度限制

- 钉钉工作通知最长 **2048 字节**
- 个人通知和负责人通知已自动截断超长内容（保留1800字节+提示）
