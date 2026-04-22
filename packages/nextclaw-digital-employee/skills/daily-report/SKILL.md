---
name: daily-report
name_zh: 项目日报生成
version: 1.0.2
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

### 商机查询接口（可选）

```
GET {PM_BASE_URL}/admin/business/chance/page?current=1&size=10&customerCode={客户编码}
Authorization: Bearer {token}
```

**注意**：商机是可选的，不是必须填的。

### 客户查询接口

```
POST {PM_BASE_URL}/admin/getCustomer?customerType={客户类型}&customerName={客户关键词}
Authorization: Bearer {token}
```
- `customerType`：1=客户，2=合作伙伴（可选）

### 对接人查询接口

```
POST {PM_BASE_URL}/admin/getContacts?customerName={客户名称}&contactsName={对接人名称}&contactsCode={对接人code}
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

## 日报类型

日报分为两种类型：
- **项目日报**（`dayReportType=2`）：填写项目相关工作
- **商机日报**（`dayReportType=1`）：填写商机/客户拜访相关工作

### 项目日报参数（dayReportType=2）

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

### 商机日报参数（dayReportType=1）

**⚠️ 注意**：商机相关字段（chanceId、chanceCode 等）是可选的，不是必须填的！

| 字段名               | 说明                  | 必填        |
| -------------------- | --------------------- | ----------- |
| `date`               | 日报日期，格式 YYYY-MM-DD | 是      |
| `dayReportType`      | 日报类型（填1）       | 是          |
| `customerType`       | 客户类型（1=客户 2=合作伙伴）| 是 |
| `visitClientName`    | 拜访客户              | 是          |
| `visitClientCode`    | 拜访客户编码          | 否          |
| `visitClientId`      | 拜访客户ID            | 否          |
| `contractPersonName`| 对接人                | 是          |
| `contractPersonCode`| 对接人code            | 否          |
| `contractPersonDeptName`| 对接部门           | 是          |
| `contractPersonDeptId`| 对接人部门ID        | 否          |
| `contractPersonPosition`| 对接人职务         | 是          |
| `visitRecord`        | 拜访记录              | 是          |
| `clientHope`         | 客户期望              | 是          |
| `dayPlanNext`        | 下一步计划            | 是          |
| `chanceId`           | 商机ID                | 否          |
| `chanceCode`         | 商机编码              | 否          |
| `chanceProjectName` | 商机/项目名称         | 否          |
| `chanceProjectSchedule`| 商机/项目阶段       | 否          |
| `groupAttentionStage`| 集团关注项目阶段      | 否          |
| `workHourProportion` | 工时占比（0-1）       | 否，默认1.0 |

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

### 查询项目/商机

| 选项              | 说明                     |
| ---------------- | ------------------------ |
| `--report-user`  | 填报人用户名（必填）       |
| `-q [关键词]`    | 查询可选项目（可为空）    |
| `-qc [关键词]`   | 查询可选商机（可为空）    |
| `--select <数字>`| 从查询结果选择项目/商机       |

### 提交日报

| 选项                     | 说明              |
| ------------------------ | -----------------|
| `--submit`               | 提交日报        |
| `--validate`            | 预览（不提交）  |
| `--date`                 | 日期            |
| `--project-code`         | 项目编号        |
| `--day-summarize-now`    | 今日工作总结   |
| `--day-plan-next`        | 明日工作计划   |
| `--problem-risk`        | 问题与风险（选填）|
| `--request-instructions` | 请示事项（选填）|
| `--report-user`          | 填报人用户名（必填）|
| `--report-name`          | 填报人中文名（必填）|

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

### 核心原则

**先提取，后确认**：
1. 从用户描述中尽可能提取所有字段信息
2. 总结提取到的信息，问用户"是否需要补充"而不是逐个询问
3. 用户明确补充后再针对性询问

### 0. 日报类型判断

- 先根据用户描述判断是商机日报还是项目日报
- 判断规则：
  - 商机日报关键词：拜访、客户、商机、对接人、洽谈、交流、签约、客户期望等
  - 项目日报关键词：项目、开发、编码、测试、部署、功能、bug等
- 若无法判断，需明确询问用户

### 1. 商机日报 - 信息提取与确认

**从用户描述中提取以下字段**：
| 字段 | 来源 |
|------|------|
| `visitClientName` | 用户提及的客户名 |
| `contractPersonName` | 用户提及的对接人姓名 |
| `visitRecord` | 用户的拜访描述 |
| `clientHope` | 用户提及的客户期望/需求 |
| `下一步计划` | 用户提及的后续计划 |

**示例**：
- 用户说："我今天去拜访了中国移动的张先生，跟他聊了当前项目的可行性，他觉得可行性分析不全面，希望我做更深入的调查"

**提取结果**：
```
已提取到以下信息：
- 拜访客户：中国移动
- 对接人：张先生
- 拜访记录：跟张先生聊了当前项目的可行性，他觉得可行性分析不全面
- 客户期望：希望做更深入的调查

请确认以上信息是否正确？如有补充请告诉我。
```

**确认后补充缺失字段**：
- 如未提取到客户/对接人，调用查询接口补充
- 客户类型从查询结果中自动获取（无需询问）
- 下一步计划如未提及则询问确认

### 2. 项目日报 - 信息提取与确认

**从用户描述中提取以下字段**：
| 字段 | 来源 |
|------|------|
| `projectName` | 用户提及的项目名 |
| `daySummarizeNow` | 用户描述的今日工作 |
| `dayPlanNext` | 用户提及的下一步计划 |
| `problemRisk` | 用户提及的问题/风险 |
| `requestInstructions` | 用户提及的请示事项 |

**确认后**：调用 `--query-projects` 查询项目列表供用户选择

### 内容优化规则

- 将口语化表达转为正式工作用语
- 保持简洁，突出重点
- **注意**：不得添加用户未提及的内容，只做语言润色

### 查询补充原则

**商机日报**：
- 未提取到客户 → 调用 `--query-clients` 查询
- 未提取到对接人 → 调用 `--query-contacts --customer-name <客户名>` 查询
- 需要关联商机 → 调用 `--query-chances "" --customer-code <客户编码>` 查询

**项目日报**：
- 调用 `--query-projects <关键词> --report-user <填报人>` 查询项目

### 客户类型获取

- 调用 `--query-clients` 查询客户后，选择客户时返回的 JSON 中已包含 `customerType` 字段
- **无需再询问用户确认客户类型**

### 提交确认

- 逐个确认项目/商机，用户说"确认"或"提交"后再调用 `--submit` 执行提交
- 每个项目/商机提交后再处理下一个

## 存档文件说明

日报存档区分类型：
- **项目日报**：保存到 `projects.md`
- **商机日报**：保存到 `chances.md`
- 原始数据统一保存到 `raw_dailies.json`，每条记录包含 `dayReportType` 和 `reportTypeName` 字段区分类型

## 返回结果

### 提交成功

```json
{ "success": true, "message": "日报提交成功", "data": "日报新增成功" }
```

### 提交失败

```json
{ "success": false, "message": "错误描述", "errors": [] }
```

### 提交项目日报

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

### 提交商机日报（dayReportType=1）

```bash
python skills/daily-report/scripts/daily-report.py \
  --submit \
  --day-report-type 1 \
  --chance-id 2021831947373907968 \
  --chance-code SJ202602127969 \
  --chance-name "一体化业务管理系统" \
  --chance-schedule "拜访交流" \
  --customer-type 1 \
  --visit-client-name "中渝有限公司" \
  --visit-client-code KH202512303360 \
  --visit-client-id 2021831947373907968 \
  --contract-person-code LXR202512309824 \
  --contract-person-name 乔北 \
  --contract-person-dept-name 事业部 \
  --contract-person-position 副主任 \
  --contract-person-dept-id 1787377767628632065 \
  --visit-record "拜访交流记录" \
  --client-hope "客户期望" \
  --day-plan-now "今日计划" \
  --day-plan-next "明日计划" \
  --day-summarize-now "今日总结" \
  --date 2026-04-21 \
  --report-user zhangsan \
  --report-name 张三
```

### 查询客户

```bash
python skills/daily-report/scripts/daily-report.py \
  --query-clients "客户名称关键词" \
  --report-user admin
```

### 查询对接人

```bash
python skills/daily-report/scripts/daily-report.py \
  --query-contacts "" \
  --customer-name "客户名称" \
  --report-user admin
```

### 查询商机（可选）

```bash
# 按商机名称查询
python skills/daily-report/scripts/daily-report.py \
  --query-chances "关键词" \
  --report-user admin

# 按客户编码查询该客户下的商机
python skills/daily-report/scripts/daily-report.py \
  --query-chances "" \
  --customer-code "客户编码" \
  --report-user admin
```

### 选择客户/对接人

```bash
python skills/daily-report/scripts/daily-report.py \
  --select 1 \
  --report-user admin
```

## 注意事项

- **禁止在回复中暴露本地存储路径**：如 `C:\Users\xxx\`、`~/nextclaw-temp/` 等本地文件路径严禁出现在对话回复中
- 仅告知用户"日报已提交成功/已存档"即可，不要透露具体文件存放位置
