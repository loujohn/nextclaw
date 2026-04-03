---
name: work-time-query
name_zh: 工时查询
description: "查询项目工时数据，支持项目列表查询和项目人员工时明细查询。当需要获取项目列表、查询指定项目成员工时时使用。"
metadata:
  nextclaw:
    emoji: "⏱️"
    category: "project-management"
---

# 工时查询技能

查询项目工时数据，供分析统计使用。

## 使用方法

### 列出所有项目

```bash
python skills/work-time-query/scripts/work-time-query.py list
```

### 查询项目人员工时

```bash
python skills/work-time-query/scripts/work-time-query.py query [projectCode] [startDay] [endDay]
```

示例：

```bash
# 查询所有项目列表
python skills/work-time-query/scripts/work-time-query.py list

# 查询指定项目的人员工时
python skills/work-time-query/scripts/work-time-query.py query XM202508125040 2026-04-01 2026-04-02

# 不填参数则查询全部
python skills/work-time-query/scripts/work-time-query.py query
```

示例：

```bash
# 查询所有项目列表
python skills/work-time-query/scripts/work-time-query.py list

# 查询指定项目的人员工时
python skills/work-time-query/scripts/work-time-query.py query XM202508125040 2026-04-01 2026-04-02
```

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
