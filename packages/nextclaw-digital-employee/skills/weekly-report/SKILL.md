---
name: weekly-report
name_zh: 项目周报生成
version: 1.0.2
description: "查询本周日报数据，综合整理生成周报并提交至内部系统。支持个人/项目/部门三种周报模式，可指定任意周或日期范围。"
metadata:
  nextclaw:
    emoji: "📊"
    category: "project-management"
---

# 项目周报生成技能

**⚠️ 重要：本技能使用 Python 编写，必须使用 `python` 命令调用，禁止使用 `node`！**

**⚠️ 脚本路径：`skills/weekly-report/scripts/weekly-report.py`**

## 功能说明

1. **数据来源**：优先从本地日报汇总文件读取，同时支持从API获取数据进行综合
2. **周报模式**：
   - 个人周报：汇总个人本周在所有项目的工作（需要提交）
   - 项目周报：每个项目的本周汇总（仅预览）
   - 部门周报：所有项目周报的汇总（仅预览）
3. **时间范围**：支持本周、上周、任意指定日期范围

## 对话交互流程

### 用户请求生成周报时
1. 先询问用户选择周报模式（个人/项目/部门）
2. 如果是个人周报，确认填报人用户名和中文名
3. 调用脚本预览
4. 用户确认无误后提交（仅个人周报需要提交）

### 对话示例
```
用户: 生成周报
AI: 请选择周报模式：1.个人周报 2.项目周报 3.部门周报
用户: 1
AI: 请确认填报人信息：用户名和中文名
用户: admin - 管理员
AI: [调用脚本生成周报]
```

## 调用命令


### 命令行选项

| 选项 | 说明 |
|------|------|
| `--mode personal` | 个人周报（需要 --user 指定用户名） |
| `--mode project` | 项目周报（默认） |
| `--mode department` | 部门周报 |
| `--user <用户名>` | 指定用户（用于个人周报） |
| `--project <项目编号>` | 指定项目（用于单个项目周报） |
| `--review` | 预览周报 |
| `--submit` | 提交周报（仅个人周报有效） |
| `--week <偏移>` | 周偏移量：0=本周（默认），-1=上周，-2=上上周 |
| `--week-start <日期>` | 指定周开始日期 YYYY-MM-DD |
| `--week-end <日期>` | 指定周结束日期 YYYY-MM-DD |
| `--size` | 查询每页大小（默认50） |

### 使用示例

```bash
# 本周项目周报
python skills/weekly-report/scripts/weekly-report.py --mode project --review

# 上周个人周报
python skills/weekly-report/scripts/weekly-report.py --week -1 --mode personal --user admin --review

# 指定日期范围的项目周报
python skills/weekly-report/scripts/weekly-report.py --week-start 2026-04-07 --week-end 2026-04-13 --mode project --review

# 提交个人周报
python skills/weekly-report/scripts/weekly-report.py --mode personal --user admin --submit
```

## 周报输出示例

### 个人周报
```
【个人周报】admin
参与项目数：3

### 本周工作总结
1. 完成XXX功能开发
2. 完成XXX接口调试
...

### 下周工作计划
继续XXX开发
完成XXX测试
...
```

### 项目周报
```
【项目周报】XXX系统（项目编号）
项目经理：张三

### 本周工作总结
1. 完成XXX开发
2. 完成XXX测试
...

### 下周工作计划
继续XXX开发
完成XXX部署
...
```

## 数据文件

周报数据存储在用户目录：
- **Windows**: `C:\Users\用户名\nextclaw-temp\daily-report\{周}\`
- **Linux/Mac**: `/home/用户名/nextclaw-temp/daily-report/{周}/`

包含文件：
- `projects.md` - 项目维度日报汇总
- `users.md` - 人员维度日报汇总
- `raw_dailies.json` - 原始日报数据

## 注意事项

1. 只有**个人周报**需要提交，项目周报和部门周报仅供查看
2. ��交时每个项目周报单独提交，显示提交进度
3. 数据综合了本地汇总文件和API数据，任一数据源可用即可生成周报
4. 默认生成本周周报，可通过 `--week -1` 或 `--week-start` 指定其他周
