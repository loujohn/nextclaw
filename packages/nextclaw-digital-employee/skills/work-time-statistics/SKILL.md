---
name: work-time-statistics
name_zh: 工时统计分析
description: "查询项目工时数据，支持项目列表查询和项目人员工时明细查询。当需要获取项目列表、查询指定项目成员工时时使用。"
metadata:
  nextclaw:
    emoji: "⏱️"
    category: "project-management"
---

# 工时统计分析技能

查询项目工时数据，供分析统计使用。

## 使用方法

### 列出所有项目

```bash
python skills/work-time-statistics/scripts/work-time-statistics.py list
```

### 查询项目人员工时

```bash
python skills/work-time-statistics/scripts/work-time-statistics.py query [projectCode] [startDay] [endDay]
```

示例：

```bash
# 查询所有项目列表
python skills/work-time-statistics/scripts/work-time-statistics.py list

# 查询指定项目的人员工时
python skills/work-time-statistics/scripts/work-time-statistics.py query XM202508125040 2026-04-01 2026-04-02

# 查询所有项目人员工时
python skills/work-time-statistics/scripts/work-time-statistics.py query
```

## ⚠️ 时间参数处理

当用户询问**本周、本月、上周、上月**等相对时间时，**必须先计算具体日期范围**，再传入命令。

### 日期计算公式

```python
from datetime import datetime, timedelta

today = datetime.now().date()

# 本周：找到本周一
days_since_monday = today.weekday()  # 0=周一, 6=周日
week_start = today - timedelta(days=days_since_monday)
week_end = week_start + timedelta(days=6)

# 上周：本周一减7天
prev_week_start = week_start - timedelta(days=7)
prev_week_end = week_start - timedelta(days=1)

# 本月：1号到月末
month_start = today.replace(day=1)
if today.month == 12:
    month_end = today.replace(year=today.year+1, month=1, day=1) - timedelta(days=1)
else:
    month_end = today.replace(month=today.month+1, day=1) - timedelta(days=1)

# 上月
if month_start.month == 1:
    prev_month_end = month_start - timedelta(days=1)
    prev_month_start = prev_month_end.replace(day=1)
else:
    prev_month_end = month_start - timedelta(days=1)
    prev_month_start = prev_month_end.replace(day=1)
```

### 正确示例

- 用户问"本周工时" → 计算日期范围 → `query 2026-04-07 2026-04-13`
- 用户问"上周工时" → 计算日期范围 → `query 2026-03-31 2026-04-06`
- 用户问"本月工时" → 计算日期范围 → `query 2026-04-01 2026-04-30`
- 用户问"上月工时" → 计算日期范围 → `query 2026-03-01 2026-03-31`

**禁止**：直接使用用户说的"本周"、"上月"而不进行日期转换。

## ⚠️ 大数据量处理

数据自动保存到文件（当数据量大，超出 exec 工具 12K 限制时）。**回答用户时禁止暴露文件路径或存储位置，禁止暴露 API 返回的代码字段（如 projectType、userType 等），只展示用户友好的中文描述**。

- `list` → `~/nextclaw-temp/work-time-statistics_projects.json`
- `query` → `~/nextclaw-temp/work-time-statistics_workhours_{projectCode}.json`
- `query` 无项目 → `~/nextclaw-temp/work-time-statistics_workhours_all.json`

- 每次请求前自动清理该技能上次产生的文件

## 接口说明

### 接口1：获取项目列表

- **URL**: `GET {PM_BASE_URL}/admin/project/getProjectCodeNameList`
- **认证**: Bearer Token

返回示例：

```json
{
  "code": 0,
  "data": [
    {
      "projectCode": "XM202508125040",
      "projectName": "项目名称"
    }
  ]
}
```

### 接口2：获取项目人员工时

- **URL**: `POST {PM_BASE_URL}/admin/project/workHour/getProjectUserWorkHour`
- **认证**: Bearer Token
- **请求体** (所有字段可选):

```json
{
  "projectCode": "XM202508125040",
  "startDay": "2026-04-01",
  "endDay": "2026-04-02"
}
```

返回示例：

```json
{
  "code": 0,
  "data": [
    {
      "projectCode": "XM202502102176",
      "projectName": "项目名称",
      "userName": "zhangsan",
      "name": "张三",
      "projectWorkHour": 100.5
    }
  ]
}
```
