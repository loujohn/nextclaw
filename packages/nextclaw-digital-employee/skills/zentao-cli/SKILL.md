---
name: zentao-cli
name_zh: 禅道基础工具
description: "禅道项目管理系统的命令行工具使用指南，支持项目、执行/迭代、任务、Bug、产品、团队等模块的查询操作。当需要从禅道获取项目数据、任务列表、Bug 统计或团队信息时使用。"
metadata:
  nextclaw:
    emoji: "🛠️"
    category: "project-management"
---

# 禅道基础工具

禅道基础工具（zentaopms）命令行工具的使用指南，支持项目、执行、任务、Bug 等数据的查询操作。

## 快速开始

### 使用前必读

**每次使用CLI命令前，必须先检查认证状态。**

如果返回401未认证错误，必须先进行认证才能继续操作。

### 认证配置

> ⚠️ **注意**：密码中如有特殊字符（如 `$`、`&`、`*` 等），必须用单引号 `''` 包裹，否则会被 shell 解析导致认证失败。

```bash
# 检查认证状态
zentaopms auth status

# 设置认证（URL需包含协议，如 https://xxx.com）
zentaopms auth setup --url <禅道地址> --username <账号> --password '<密码>'
```

### 输出格式

- 默认输出为人类可读格式
- 使用 `--json` 参数获取 JSON 格式，便于程序解析
- 使用 `-l <数量>` 参数限制返回结果数量

---

## 使用流程

### 标准流程

1. **检查认证状态**

   ```bash
   zentaopms auth status
   ```

2. **执行目标命令**

   ```bash
   zentaopms --json project list
   ```

3. **如果返回401未认证**

   ```bash
   # 调用认证脚本
   python skills/zentao-cli/scripts/auth.py

   # 然后重试目标命令
   zentaopms --json project list
   ```

### 认证状态判断

| 状态码 | 说明   | 操作                 |
| ------ | ------ | -------------------- |
| 200    | 已认证 | 继续执行目标命令     |
| 401    | 未认证 | 调用认证脚本，再重试 |

### 认证脚本

禅道基础工具中包含认证脚本，可自动使用预设的禅道地址、账号、密码进行认证：

```bash
# 认证脚本位置
python skills/zentao-cli/scripts/auth.py
```

此脚本会自动完成以下操作：

1. 检查当前认证状态
2. 如未认证，使用预设的禅道地址、账号、密码进行认证
3. 验证认证成功

**使用方式**：

```bash
# 检查认证状态
python skills/zentao-cli/scripts/auth.py --check

# 自动认证（如未认证）
python skills/zentao-cli/scripts/auth.py
```

---

## 命令总览

| 模块   | 命令                  | 说明          |
| ------ | --------------------- | ------------- |
| 认证   | `zentaopms auth`      | 认证相关操作  |
| 项目集 | `zentaopms program`   | 项目集管理    |
| 项目   | `zentaopms project`   | 项目管理      |
| 执行   | `zentaopms execution` | 迭代/执行管理 |
| 任务   | `zentaopms task`      | 任务管理      |
| Bug    | `zentaopms bug`       | Bug 管理      |
| 产品   | `zentaopms product`   | 产品管理      |
| 用户   | `zentaopms user`      | 用户管理      |

---

## 一、认证模块

### 命令

```bash
# 查看认证状态
zentaopms auth status

# 设置认证信息
zentaopms auth setup --url <禅道地址> --username <账号> --password '<密码>'

# 清除认证
zentaopms auth clear
```

### 说明

- 首次使用需先配置禅道服务器地址和账号密码
- 认证信息会保存在本地，重复使用无需重新输入

---

## 二、项目集模块（Program）

### 项目集列表

```bash
# 获取项目集列表
zentaopms program list

# 获取项目集列表（JSON格式）
zentaopms --json program list

# 限制返回数量
zentaopms program list -l 10

# 按状态筛选（wait/doing）
zentaopms program list --status doing
```

### 项目集详情

```bash
# 获取项目集详情
zentaopms program info <program_id>

# JSON 格式
zentaopms --json program info <program_id>
```

### 项目集下的项目列表

```bash
# 获取项目集下的项目列表
zentaopms program projects -p <program_id>

# JSON 格式
zentaopms --json program projects -p <program_id>
```

### 返回字段说明

| 字段      | 说明                    |
| --------- | ----------------------- |
| id        | 项目集ID                |
| name      | 项目集名称              |
| type      | 类型（program/project） |
| status    | 状态                    |
| progress  | 进度百分比              |
| PM        | 项目经理                |
| teamCount | 团队成员数              |

---

## 三、项目模块

### 项目列表

```bash
# 获取项目列表
zentaopms project list

# 获取项目列表（JSON格式）
zentaopms --json project list

# 限制返回数量
zentaopms project list -l 10

# 指定产品获取项目列表
zentaopms project list --product <product_id>
```

### 项目详情

```bash
# 获取项目详情
zentaopms project info <project_id>

# JSON 格式
zentaopms --json project info <project_id>
```

### 返回字段说明

| 字段           | 说明       |
| -------------- | ---------- |
| id             | 项目ID     |
| name           | 项目名称   |
| code           | 项目代号   |
| status         | 项目状态   |
| begin          | 开始日期   |
| end            | 结束日期   |
| manager        | 项目经理   |
| totalHours     | 总工时     |
| consumedHours  | 已消耗工时 |
| remainingHours | 剩余工时   |

### 项目工时查询

```bash
# 获取项目工时统计（总体和按执行）
zentaopms project hours <project_id>

# JSON 格式
zentaopms --json project hours <project_id>
```

### 成员工时查询

```bash
# 获取项目成员工时统计
zentaopms project member-hours <project_id>

# JSON 格式
zentaopms --json project member-hours <project_id>
```

### 工时返回字段说明

| 字段                 | 说明          |
| -------------------- | ------------- |
| 预估                 | 预估工时      |
| 已消耗               | 已消耗工时    |
| 剩余                 | 剩余工时      |
| 执行数               | 执行/迭代数量 |
| 总预估/总消耗/总剩余 | 汇总工时      |

---

## 四、执行模块（迭代）

### 执行列表

```bash
# 获取项目的执行列表
zentaopms execution list -p <project_id>

# JSON 格式
zentaopms --json execution list -p <project_id>

# 限制返回数量
zentaopms execution list -p <project_id> -l 5

# 按状态筛选（wait/done/doing）
zentaopms execution list -p <project_id> --status doing
```

### 执行详情

```bash
# 获取执行详情
zentaopms execution info <execution_id>

# JSON 格式
zentaopms --json execution info <execution_id>
```

### 返回字段说明

| 字段          | 说明                    |
| ------------- | ----------------------- |
| id            | 执行ID                  |
| name          | 执行名称                |
| status        | 状态（wait/done/doing） |
| begin         | 开始日期                |
| end           | 结束日期                |
| project       | 所属项目ID              |
| totalHours    | 总工时                  |
| consumedHours | 已消耗工时              |
| progress      | 进度百分比              |

---

## 四、执行模块（迭代）

### 执行列表

```bash
# 获取项目的执行列表
zentaopms execution list -p <project_id>

# JSON 格式
zentaopms --json execution list -p <project_id>

# 限制返回数量
zentaopms execution list -p <project_id> -l 5

# 按状态筛选（wait/done/doing）
zentaopms execution list -p <project_id> --status doing
```

### 执行详情

```bash
# 获取执行详情
zentaopms execution info <execution_id>

# JSON 格式
zentaopms --json execution info <execution_id>
```

### 返回字段说明

| 字段          | 说明                    |
| ------------- | ----------------------- |
| id            | 执行ID                  |
| name          | 执行名称                |
| status        | 状态（wait/done/doing） |
| begin         | 开始日期                |
| end           | 结束日期                |
| project       | 所属项目ID              |
| totalHours    | 总工时                  |
| consumedHours | 已消耗工时              |
| progress      | 进度百分比              |

---

## 五、任务模块

### 任务列表

```bash
# 获取执行下的任务列表
zentaopms task list -e <execution_id>

# 获取项目下的所有任务
zentaopms task list -p <project_id>

# JSON 格式
zentaopms --json task list -e <execution_id>

# 限制返回数量
zentaopms task list -e <execution_id> -l 20

# 按状态筛选（wait/doing/done/cancel/closed）
zentaopms task list -e <execution_id> --status doing

# 按指派人筛选
zentaopms task list -e <execution_id> --assignedTo <username>
```

### 任务详情

```bash
# 获取任务详情
zentaopms task info <task_id>

# JSON 格式
zentaopms --json task info <task_id>
```

### 返回字段说明

| 字段       | 说明       |
| ---------- | ---------- |
| id         | 任务ID     |
| name       | 任务名称   |
| status     | 状态       |
| execution  | 所属执行ID |
| project    | 所属项目ID |
| assignedTo | 指派人     |
| estimate   | 预计工时   |
| consumed   | 已消耗工时 |
| left       | 剩余工时   |
| deadline   | 截止日期   |
| priority   | 优先级     |
| story      | 关联需求ID |

---

## 六、Bug 模块

### Bug 列表

```bash
# 获取 Bug 列表（可指定项目或产品）
zentaopms bug list -p <project_id>

# 获取执行相关的 Bug
zentaopms bug list -e <execution_id>

# JSON 格式
zentaopms --json bug list -p <project_id>

# 按状态筛选（active/resolved/closed）
zentaopms bug list -p <project_id> --status active

# 按严重程度筛选
zentaopms bug list -p <project_id> --severity 1
```

### Bug 详情

```bash
# 获取 Bug 详情
zentaopms bug info <bug_id>

# JSON 格式
zentaopms --json bug info <bug_id>
```

### 返回字段说明

| 字段       | 说明     |
| ---------- | -------- |
| id         | Bug ID   |
| title      | Bug 标题 |
| status     | 状态     |
| severity   | 严重程度 |
| priority   | 优先级   |
| project    | 所属项目 |
| execution  | 所属执行 |
| assignedTo | 指派人   |
| openedBy   | 创建人   |
| resolvedBy | 解决人   |
| resolution | 解决方案 |

---

## 七、产品模块

### 产品列表

```bash
# 获取产品列表
zentaopms product list

# JSON 格式
zentaopms --json product list

# 限制数量
zentaopms product list -l 10
```

### 产品详情

```bash
# 获取产品详情
zentaopms product info <product_id>

# JSON 格式
zentaopms --json product info <product_id>
```

### 需求列表

```bash
# 获取产品的需求列表
zentaopms story list --product <product_id>

# JSON 格式
zentaopms --json story list --product <product_id>

# 按状态筛选
zentaopms story list --product <product_id> --status active
```

---

## 八、团队模块

### 团队成员

```bash
# 获取项目团队成员列表
zentaopms team list -p <project_id>

# JSON 格式
zentaopms --json team list -p <project_id>
```

### 返回字段说明

| 字段       | 说明     |
| ---------- | -------- |
| id         | 成员ID   |
| account    | 用户账号 |
| role       | 角色     |
| team       | 团队角色 |
| hours      | 每日工时 |
| joinedDate | 加入日期 |

---

## 九、通用参数

### 输出控制

| 参数              | 说明             |
| ----------------- | ---------------- |
| `--json`          | 输出 JSON 格式   |
| `-l <数量>`       | 限制返回结果数量 |
| `--status <状态>` | 按状态筛选       |
| `--help`          | 查看帮助信息     |

### 状态值参考

| 模块 | 状态值                           |
| ---- | -------------------------------- |
| 项目 | wait/doing/done/suspended/closed |
| 执行 | wait/doing/done                  |
| 任务 | wait/doing/done/cancel/closed    |
| Bug  | active/resolved/closed           |
| 需求 | draft/active/closed              |

---

## 使用示例

### 示例1：获取进行中项目列表

```bash
# 检查认证
zentaopms auth status

# 获取项目列表，找到进行中的项目
zentaopms --json project list
```

### 示例2：查看某项目的当前迭代

```bash
# 获取项目ID为1的执行列表
zentaopms --json execution list -p 1

# 筛选进行中的迭代
zentaopms --json execution list -p 1 --status doing
```

### 示例3：查看某执行的任务进度

```bash
# 执行ID为10的任务列表
zentaopms --json task list -e 10

# 筛选进行中的任务
zentaopms --json task list -e 10 --status doing

# 筛选指派给自己的任务
zentaopms --json task list -e 10 --assignedTo <your_account>
```

### 示例4：统计项目Bug情况

```bash
# 项目ID为1的所有Bug
zentaopms --json bug list -p 1

# 统计各状态数量
zentaopms --json bug list -p 1 --status active
zentaopms --json bug list -p 1 --status resolved
```

---

## 常见问题

### Q: 命令执行报错 "未认证"

```bash
# 解决方案：先进行认证设置
zentaopms auth setup --url https://your-zentao.com --username your-account --password 'your-password'
```

### Q: 输出结果太多，如何只获取前几条？

```bash
# 使用 -l 参数限制数量
zentaopms project list -l 5
```

### Q: 如何查看所有可用命令？

```bash
zentaopms --help
```

### Q: 如何查看某个模块的帮助？

```bash
zentaopms project --help
zentaopms task --help
```

### Q: 连接HTTPS禅道服务器时报错 SSL/TLS 证书问题

```bash
# 方案一：设置环境变量跳过SSL验证（不推荐用于生产环境）
set NODE_TLS_REJECT_UNAUTHORIZED=0
zentaopms auth setup --url https://your-zentao.com --username your-account --password 'your-password'

# 方案二：Windows系统设置持久环境变量
setx NODE_TLS_REJECT_UNAUTHORIZED=0
```

### Q: 证书自签名或证书链问题

```bash
# 如果禅道使用自签名证书，可通过设置CA证书解决
set NODE_EXTRA_CA_CERTS=/path/to/ca-cert.pem
zentaopms auth setup --url https://your-zentao.com --username your-account --password 'your-password'
```
