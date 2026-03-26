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
node skills/work-time-check/scripts/work-time-check.js --url <接口地址>
```

### 命令行选项

| 选项 | 说明 |
|------|------|
| `--url <url>` | 工时数据接口地址（默认: http://shangji.dcg-internal-services.test.dcginner:10006/api/admin/zenTaoTaskLog/unfilledDetail） |
| `--mock` | 使用模拟数据（快速测试用） |
| `--help` | 显示帮助信息 |

### 环境变量

| 变量 | 说明 |
|------|------|
| WORK_TIME_BASE_URL | 基础URL（默认: http://shangji.dcg-internal-services.test.dcginner:10006/api） |
| WORK_TIME_API | 工时数据接口地址 |
| TIMEOUT | 请求超时时间（毫秒），默认 600000 |

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

1. **调用 work-time-check** 获取工时数据
   - ⚠️ 此步骤非常耗时，通常需要 2-5 分钟
2. **分析数据并组装通知内容**：
   - **钉钉群通知**：汇总全体未填工时人员，**必须包含具体项目名称和任务**
     - 格式：人员姓名 + 对应项目 + 对应任务
     - 使用 `dingtalk-notify.js markdown --file` 发送到群
   - **项目负责人通知**（可选）：按 `projectLeaderDingtalkId` 分组，通知每位负责人其团队成员未填工时的人员
     - 使用 `dingtalk-notify.js work --content --file` 发送工作通知
   - **本人通知**（可选）：用 `dingtalkId` 发送工作通知，通知其自己未填的工时
     - 使用 `dingtalk-notify.js work --content --file` 发送工作通知
3. **调用 dingtalk-group-notification** 发送通知
   - ⚠️ 工作通知消息内容最长不超过 2048 字节，需控制长度

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

### 通知参数说明

- 群通知：直接发送到群机器人
- 工作通知：需要以下参数
  - `--token`: 应用 access_token（需用户提供）
  - `--agent`: 应用 AgentID（需用户提供）
  - `--user`: 使用数据中的 `dingtalkId` 或 `projectLeaderDingtalkId`

### ⚠️ 工作通知消息长度限制

钉钉工作通知的消息内容（`--content`）最长不超过 **2048 字节**，组装消息时需控制长度。
