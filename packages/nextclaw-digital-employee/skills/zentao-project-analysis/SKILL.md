---
name: zentao-project-analysis
name_zh: 禅道项目分析
description: "利用禅道 CLI 分析项目健康状态，识别工时风险、进度风险和阻塞任务，并生成项目分析报告发送钉钉通知。当需要评估项目状态、识别项目风险、生成项目健康报告时使用。"
metadata:
  nextclaw:
    emoji: "📈"
    category: "project-management"
---

# 项目分析技能

利用禅道 CLI 分析项目状态，并发送钉钉群通知。

## 前置要求

使用本技能前，请先阅读 [禅道CLI技能](../zentao-cli/SKILL.md)，了解CLI命令使用方法和认证流程。

## 分析数据

### 项目基础信息

| 字段     | 说明                             | 来源命令                       |
| -------- | -------------------------------- | ------------------------------ |
| 项目名称 | 项目名称                         | `project list`、`project info` |
| 项目状态 | wait/doing/done/suspended/closed | `project info`                 |
| 项目经理 | 负责人                           | `project info`                 |
| 总工时   | 项目总工时                       | `project info`                 |
| 已消耗   | 已消耗工时                       | `project info`                 |
| 剩余工时 | 剩余可用工时                     | `project info`                 |

### 执行/迭代信息

| 字段          | 说明            | 来源命令         |
| ------------- | --------------- | ---------------- |
| 迭代名称      | 执行/迭代名称   | `execution list` |
| 迭代状态      | wait/doing/done | `execution list` |
| 进度          | 进度百分比      | `execution info` |
| 开始/结束日期 | 时间范围        | `execution info` |

### 任务统计

| 字段     | 说明                      | 来源命令                                     |
| -------- | ------------------------- | -------------------------------------------- |
| 总任务数 | 执行下全部任务            | `task list -e <execution_id>`                |
| 已完成   | 状态为done                | `task list -e <execution_id> --status done`  |
| 进行中   | 状态为doing               | `task list -e <execution_id> --status doing` |
| 待处理   | 状态为wait                | `task list -e <execution_id> --status wait`  |
| 阻塞任务 | 超过截止日期且状态为doing | `task list` 筛选 deadline                    |

### 团队信息

| 字段     | 说明         | 来源命令                    |
| -------- | ------------ | --------------------------- |
| 团队成员 | 项目成员列表 | `team list -p <project_id>` |
| 角色     | 成员角色     | `team list`                 |

## 分析规则

### 项目健康状态判断

| 状态 | 条件                                         |
| ---- | -------------------------------------------- |
| 正常 | 进行中，任务进度正常，无阻塞                 |
| 风险 | 进行中，剩余工时不足 或 超过截止日期任务 > 3 |
| 停滞 | 状态为wait超过3天 或 任务无进展超过1周       |

### 风险识别规则

1. **工时风险**：剩余工时 < 已消耗工时 × 20%
2. **进度风险**：任务完成率 < 50% 且已过计划工期50%
3. **阻塞风险**：进行中任务超过3个且超过截止日期

### 通知优先级

| 优先级 | 触发条件                                       |
| ------ | ---------------------------------------------- |
| 高     | 项目状态为suspended/closed，或风险指标超过阈值 |
| 中     | 任务延期 > 3个，或进度落后于计划               |
| 低     | 常规周报，无异常                               |

## 分析流程

1. **获取项目列表** → 筛选目标项目
2. **获取项目详情** → 分析基础信息
3. **获取执行列表** → 筛选进行中迭代
4. **获取任务列表** → 统计任务状态
5. **获取团队成员** → 确认成员构成
6. **综合判断** → 确定健康状态和风险等级
7. **发送通知** → 汇总结果发送到钉钉群

## 发送通知

使用脚本将分析结果写入临时文件目录，再发送钉钉通知。

### 脚本位置

```
skills/zentao-project-analysis/scripts/project-analysis.py
```

### 使用方法

```bash
# 方式1: 从文件读取
python skills/zentao-project-analysis/scripts/project-analysis.py --file /path/to/report.md

# 方式2: 从 stdin 传入
cat /path/to/report.md | python skills/zentao-project-analysis/scripts/project-analysis.py

# 方式3: 直接传入内容
python skills/zentao-project-analysis/scripts/project-analysis.py --content "分析内容"
```

生成的文件在 `C:\Users\用户名\nextclaw-temp\project_analysis_时间戳.md`。

### 临时文件目录

所有脚本统一使用**用户主目录下的固定目录**（跨平台兼容）。

**目录位置：**

- **Windows**: `C:\Users\用户名\nextclaw-temp`
- **Linux**: `/home/用户名/nextclaw-temp`
- **Mac**: `/Users/用户名/nextclaw-temp`

**执行脚本时会输出绝对路径**

```bash
python skills/dingtalk-notify/scripts/dingtalk-notify.py markdown '项目分析报告' --file C:\Users\用户名\nextclaw-temp\project_analysis_时间戳.md --cleanup
```

## 输出格式

分析完成后，输出项目分析报告，包含：

- 项目基本信息（名称、状态、经理、工时）
- 迭代信息（当前迭代、进度、状态）
- 任务统计（总数、已完成、进行中、待处理）
- 健康状态判断（正常/风险/停滞）
- 风险提示（如有）
