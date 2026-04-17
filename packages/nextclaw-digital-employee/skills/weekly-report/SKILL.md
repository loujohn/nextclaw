---
name: weekly-report
name_zh: 项目周报生成
version: 1.0.1
description: "查询本周日报数据，综合整理生成周报并提交至内部系统。自动完成登录鉴权、日报汇总与周报提交。当需要生成项目周报、提交周报或汇总本周工作时日报时使用。"
metadata:
  nextclaw:
    emoji: "📊"
    category: "project-management"
---

# 项目周报生成技能

**⚠️ 重要：本技能使用 Python 编写，必须使用 `python` 命令调用，禁止使用 `node`！**

**⚠️ 脚本路径：`skills/weekly-report/scripts/weekly-report.py`**

查询本周日报数据，综合整理生成周报并提交至内部系统。

## 接口信息

### 日报查询接口

```
GET {PM_BASE_URL}/admin/day/report/page?createTimeQuery={start}&createTimeQuery={end}&dayReportType=2&queryType=1&current=1&size=10
Authorization: Bearer {token}
```

### 周报提交接口

```
POST {PM_BASE_URL}/admin/week/report
Content-Type: application/json
Authorization: Bearer {token}
```

## 使用流程

1. **查询本周日报** → 调用 `--query-dailies` 获取本周所有日报
2. **预览周报** → 调用 `--review` 基于日报数据预览生成的周报
3. **确认提交** → 用户确认后，调用 `--submit` 提交周报

## 调用脚本

### 命令行选项

| 选项                     | 说明                           |
| ------------------------ | ------------------------------ |
| `--query-dailies`        | 查询本周所有日报数据           |
| `--review`               | 预览周报（基于查询的日报数据） |
| `--submit`               | 确认并提交周报                 |
| `--validate`             | 校验周报参数                   |
| `--username`             | 用户名（环境变量 PM_USERNAME） |
| `--password`             | 密码（环境变量 PM_PASSWORD）   |
| `--json-file`            | 从 JSON 文件读取周报参数       |
| `--project-code`         | 项目编号                       |
| `--project-name`         | 项目名称                       |
| `--project-manager`      | 项目经理                       |
| `--week-summarize`       | 本周工作总结                   |
| `--week-plan`            | 下周工作计划                   |
| `--problem-risk`         | 问题与风险                     |
| `--request-instructions` | 请示事项                       |
| `--week-report-type`     | 周报类型（默认 2）             |
| `--week-start-time`      | 周开始时间 YYYY-MM-DD HH:MM:SS |
| `--week-end-time`        | 周结束时间 YYYY-MM-DD HH:MM:SS |
| `--size`                 | 查询每页大小（默认 50）        |

### 使用示例

```bash
# 1. 设置环境变量（或直接传入）
export PM_USERNAME="your_username"
export PM_PASSWORD="your_password"

# 2. 查询本周日报
python skills/weekly-report/scripts/weekly-report.py --query-dailies

# 3. 预览生成的周报
python skills/weekly-report/scripts/weekly-report.py --review

# 4. 确认并提交周报
python skills/weekly-report/scripts/weekly-report.py --submit
```

## 周报生成规则

### 自动汇总

- 按项目分组汇总本周日报
- 将每日 `daySummarizeNow` 合并为 `weekSummarizeNow`
- 将每日 `dayPlanNext` 合并为 `weekPlanNext`
- 自动填充周时间范围

### 周报字段

| 字段                  | 说明         | 来源               |
| --------------------- | ------------ | ------------------ |
| `weekSummarizeNow`    | 本周工作总结 | 汇总日报工作总结   |
| `weekPlanNext`        | 下周工作计划 | 汇总日报工作计划   |
| `projectCode`         | 项目编号     | 日报数据           |
| `projectName`         | 项目名称     | 日报数据           |
| `projectManager`      | 项目经理     | 日报数据           |
| `weekStartTime`       | 周开始时间   | 自动计算（本周一） |
| `weekEndTime`         | 周结束时间   | 自动计算（本周日） |
| `weekReportType`      | 周报类型     | 默认 2             |
| `problemRisk`         | 问题与风险   | 默认为"无"         |
| `requestInstructions` | 请示事项     | 默认为"无"         |

### 返回示例

**查询日报成功：**

```json
{
  "code": 0,
  "data": {
    "records": [
      {
        "projectCode": "XM202602105600",
        "projectName": "测试项目",
        "projectManager": "张三",
        "daySummarizeNow": "完成功能开发",
        "dayPlanNext": "继续测试",
        "reportDate": "2026-04-14"
      }
    ],
    "total": 5
  }
}
```

**提交周报成功：**

```json
{ "success": true, "message": "周报提交成功" }
```

**提交周报失败：**

```json
{ "success": false, "message": "错误描述" }
```

## 临时文件

查询结果缓存至用户目录：

- **Windows**: `C:\Users\用户名\nextclaw-temp\weekly-report\daily_reports_query_{username}.json`
- **Linux/Mac**: `/home/用户名/nextclaw-temp/weekly-report/daily_reports_query_{username}.json`

提交成功后自动清理缓存文件。
