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

### 调用 MCP 工具

```bash
python skills/business-management-analysis/scripts/bm-query.py call <工具名> [参数]
```

示例：

```bash
# 项目推进情况
python skills/business-management-analysis/scripts/bm-query.py call stageCount

# 经营数据统计
python skills/business-management-analysis/scripts/bm-query.py call businessDataStatistics

# 整体收款情况
python skills/business-management-analysis/scripts/bm-query.py call allCollect timeFlag=4

# 预警情况
python skills/business-management-analysis/scripts/bm-query.py call forewarn
```

## 可用工具

| 工具名                 | 说明                  | 参数                        |
| ---------------------- | --------------------- | --------------------------- |
| stageCount             | 项目推进情况          | token                       |
| payCondition           | 整体付款情况          | name?, timeFlag?, token     |
| businessDataStatistics | 经营数据统计          | name?, yearAndMonth?, token |
| allCollect             | 整体收款情况          | name?, timeFlag?, token     |
| forewarn               | 预警情况（超期/亏损） | token                       |
| chanceStatistics       | 签约金额              | name?, timeFlag?, token     |
| singlePay              | 单个项目付款情况      | name, timeFlag?, token      |
| selfBuildYear          | 年度自建情况          | token, timeFlag?            |
| singleCollect          | 单个项目收款情况      | name, timeFlag?, token      |

### timeFlag 参数说明

| 值  | 说明   |
| --- | ------ |
| 1   | 当月   |
| 2   | 当年   |
| 3   | 当季度 |
| 4   | 整体   |
