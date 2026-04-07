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

## ⚠️ 时间参数处理说明

当用户询问**本周、本月、上周、上月**等相对时间时，必须**先获取当前日期**，然后计算对应的日期范围：

1. **先获取当前日期**：使用 Python 的 datetime 获取今天的日期
2. **根据当前日期计算周期**：
   - 本周：当前日期所在的周一到周日（本周一 ~ 本周日）
   - 上周：本周一往前7天（上周一 ~ 上周日）
   - 本月：当前月份1号到月末（1号 ~ 月最后一天）
   - 上月：上个月1号到月末
3. **将计算后的日期传入**：`query startDay endDay`

**示例**：

- 用户问"本周工时" → 计算本周日期范围 → `query 2026-04-07 2026-04-13`
- 用户问"上月工时" → 计算上月日期范围 → `query 2026-03-01 2026-03-31`

**禁止**：直接使用用户说的"本周"、"上月"而不进行日期转换。

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
      "userName": "张三",
      "userAccount": "zhangsan",
      "workHours": [
        {
          "date": "2026-04-01",
          "hours": 8,
          "taskName": "任务名称"
        }
      ]
    }
  ]
}
```
