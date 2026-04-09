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
python skills/work-time-statistics/scripts/work-time-statistics.py query [参数1] [参数2] ...
```

**参数说明**：参数用**空格**分隔，格式为 `key=value`。

支持参数：

- `period`: 相对时间 (`本周`/`上周`/`本月`/`上月`)，自动计算日期
- `startDay`: 开始日期 (YYYY-MM-DD)
- `endDay`: 结束日期 (YYYY-MM-DD)
- `projectCode`: 项目编号
- `projectType`: 项目分类 (`承建`/`自研`/`运营`/`商机项目`)

示例：

```bash
# 查询所有项目列表
python skills/work-time-statistics/scripts/work-time-statistics.py list

# 使用相对时间查询
python skills/work-time-statistics/scripts/work-time-statistics.py query period=本周
python skills/work-time-statistics/scripts/work-time-statistics.py query period=上月

# 筛选项目分类
python skills/work-time-statistics/scripts/work-time-statistics.py query period=本月 projectType=自研
python skills/work-time-statistics/scripts/work-time-statistics.py query period=本周 projectType=承建

# 指定日期范围和项目
python skills/work-time-statistics/scripts/work-time-statistics.py query projectCode=XM202508125040 startDay=2026-04-01 endDay=2026-04-07
```

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
