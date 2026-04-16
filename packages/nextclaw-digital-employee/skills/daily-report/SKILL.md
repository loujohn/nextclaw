---
name: daily-report
name_zh: 日报填写
description: "封装并提交日报数据至内部系统。自动完成登录鉴权、参数校验与接口调用。当需要填写日报、提交工作汇报或补充项目进度信息时使用。"
metadata:
  nextclaw:
    emoji: "📝"
    category: "project-management"
---

# 日报填写技能

**⚠️ 重要：本技能使用 Python 编写，必须使用 `python` 命令调用，禁止使用 `node`！**

**⚠️ 脚本路径：`skills/daily-report/scripts/daily-report.py`**

封装并提交日报数据至内部系统接口。

## 前置要求

使用本技能前需要准备以下环境变量：

| 变量            | 说明           |
| --------------- | -------------- |
| `PM_BASE_URL`   | 基础 URL       |
| `PM_USERNAME`   | 登录用户名     |
| `PM_PASSWORD`   | 登录密码       |
| `PM_BASIC_AUTH` | Basic 认证凭证 |

## 接口信息

### 日报提交接口

```
POST {PM_BASE_URL}/admin/day/report
Content-Type: application/json
Authorization: Bearer {token}
```

### 项目查询接口

```
POST {PM_BASE_URL}/admin/project/pageProject?current=1&size=50&queryType=3&projectName={关键词}
Content-Type: application/json
Authorization: Bearer {token}

Body: {}（空对象）
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
| `dayReportType`      | 日报类型（默认2）     | 否，默认2   |
| `workHourProportion` | 工时占比（0-1）       | 否，默认0.0 |

### 错误示例（禁止使用）

```json
{
  "workSummary": "完成工作", // ❌ 错误！应为 daySummarizeNow
  "workPlan": "继续工作", // ❌ 错误！应为 dayPlanNext
  "workRatio": 1.0 // ❌ 错误！应为 workHourProportion
}
```

### 正确示例

```json
{
  "date": "2026-04-15",
  "projectCode": "XM202503112160",
  "projectName": "测试项目",
  "projectStage": "开发中",
  "projectManager": "张三",
  "daySummarizeNow": "完成工作",
  "dayPlanNext": "继续工作"
}
```

## 使用流程

1. **解析用户消息** → 从用户输入中提取日报信息
2. **查询项目** → 如项目不明确，调用 `--query-projects` 查询并让用户选择
3. **校验必填字段** → 检查是否所有必填字段都有值
4. **反问缺失字段** → 如有缺失，向用户反问获取完整信息
5. **生成预览** → 使用 `--submit --json-file <file>` 显示预览并生成参数文件
6. **用户确认** → 用户确认后，AI 调用 `--confirm --json-file <file>` 提交

## 调用脚本

### 命令行选项

| 选项               | 说明                                 |
| ------------------ | ------------------------------------ |
| `--submit`         | 生成预览并生成参数文件，输出确认提示 |
| `--confirm`        | 确认提交（需配合 --json-file）       |
| `--dry-run`        | 仅显示预览，不生成文件不提交         |
| `--validate`       | 仅校验参数，返回 JSON 格式校验结果   |
| `--json`           | JSON 格式的日报参数                  |
| `--json-file`      | 从文件读取日报参数                   |
| `--date`           | 日期（默认当天，格式 YYYY-MM-DD）    |
| `--query-projects` | 根据关键词查询项目列表               |
| `--select`         | 从缓存的查询结果中选择项目           |

### 使用示例

```bash
# 1. 查询项目
python daily-report.py --query-projects "测试"

# 2. 选择项目（返回项目信息）
python daily-report.py --select 1

# 3. 生成预览并生成参数文件
python daily-report.py --submit --json-file "日报参数.json"
# 输出预览后，脚本自动生成参数文件，并提示用户确认

# 4. 用户确认后，AI 调用此命令提交
python daily-report.py --confirm --json-file "参数文件路径.json"
```

## 交互式反问

当用户消息中缺少必填信息时，按以下顺序反问：

```
请补充以下信息：
1. 日期
2. 项目名称（可使用 --query-projects 查询）
3. 今日工作总结
4. 明日工作计划
```

**注：**

- 工时占比可不填，默认自动设置为 0.0
- 项目编号、项目经理、项目阶段从查询结果中自动获取

## 流程说明

**两步提交机制**：

1. **生成预览**（`--submit`）：校验参数 → 显示预览 → 自动生成参数文件 → 输出确认命令
2. **确认提交**（`--confirm --json-file`）：读取参数文件 → 执行提交

```bash
# 第1步：生成预览（不实际提交）
python daily-report.py --submit --json '{...}'

# 第2步：使用脚本输出的确认命令提交
python daily-report.py --submit --confirm --json-file "C:\Users\用户名\nextclaw-temp\daily-report\param_xxx.json"
```

## 参数文件

**⚠️ 重要：所有临时文件必须放到指定目录，禁止随意存放！**

**⚠️ 参数文件由脚本自动生成，不要手动创建！**

### 文件位置

```
~/nextclaw-temp/daily-report/

Windows: C:\Users\用户名\nextclaw-temp\daily-report\
Linux/Mac: ~/nextclaw-temp/daily-report/
```

### 文件名格式

```
param_{项目编码}_{用户名}_{时间}.json

示例：param_XM202503112160_admin_202604151520.json
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
