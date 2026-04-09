---
name: business-management-analysis
name_zh: 经营管理分析
description: "利用 mcporter 连接经营管理 MCP 服务，进行数据分析、报表查询等经营管理工作。当需要进行经营管理数据分析、生成经营报表、或查询业务指标时使用。"
metadata:
  nextclaw:
    emoji: "📊"
    category: "business-management"
---

# 经营管理分析技能

利用 mcporter 连接经营管理 MCP 服务，进行数据分析和查询。

## ⚠️ 警告：禁止直接使用 mcporter 命令！

**请通过 Python 脚本执行，不要直接使用 mcporter 命令！**

直接使用 mcporter 会导致以下错误：

- 缺少 OAuth2 Token
- 参数格式错误
- 无法获取数据

**正确方式：**

```bash
python skills/business-management-analysis/scripts/bm-query.py call forewarn
```

**错误方式（禁止）：**

```bash
mcporter call server_name1.forewarn  # ❌ 错误！
mcporter call business-mgmt.forewarn  # ❌ 错误！
```

## 前置要求

**必须先阅读 [mcporter 技能](../mcporter/SKILL.md)，确保 mcporter 已安装。**

## 环境变量

| 变量          | 说明                       |
| ------------- | -------------------------- |
| PM_MCP_URL    | MCP 服务端点地址           |
| PM_BASE_URL   | 基础 URL（用于获取 Token） |
| PM_USERNAME   | API 用户名                 |
| PM_PASSWORD   | API 密码                   |
| PM_BASIC_AUTH | Basic 认证凭证             |

## 使用方法

### 列出可用工具

```bash
python skills/business-management-analysis/scripts/bm-query.py list
```

### 调用单个工具

```bash
python skills/business-management-analysis/scripts/bm-query.py call <工具名> [参数1] [参数2] ...
```

**参数说明**：参数用**空格**分隔，格式为 `key=value`。

示例：

```bash
# 项目推进情况（无参数）
python skills/business-management-analysis/scripts/bm-query.py call stageCount

# 经营数据统计（无参数）
python skills/business-management-analysis/scripts/bm-query.py call businessDataStatistics

# 整体收款情况（传 timeFlag=4）
python skills/business-management-analysis/scripts/bm-query.py call allCollect timeFlag=4

# 预警情况（无参数）
python skills/business-management-analysis/scripts/bm-query.py call forewarn

# 单个项目收款情况（传 name 和 timeFlag）
python skills/business-management-analysis/scripts/bm-query.py call singleCollect name=渝你同行 timeFlag=4
```

### 全面分析（获取所有数据）

```bash
python skills/business-management-analysis/scripts/bm-query.py all
```

这会同时获取：项目推进情况、预警情况、整体收款、整体付款、签约金额、年度自建

**注意**：

- 如果用户只是问某个具体问题，不要使用 `all`，只调用对应的单个工具。
- `all` **不包含**经营数据统计（businessDataStatistics），该工具用于查询**详细经营数据**，需单独调用。

## ⚠️ 大数据量处理

查询结果会保存到文件，终端只输出文件路径。**回答用户时禁止暴露文件路径或存储位置，禁止暴露 API 返回的代码字段，只展示用户友好的中文描述**。

- `call <tool>` → `~/nextclaw-temp/business-management-analysis_{tool}.json`
- `all` → `~/nextclaw-temp/business-management-analysis_all.json`
- 每次请求前自动清理该技能上次产生的文件

## 可用工具

| 工具名                 | 说明                  | 参数（空格分隔，格式 key=value） |
| ---------------------- | --------------------- | -------------------------------- |
| stageCount             | 项目推进情况          | -                                |
| payCondition           | 整体付款情况          | [name=xxx] [timeFlag=4]          |
| businessDataStatistics | 经营数据统计          | [name=xxx] [yearAndMonth=202603] |
| allCollect             | 整体收款情况          | [name=xxx] [timeFlag=4]          |
| forewarn               | 预警情况（超期/亏损） | -                                |
| chanceStatistics       | 签约金额              | [name=xxx] [timeFlag=4]          |
| singlePay              | 单个项目付款情况      | name=xxx [timeFlag=4]            |
| selfBuildYear          | 年度自建情况          | [timeFlag=4]                     |
| singleCollect          | 单个项目收款情况      | name=xxx [timeFlag=4]            |

## ⚠️ 易混淆概念说明

### businessDataStatistics（经营数据统计）

这是一个**综合经营明细查询**工具，返回每个项目的完整经营数据：

- 合同金额、自有人工成本、外采成本
- 毛利率、自建率、自建率偏差
- 项目状态、项目分类（自研/承建）

**支持两种查询方式**：

```bash
# 查所有项目（不传参数）
python skills/business-management-analysis/scripts/bm-query.py call businessDataStatistics

# 查单个项目（传 name）
python skills/business-management-analysis/scripts/bm-query.py call businessDataStatistics name=数字广安

# 查指定年月（传 yearAndMonth）
python skills/business-management-analysis/scripts/bm-query.py call businessDataStatistics yearAndMonth=202603
```

**⚠️ 重要提示**：当用户询问**单个项目**的经营统计数据时：

1. 先调用 `businessDataStatistics`（不传参数）获取所有项目列表
2. 根据用户说的名称（可能是简称）在返回的数据中过滤出对应项目
3. 直接返回该项目的经营数据，**无需再次调用**

### 与 singlePay / singleCollect 的区别

| 工具                   | 查询内容                                   | 适用场景                   |
| ---------------------- | ------------------------------------------ | -------------------------- |
| businessDataStatistics | 综合经营数据（合同、成本、毛利率、自建率） | 分析项目盈利能力、成本控制 |
| singlePay              | 仅付款情况                                 | 查某个项目付了多少钱       |
| singleCollect          | 仅收款情况                                 | 查某个项目收了多少钱       |

**示例**：

```bash
# 查"数字广安"的综合经营数据（含毛利率、成本等）
python skills/business-management-analysis/scripts/bm-query.py call businessDataStatistics name=数字广安

# 查"数字广安"的付款情况
python skills/business-management-analysis/scripts/bm-query.py call singlePay name=数字广安 timeFlag=4

# 查"数字广安"的收款情况
python skills/business-management-analysis/scripts/bm-query.py call singleCollect name=数字广安 timeFlag=4
```

### timeFlag 参数说明

| 值  | 说明   |
| --- | ------ |
| 1   | 当月   |
| 2   | 当年   |
| 3   | 当季度 |
| 4   | 整体   |
