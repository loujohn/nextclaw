---
name: work-time-fill-check
name_zh: 工时填报检查
version: 1.0.1
description: "获取团队成员工时填写情况，识别未填工时人员并生成待发送的数据文件。当需要检查工时填报情况或生成待发送的工时统计文件时使用。"
metadata:
  nextclaw:
    emoji: "⏱️"
    category: "project-management"
---

# 工时填报检查技能

获取团队成员工时填写情况数据，生成待发送的数据文件。

**⚠️ 重要说明：本技能仅负责查询数据和生成待发送的文件，不负责发送。发送操作由其他技能完成。**

**📁 日志文件目录：工作区下 `skills-log-files/work-time-fill-check/`**

## ⚠️ 性能提示

**接口耗时：请求工时数据接口非常耗时，通常需要 2-5 分钟，请耐心等待。**

## 使用方法

```bash
# 仅查询数据（输出 JSON）
python skills/work-time-fill-check/scripts/work-time-fill-check.py

# 生成待发送的数据文件
python skills/work-time-fill-check/scripts/work-time-fill-check.py --output --per-user --per-leader
```

### 命令行选项

| 选项           | 说明                         |
| -------------- | ---------------------------- |
| `--output`     | 输出群通知 Markdown 文件     |
| `--per-user`   | 为每个未填写人员生成通知文件 |
| `--per-leader` | 为每个项目负责人生成通知文件 |
| （无参数）     | 输出 JSON 格式数据           |

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
          }
        ]
      }
    ]
  }
}
```

## 临时文件目录

所有文件统一存放在 `skills-log-files/work-time-fill-check/` 目录下。

**文件命名规则：**
- 每次生成放入独立批次文件夹：`skills-log-files/work-time-fill-check/{timestamp}/`
- 群通知：`{timestamp}/group_{timestamp}.md`
- 个人通知：`{timestamp}/user_{dingtalkId}_{timestamp}.md`
- 负责人通知：`{timestamp}/user_{dingtalkId}_{timestamp}.md`
- 通知清单：`{timestamp}/notify_list_{timestamp}.txt`

**执行脚本时会输出路径：**
```
[工时检查] 临时文件目录：skills-log-files/work-time-fill-check
[工时检查] 本次通知批次：skills-log-files/work-time-fill-check/20260424150000
```

## 文件命名规范

生成的文件遵循以下命名规范，便于其他技能识别和使用：

| 文件类型 | 命名格式 | 示例 |
|---------|---------|------|
| 群通知 | `group_{timestamp}.md` | `group_20260424150000.md` |
| 个人通知 | `user_{userId}_{timestamp}.md` | `user_123456_20260424150000.md` |
| 负责人通知 | `user_{userId}_{timestamp}.md` | `user_789012_20260424150000.md` |

**说明**：
- `userId` 为接收者标识，其他技能可从文件名提取（格式：`user_{userId}_{timestamp}.md`）
- 通知清单文件包含完整的文件路径和接收者信息

### ⚠️ 重要：文件内容规范

**禁止在任何文件中暴露以下信息：**

- dingtalkId
- projectLeaderDingtalkId
- appkey / appSecret
- agent_id
- token
- 任何内部编号或ID

**文件内容只能包含：**

- 姓名（cnName）
- 项目名称（projectName）
- 任务名称（tasks）
- 统计数字
- 其他用户可见的业务信息

### ⚠️ 文件消息长度限制

- 单条消息最长 **2048 字节**
- 个人通知和负责人通知已自动截断超长内容（保留 1800 字节 + 提示）
