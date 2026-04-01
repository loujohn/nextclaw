---
name: projectmgt-cli
name_zh: 项目管理 CLI
description: "ProjectMGT 项目管理系统的命令行工具使用指南，支持项目、工时、人员、审批、合同、客户等模块的查询操作。当需要从 ProjectMGT 获取项目数据、工时统计或团队信息时使用。"
metadata:
  nextclaw:
    emoji: "📊"
    category: "project-management"
---

# ProjectMGT CLI 技能

ProjectMGT 命令行工具的使用指南，支持项目、工时、人员、审批等数据的查询操作。

## 快速开始

### 使用前必读

**每次使用CLI命令前，必须先检查认证状态。**

如果返回未认证错误，必须先进行认证才能继续操作。

### 认证配置

```bash
# 检查认证状态
projectmgt auth status
```

### 输出格式

- 默认输出为人类可读格式
- 使用 `--json` 参数获取 JSON 格式，便于程序解析

---

## 使用流程

### 标准流程

1. **检查认证状态**

   ```bash
   projectmgt auth status
   ```

2. **执行目标命令**

   ```bash
   projectmgt --json project list
   ```

3. **如果返回未认证**

   ```bash
   # 调用认证脚本（使用环境变量 PM_BASE_URL, PM_USERNAME, PM_PASSWORD）
   python skills/projectmgt-cli/scripts/auth.py

   # 然后重试目标命令
   projectmgt --json project list
   ```

### 认证状态判断

| 状态             | 说明   | 操作                      |
| ---------------- | ------ | ------------------------- |
| connected: True  | 已认证 | 继续执行目标命令          |
| connected: False | 未认证 | 执行 auth.py 脚本，再重试 |

### 认证脚本

ProjectMGT CLI 技能中包含认证脚本，可自动使用环境变量进行认证：

```bash
# 认证脚本位置
python skills/projectmgt-cli/scripts/auth.py
```

此脚本会自动完成以下操作：

1. 检查当前认证状态
2. 如未认证，使用环境变量 PM_BASE_URL、PM_USERNAME、PM_PASSWORD 进行认证
3. 验证认证成功

**环境变量说明**：

| 变量        | 说明     | 默认值                                                      |
| ----------- | -------- | ----------------------------------------------------------- |
| PM_BASE_URL | API 地址 | http://shangji.dcg-internal-services.dev.dcginner:10003/api |
| PM_USERNAME | 用户名   | admin                                                       |
| PM_PASSWORD | 密码     | 无                                                          |

**使用方式**：

```bash
# 检查认证状态
python skills/projectmgt-cli/scripts/auth.py --check

# 自动认证（如未认证）
python skills/projectmgt-cli/scripts/auth.py
```

---

## 命令总览

| 模块 | 命令                   | 说明         |
| ---- | ---------------------- | ------------ |
| 认证 | `projectmgt auth`      | 认证相关操作 |
| 项目 | `projectmgt project`   | 项目管理     |
| 工时 | `projectmgt worktime`  | 工时查询     |
| 人员 | `projectmgt personnel` | 人员管理     |
| 审批 | `projectmgt approval`  | 审批查询     |
| 商机 | `projectmgt chance`    | 商机查询     |
| 合同 | `projectmgt contract`  | 合同查询     |
| 客户 | `projectmgt customer`  | 客户查询     |
| 报表 | `projectmgt report`    | 报表查询     |

---

## 一、认证模块

### 命令

```bash
# 查看认证状态
projectmgt auth status

# 设置认证信息
projectmgt auth setup --url <API地址> --username <账号> --password <密码>

# 清除认证
projectmgt auth logout
```

### 说明

- 首次使用需先配置 API 服务器地址和账号密码
- 认证信息会保存在本地，重复使用无需重新输入

---

## 二、项目模块

### 项目列表

```bash
# 获取项目列表
projectmgt project list

# 获取项目列表（JSON格式）
projectmgt --json project list

# 分页参数
projectmgt project list -c 1 -s 20

# 按状态筛选
projectmgt project list --status <状态>
```

### 项目详情

```bash
# 获取项目详情
projectmgt project info <project_id>

# JSON 格式
projectmgt --json project info <project_id>
```

---

## 三、工时模块

### 工时列表

```bash
# 获取工时列表
projectmgt worktime list

# JSON 格式
projectmgt --json worktime list

# 限制返回数量
projectmgt worktime list -l 20

# 按项目筛选
projectmgt worktime list -p <project_id>

# 按工时类型筛选 (1=内部工时, 2=外包工时)
projectmgt worktime list -t 1

# 按状态筛选
projectmgt worktime list --status <状态>

# 按日期范围筛选
projectmgt worktime list --start-date 2026-03-01 --end-date 2026-03-31
```

### 工时统计

```bash
# 项目工时统计
projectmgt worktime stat-project

# 供应商工时统计
projectmgt worktime stat-supplier

# 工时汇总
projectmgt worktime total
```

### 工时审批

```bash
# 工时审批列表
projectmgt worktime approval

# 审批进度
projectmgt worktime progress
```

---

## 四、人员模块

### 人员列表

```bash
# 获取人员列表
projectmgt personnel staff

# JSON 格式
projectmgt --json personnel staff

# 分页参数
projectmgt personnel staff -c 1 -s 20
```

### 考勤记录

```bash
# 考勤记录
projectmgt personnel attendance

# JSON 格式
projectmgt --json personnel attendance

# 分页参数
projectmgt personnel attendance -c 1 -s 20

# 按确认状态筛选 (1=已确认, 0=未确认)
projectmgt personnel attendance --confirm 1
```

### 人员工时统计

```bash
# 按项目统计工时
projectmgt personnel stat-project

# 按用户统计工时
projectmgt personnel stat-user
```

---

## 五、审批模块

```bash
# 审批列表
projectmgt approval

# JSON 格式
projectmgt --json approval
```

---

## 六、商机模块

```bash
# 商机列表
projectmgt chance list

# JSON 格式
projectmgt --json chance list
```

---

## 七、合同模块

```bash
# 合同列表
projectmgt contract list

# JSON 格式
projectmgt --json contract list
```

---

## 八、客户模块

```bash
# 客户列表
projectmgt customer list

# JSON 格式
projectmgt --json customer list
```

---

## 九、报表模块

```bash
# 报表查询
projectmgt report

# JSON 格式
projectmgt --json report
```

---

## 通用参数

### 输出控制

| 参数              | 说明           |
| ----------------- | -------------- |
| `--json`          | 输出 JSON 格式 |
| `-c <页码>`       | 当前页码       |
| `-s <数量>`       | 每页数量       |
| `--status <状态>` | 按状态筛选     |
| `--help`          | 查看帮助信息   |

---

## 使用示例

### 示例1：获取项目列表

```bash
# 检查认证
projectmgt auth status

# 获取项目列表
projectmgt --json project list
```

### 示例2：查询工时数据

```bash
# 工时列表
projectmgt --json worktime list

# 项目工时统计
projectmgt --json worktime stat-project
```

### 示例3：查询人员工时

```bash
# 按用户统计工时
projectmgt --json personnel stat-user
```

### 示例4：查询考勤记录

```bash
# 考勤记录
projectmgt --json personnel attendance
```

---

## 常见问题

### Q: 命令执行报错 "未认证"

```bash
# 解决方案：执行认证脚本（需设置环境变量 PM_BASE_URL, PM_USERNAME, PM_PASSWORD）
python skills/projectmgt-cli/scripts/auth.py
```

### Q: 输出结果太多，如何分页？

```bash
# 使用 -c 和 -s 参数分页
projectmgt project list -c 1 -s 20
```

### Q: 如何查看所有可用命令？

```bash
projectmgt --help
```

### Q: 如何查看某个模块的帮助？

```bash
projectmgt project --help
projectmgt worktime --help
```
