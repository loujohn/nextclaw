---
name: daily-report
name_zh: 项目日报生成
version: 1.0.1
description: "封装并提交项目日报数据至内部系统。自动完成登录鉴权、参数校验与接口调用。当需要生成项目日报、提交工作汇报或补充项目进度信息时使用。"
metadata:
  nextclaw:
    emoji: "📝"
    category: "project-management"
---

# 项目日报生成技能

**⚠️ 重要：本技能使用 Python 编写，必须使用 `python` 命令调用，禁止使用 `node`！**

**⚠️ 脚本路径：`skills/daily-report/scripts/daily-report.py`**

封装并提交日报数据至内部系统接口。

## 接口信息

### 日报提交接口

```
POST {PM_BASE_URL}/admin/day/report
Content-Type: application/json
Authorization: Bearer {token}
```

### 项目查询接口

```
POST {PM_BASE_URL}/admin/pageProjectForReport?username={填报人用户名}&queryType=3&current=1&size=50&projectName={关键词}
Content-Type: application/json
Authorization: Bearer {token}
```

### 返回示例

```json
{
  "code": 0,
  "data": {
    "records": [
      {
        "projectCode": "XM202602105600",
        "projectName": "测试项目",
        "projectManager": "张三",
        "projectStageNewName": "开发中"
      }
    ],
    "total": 257
  }
}
```

## 参数说明

**⚠️ 输入参数必须使用以下字段名，禁止使用其他字段名！**

| 字段名               | 说明                  | 必填        |
| -------------------- | --------------------- | ----------- |
| `date`               | 日期，格式 YYYY-MM-DD | 是          |
| `projectCode`        | 项目编号              | 是          |
| `projectName`        | 项目名称              | 是          |
| `projectStage`       | 项目阶段              | 是          |
| `projectManager`     | 项目经理              | 是          |
| `daySummarizeNow`    | 今日工作总结          | 是          |
| `dayPlanNext`        | 明日工作计划          | 是          |
| `problemRisk`        | 问题与风险            | 否          |
| `requestInstructions`| 请示事项              | 否          |
| `dayReportType`      | 日报类型（默认2）     | 否，默认2   |
| `workHourProportion` | 工时占比（0-1）       | 否，默认0.0 |

### 错误示例（禁止使用）

```bash
# ❌ 错误！字段名应为 kebab-case 格式
--day-summarize-now "完成工作"   # ❌ 错误！应为 daySummarizeNow
--day-plan-next "继续工作"       # ❌ 错误！应为 dayPlanNext
--work-ratio 1.0                  # ❌ 错误！应为 dayReportType
```

### 命令行参数示例

```bash
python daily-report.py --submit \
  --date "2026-04-15" \
  --project-code "XM202503112160" \
  --project-name "测试项目" \
  --project-stage "开发中" \
  --project-manager "张三" \
  --day-summarize-now "完成工作" \
  --day-plan-next "继续工作"
```

## 使用流程

1. **收集必填信息** → 从用户输入中提取：日期、今日总结、明日计划
2. **查询项目** → 先询问用户要填哪个项目，调用 `--query-projects` 查询（可传项目关键词或空）并让用户选择
3. **确认并提交** → 用户确认后，调用 `--submit` 生成参数文件并执行提交

## 调用脚本

### 命令行选项

| 选项                     | 说明                           |
| ------------------------ | ------------------------------ |
| `--query-projects`       | 查询可选项目列表               |
| `--select <数字>`        | 从查询结果中选择项目         |
| `--submit`              | 提交日报                      |
| `--validate`            | 预览日报（不提交）            |
| `--date`                | 日期 YYYY-MM-DD               |
| `--project-code`        | 项目编号                      |
| `--project-name`        | 项目名称                      |
| `--project-stage`      | 项目阶段                      |
| `--project-manager`    | 项目经理                      |
| `--day-summarize-now`  | 今日工作总结                 |
| `--day-plan-next`       | 明日工作计划                 |
| `--problem-risk`        | 问题与风险（选填）           |
| `--request-instructions`| 请示事项（选填）             |
| `--report-user`        | 填报人用户名（必填）          |
| `--report-name`        | 填报人中文名（必填）          |

### 使用示例

```bash
python skills/daily-report/scripts/daily-report.py \
  --submit \
  --project-code XM202602105600 \
  --project-name 测试项目 \
  --project-stage 开发中 \
  --project-manager 张三 \
  --day-summarize-now "完成功能开发" \
  --day-plan-next "继续测试" \
  --date 2026-04-19 \
  --report-user zhangsan \
  --report-name 张三
```

**注：** `--report-user` 和 `--report-name` 必填，用于指定填报人。

## 交互式反问

按以下顺序收集信息：

1. **填报人信息**：必填
   - 询问填报人的用户名和中文名（必填参数）
2. **日期**：默认当天，可指定
3. **今日总结**：必填，需对用户输入进行丰富和提炼，但不得偏离原意
4. **明日计划**：必填，需对用户输入进行丰富和提炼，但不得偏离原意
5. **问题与风险**：选填，轻提醒"有问题/风险吗？"
6. **请示事项**：选填，轻提醒"有需要请示的吗？"
7. **项目选择**：必填
   - 若用户已提及项目 → 直接使用
   - 若用户未提及项目 → 调用 `--query-projects` 查询全部项目（不传关键词），列出供用户选择

**内容优化规则**：

- 将口语化表达转为正式工作用语
- 保持简洁，突出重点
- 示例：
  - 用户说："今天写了点代码" → 优化为："完成功能模块代码编写"
  - 用户说："改了个bug" → 优化为："修复已知问题"
  - 用户说："明天继续写" → 优化为："继续完成功能模块开发"
- **注意**：不得添加用户未提及的内容，只做语言润色

**多项目处理**：

- 若用户提及多个项目 → 逐个处理，每个项目都需要用户确认后提交
- 确认格式：`确认` 或 `提交`（不区分大小写）
- 每个项目提交后再处理下一个，直到全部完成

**注：**

- 工时占比可不填，默认自动设置为 0.0
- 项目编号、项目经理、项目阶段从查询结果中自动获取

## 流程说明

1. **收集信息**：询问填报人（用户名+中文名）、日期、今日总结、明日计划、问题与风险、请示事项
2. **查询项目**：先询问用户要填哪个项目，再调用 `--query-projects` 查询（可传关键词或空）
3. **确认提交**：用户确认后，调用 `--submit` 执行提交

```bash
python daily-report.py --submit --project-code "XM202503112160" --project-name "测试项目" --project-stage "开发中" --project-manager "张三" --day-summarize-now "完成工作" --day-plan-next "继续工作"
```

## 返回结果

### 提交成功

```json
{ "success": true, "message": "日报提交成功", "data": "日报新增成功" }
```

### 提交失败

```json
{ "success": false, "message": "错误描述", "errors": [] }
```
