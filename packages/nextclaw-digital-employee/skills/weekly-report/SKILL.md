---
name: weekly-report
name_zh: 项目周报生成
version: 1.0.3
description: "基于日报数据生成周报，支持个人/部门/全公司三种维度，部门查询调用 API 确认后查日报汇总。"
metadata:
  nextclaw:
    emoji: "📊"
    category: "project-management"
---

# 项目周报生成技能

**⚠️ 重要：本技能使用 Python 编写，必须使用 `python` 命令调用，禁止使用 `node`！**

**⚠️ 脚本路径：`skills/weekly-report/scripts/weekly-report.py`**

## 功能

| 功能 | 命令 | 说明 |
|------|------|------|
| 生成个人周报 | `personal` | 基于本周日报自动生成个人周报（按项目分别生成，支持提交） |
| 查询部门日报汇总 | `dept-daily` | 查看某部门本周所有人的日报 |
| 生成部门周报 | `dept-weekly` | 汇总某部门本周所有工作 |
| 生成全公司周报 | `company` | 汇总全公司本周各维度工作 |


## 使用方式

### 1. 生成个人周报

```bash
# 预览本周个人周报
python weekly-report.py personal --user zhangsan --review

# 上周个人周报
python weekly-report.py personal --user zhangsan --week -1 --review

# 提交个人周报
python weekly-report.py personal --user zhangsan --submit
```

**填报人信息**：从钉钉会话上下文中获取 `name`（姓名）和 `username`（用户名）。获取后需与用户确认。

**周报内容**：
- 按项目分别生成周报（每个项目一份）
- 商机拜访汇总生成一份商机周报
- 每份周报包含：本周总结、下周计划
- 项目信息（编号、阶段、负责人）从本地日报数据中自动获取

### 2. 查询部门日报汇总

```bash
# 模糊匹配（如技术部 → 查询API模糊匹配，返回匹配到的部门供确认）
python weekly-report.py dept-daily --dept-name "技术部"
```

**部门查询逻辑**：
1. 用户输入部门关键词（如"技术部"）→ 调用 API 模糊搜索部门树
2. 匹配到 0 个 → 列出系统所有部门让用户确认
3. 匹配到 1 个 → 直接查询该部门日报数据
4. 匹配到多个 → 列出所有匹配部门让用户确认选择

按人员、日期展示部门本周所有日报内容。

### 3. 生成部门周报

```bash
# 模糊匹配（与 dept-daily 相同逻辑）
python weekly-report.py dept-weekly --dept-name "技术部"
```

汇总部门本周项目工作、商机拜访、下周计划。

### 4. 生成全公司周报

```bash
python weekly-report.py company
```

按部门汇总全公司本周工作情况。

## 数据来源

- 优先从本地日报汇总文件（`~/nextclaw-temp/daily-report/{周}/`）读取
- 包含：`users.md`（人员维度）、`projects.md`（项目维度）、`raw_dailies.json`（原始数据）

## 注意事项

1. 周报数据依赖日报数据，确保已提交本周日报
2. 个人周报按项目分别生成，每个项目一份周报
3. 只有个人周报需要提交，部门和全公司周报仅预览
4. 提交时如提示"重复填写"说明该周报已提交过
5. 项目信息从 `raw_dailies.json` 中自动获取（项目编码、阶段、负责人）
