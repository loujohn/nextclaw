# v0.13.71 · 组织架构树管理功能

## 迭代完成说明

本次迭代在 `packages/nextclaw-digital-employee` 模块内完整实现了**组织架构树管理**功能，涵盖后端数据层、API 层和前端 UI 层，具体改动如下：

### 后端变更

| 文件 | 变更说明 |
|---|---|
| `server/db/schema.ts` | 新增 `departments` 表名常量、`DepartmentRecord` 类型；`EmployeeRecord` 新增 `department_id` 字段 |
| `server/db/knex.ts` | 新增 `createDepartmentsTable()`、`migrateEmployeesAddDepartmentId()` 迁移函数；`ensurePlatformDatabase()` 同步执行 |
| `server/repositories/department-repository.ts` | **新增** — `DepartmentRepository` 提供 `create/getById/list/updateById/deleteById/countEmployees/getAllDescendantIds` |
| `server/repositories/employee-repository.ts` | `CreateEmployeeInput`、`UpdateEmployeeInput`、`EmployeeView` 均新增 `departmentId` 字段；`list()` 支持 `{ departmentId }` 过滤参数 |
| `server/runtime/platform-context.ts` | `PlatformContext` 类型与工厂函数均添加 `departmentRepo: DepartmentRepository` |
| `server/api/departments/index.get.ts` | **新增** — `GET /api/departments` 返回所有部门列表 |
| `server/api/departments/index.post.ts` | **新增** — `POST /api/departments` 创建部门 |
| `server/api/departments/[id].patch.ts` | **新增** — `PATCH /api/departments/:id` 更新部门（含循环层级检测） |
| `server/api/departments/[id].delete.ts` | **新增** — `DELETE /api/departments/:id` 删除部门（含员工占用保护） |
| `server/api/employees/index.get.ts` | 支持 `?departmentId=` 查询参数按部门过滤 |
| `server/api/employees/index.post.ts` | Body 支持 `departmentId` 创建时赋值 |
| `server/api/employees/[id].patch.ts` | Body 支持 `departmentId` 修改部门归属 |

### 前端变更

| 文件 | 变更说明 |
|---|---|
| `app/components/DepartmentTree.vue` | **新增** — 组织树根组件：树形展示、新建/编辑/删除弹窗、Toast 通知 |
| `app/components/DepartmentTreeNode.vue` | **新增** — 树节点递归组件：展开/折叠、hover 操作按钮 |
| `app/pages/employees/index.vue` | 改造为左右双面板布局；左侧嵌入 `DepartmentTree`；员工卡片展示所属部门 badge；新建/编辑表单新增"所属部门"下拉选择器 |

### 核心业务规则

- **删除保护**：删除部门前遍历其所有子孙部门，若任意层级存在员工则返回 `409` 错误，阻止删除
- **循环层级防护**：修改父级时检测目标是否为自身或自身的后代，防止无限循环
- **初始数据迁移**：通过 `ALTER TABLE` 对存量 employees 添加 `department_id` 列，不影响现有数据

---

## 测试 / 验证 / 验收方式

### 自动化测试（已通过）

```bash
cd packages/nextclaw-digital-employee
pnpm test -- --run tests/department.test.ts
```

**12 个测试用例全部通过**，涵盖：

| 测试套件 | 测试项 |
|---|---|
| DepartmentRepository - CRUD | 创建/查询/排序/树形嵌套/更新/删除 |
| DepartmentRepository - 删除保护 | 空部门计数=0、有员工时计数正确 |
| EmployeeRepository - departmentId 支持 | 带部门创建、按部门过滤、修改归属 |
| DepartmentRepository - 树形结构辅助 | 多层后代查询、叶子节点返回空 |

全量回归（43 测试，无失败）：

```bash
pnpm test -- --run
# Test Files  7 passed (7)
# Tests  43 passed (43)
```

### UI 冒烟验证（手动）

1. 启动 `@nextclaw/digital-employee`，访问 `/employees`
2. **左侧组织树**："新增"创建根部门 → 鼠标悬停节点 → 点击"+"添加子部门 → 编辑/删除验证
3. **员工归属**：点击"创建员工" → 在"所属部门"选择器中选择部门 → 提交
4. **按组织筛选**：点击组织节点 → 右侧只显示该部门员工；点击"全部员工"返回全量
5. **删除保护**：对有员工的部门点击删除 → 弹窗应提示"该部门下仍有员工"，操作被阻断

---

## 发布 / 部署方式

本次为 `packages/nextclaw-digital-employee` 内部功能迭代，属于 Nuxt 应用内的变更，**不涉及独立 NPM 包发布**。

- 部署方式遵循原有 `nextclaw-digital-employee` 的启动流程
- 数据库迁移在服务首次启动时自动执行（`ensurePlatformDatabase` 已包含新迁移步骤）
- 无需手动执行任何 migration 脚本

---

## 用户 / 产品视角的验收步骤

1. **组织架构管理**
   - [ ] 可在员工中心左侧面板新建根级部门（名称 + 描述）
   - [ ] 可在已有部门节点下创建子部门，形成多层树
   - [ ] 鼠标悬停节点后可编辑名称/描述
   - [ ] 空部门可被成功删除；有员工的部门删除时收到友好错误提示
   - [ ] 折叠/展开树节点正常工作

2. **员工与组织关联**
   - [ ] 新建员工时可选择"所属部门"
   - [ ] 编辑员工时可修改归属部门（含移除）
   - [ ] 员工卡片底部显示所属部门名称徽标

3. **按组织查看员工**
   - [ ] 点击左侧组织节点，右侧员工列表仅显示该部门员工
   - [ ] 点击"全部员工"恢复显示所有员工
   - [ ] 搜索框在部门过滤与全量模式下均正常工作

4. **UI 风格一致**
   - [ ] 组织树面板与员工卡片使用相同的设计令牌（颜色、间距、字号）
   - [ ] 所有弹窗（新建/编辑/删除确认）与现有系统风格一致
   - [ ] Toast 通知样式与员工管理功能保持统一
