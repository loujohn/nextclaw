---
name: employee-query
name_zh: 人员查询
version: 1.0.1
description: "查询公司员工信息，包括部门树、公司领导、部门负责人等"
metadata:
  nextclaw:
    emoji: "👥"
    category: "project-management"
---

# 人员查询

查询公司员工信息，根据角色判断领导级别。

## 功能

| 功能 | 说明 |
|------|------|
| 查询部门树 | 显示公司部门组织结构（树形结构） |
| 查询公司领导 | 角色为一级管理员的员工（高管/领导） |
| 查询部门负责人 | 角色为二级管理员的员工（部门经理） |
| 查询各部门负责人 | 按部门分组显示所有部门负责人 |
| 查询某部门所有人员 | 查询指定部门下的所有人员 |
| 查询某部门负责人 | 查询指定部门的负责人（一级/二级管理员） |
| 综合搜索 | 按姓名/用户名/手机号模糊搜索 |
| 组合查询 | 支持多条件组合查询 |

## 使用方法

```bash
# 查询部门树（树形结构）
python scripts/employee-query.py --query-depts

# 查询公司领导（一级管理员/高管）
python scripts/employee-query.py --query-leaders

# 查询部门负责人（二级管理员/部门经理）
python scripts/employee-query.py --query-dept-managers

# 查询各部门负责人（按部门分组）
python scripts/employee-query.py --query-each-dept-manager

# 综合搜索（姓名/用户名/手机号）
python scripts/employee-query.py --query-users "张三"

# 查询某部门所有人员
python scripts/employee-query.py --dept-id "1787377767628632065"

# 查询某部门负责人（一级+二级管理员）
python scripts/employee-query.py --dept-manager "1787377767628632065"

# 按手机号查询
python scripts/employee-query.py --phone "13800138000"
```

## 角色说明

通过角色名称（`roleName`）判断，不依赖 `roleId`（跨环境稳定）：

| roleName | 角色级别 | 说明 |
|----------|---------|------|
| 一级管理员 | 公司领导 | 公司高管/决策层 |
| 二级管理员 | 部门负责人 | 部门经理/团队负责人 |

## 示例输出

### 查询公司领导

```
共找到 3 个用户：

   1. 张三 | 用户名：zhangsan | 手机：138xxxx8888 | 部门：总经理办公室 【公司领导】
   2. 李四 | 用户名：lisi | 手机：138xxxx8889 | 部门：董事会 【公司领导】
```

### 查询部门树

```
部门结构：

总经办（ID: 1787377767628632065）
├── 综合管理部（ID: 2）
│   ├── 团队 1（ID: 1787401268125974530）
│   └── 团队 2（ID: 1787405483263062017）
├── 事业一部（ID: 3）
│   └── 团队 4（ID: 1787406542656172034）
└── 技术开发部（ID: 4）
    └── 团队 7（ID: 1787407296188051457）
```

### 查询部门负责人

```
各部门负责人：

【总经办】
  - 张三（用户名：zhangsan，手机：138xxxx8888）
  - 李四（用户名：lisi，手机：138xxxx8889）

【技术研发部】
  - 王五（用户名：wangwu，手机：138xxxx8890）
```

### 综合搜索

```bash
# 按姓名搜索
python employee-query.py --query-users "张三"

# 按部门查询
python employee-query.py --dept-id "1787377767628632065"

# 组合查询
python employee-query.py --query-users "" --dept-id "1787377767628632065"
```
共找到 3 个用户：

1. 张三（用户名: zhangsan，手机: 138xxxx8888，部门: 总经理办公室，角色: 一级管理员）（一级管理员/公司领导）
2. 李四（用户名: lisi，手机: 138xxxx8889，部门: 董事会，角色: 一级管理员）（一级管理员/公司领导）
```

### 查询部门树

```
部门结构：

总经理办公室（ID: 1）
  技术研发部（ID: 2）
    前端组（ID: 3）
    后端组（ID: 4）
  运营部（ID: 5）
    市场组（ID: 6）
    客服组（ID: 7）
```
