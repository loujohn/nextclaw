---
name: weekly-report
name_zh: 周报总结
version: 1.0.0
description: "利用禅道基础工具 分析项目迭代数据并生成周报。自动筛选本周完成的任务、统计进度、按父任务分组输出。当需要生成项目周报、迭代进度汇报或任务完成情况总结时使用。"
metadata:
  nextclaw:
    emoji: "📊"
    category: "project-management"
---

# 周报总结技能

利用禅道基础工具 分析项目/迭代周报情况。

## 前置要求

使用本技能前，请先阅读 [禅道基础工具](../zentao-cli/SKILL.md)，了解CLI命令使用方法和认证流程。

## 分析数据

### 项目信息

| 字段     | 说明         | 来源命令                       |
| -------- | ------------ | ------------------------------ |
| 项目名称 | 项目名称     | `project list`、`project info` |
| 项目状态 | 项目当前状态 | `project info`                 |
| 项目经理 | 负责人       | `project info`                 |

### 迭代信息

| 字段          | 说明            | 来源命令         |
| ------------- | --------------- | ---------------- |
| 迭代名称      | 执行/迭代名称   | `execution list` |
| 迭代状态      | wait/doing/done | `execution list` |
| 进度          | 进度百分比      | `execution info` |
| 开始/结束日期 | 时间范围        | `execution info` |

### 任务统计

| 字段     | 说明              | 来源命令                                     |
| -------- | ----------------- | -------------------------------------------- |
| 总任务数 | 迭代下全部任务    | `task list -e <execution_id>`                |
| 已完成   | 状态为done/closed | `task list -e <execution_id> --status done`  |
| 进行中   | 状态为doing       | `task list -e <execution_id> --status doing` |
| 待处理   | 状态为wait        | `task list -e <execution_id> --status wait`  |

### 任务详情

| 字段       | 说明              | 来源命令              |
| ---------- | ----------------- | --------------------- |
| 任务名称   | 任务标题          | `task info <task_id>` |
| 预计工时   | estimate          | `task info`           |
| 已消耗工时 | consumed          | `task info`           |
| 子任务     | parent:0 为主任务 | `task info`           |
| 指派人     | assignedTo        | `task info`           |

## 分析规则

### 本周任务定义

**关键：用 deadline 字段筛选，而非 finishedDate。**

本周定义：当前周的周一到周五（如3月23日-3月27日），或按实际需求指定。

- 任务满足以下条件视为"本周任务"：
  - `deadline` >= 本周第一天（如3月23日，周一）
  - `deadline` <= 本周最后一天（如3月27日，周五）
  - `status` 为 `doing` 或 `done`
- **按 deadline 筛选本周任务**

### 周报输出格式

```
**项目名称**
**迭代名称** - 进度X%

已完成子任务：
1.1. 子任务名称（指派人）
1.2. 子任务名称（指派人）
1.3. 子任务名称（指派人）
```

- 使用 1.2.3 格式列出已完成子任务
- 不显示"进行中"子任务
- 仅输出本周有已完成子任务的父任务

### 进度计算

- **本周进度**：从父任务的 `progress` 字段获取当前总进度
- **上周进度**：跨周任务需根据历史数据推算（可选）

### 任务详情字段

| 字段     | 说明                             |
| -------- | -------------------------------- |
| progress | 父任务当前进度百分比             |
| children | 子任务列表（包含在父任务详情中） |

**注意**：

- 以父任务为纬度进行统计
- 父任务（parent:0 或 parent:-1）包含多个子任务（parent 为父任务ID）
- 进度直接从 `progress` 字段获取
- 仅输出本周有完成子任务的父任务
- 不统计工时

## 分析流程

1. **检查认证** → `zentaopms auth status`，如401调用认证脚本
2. **获取项目列表** → 筛选目标项目（进行中状态）
3. **获取迭代列表** → 筛选目标迭代 `execution list -p <project_id> --status doing`
4. **获取任务列表** → 获取迭代下所有任务 `task list -e <execution_id> -l 50`
5. **筛选本周任务** → `deadline` >= 本周第一天 且 `status` 为 doing/done
6. **按父任务分组** → 将子任务关联到其父任务（parent:0 或 parent:-1）
7. **获取父任务详情** → `task info <parent_id>` 获取 `progress` 字段
8. **生成周报** → 仅输出本周有已完成子任务的父任务，按格式输出

## 示例

### 获取项目迭代信息

```bash
# 获取项目列表
zentaopms --json project list

# 获取项目ID为1的迭代列表
zentaopms --json execution list -p 1

# 获取迭代ID为10的任务列表
zentaopms --json task list -e 10

# 筛选已完成任务
zentaopms --json task list -e 10 --status done
```

## 发送通知

使用脚本将周报内容写入临时文件目录，再发送钉钉通知。

### 脚本位置

```
skills/weekly-report/scripts/weekly-report.py
```

### 使用方法

```bash
# 方式1: 从文件读取
python skills/weekly-report/scripts/weekly-report.py --file /path/to/weekly.md

# 方式2: 从 stdin 传入
cat /path/to/weekly.md | python skills/weekly-report/scripts/weekly-report.py

# 方式3: 直接传入内容
python skills/weekly-report/scripts/weekly-report.py --content "周报内容"
```

生成的文件在 `C:\Users\用户名\nextclaw-temp\weekly_时间戳.md`。

### 临时文件目录

所有脚本统一使用**用户主目录下的固定目录**（跨平台兼容）。

**目录位置：**

- **Windows**: `C:\Users\用户名\nextclaw-temp`
- **Linux**: `/home/用户名/nextclaw-temp`
- **Mac**: `/Users/用户名/nextclaw-temp`

**执行脚本时会输出绝对路径**

```bash
python skills/dingtalk-notify/scripts/dingtalk-notify.py markdown '周报总结' --file C:\Users\用户名\nextclaw-temp\weekly_时间戳.md --cleanup
```
