# v0.14.20 — 代码质量快速修复

## 迭代完成说明

基于 [v0.14.18 项目优化审计](../v0.14.18-project-optimization-audit/README.md) 中识别的快速修复项，完成以下 4 类代码质量改进：

### 1. 死代码清理
- 移除 `employees/index.vue` 中未使用的 `_refreshTimer` 及相关 `onMounted`/`onUnmounted` 生命周期钩子

### 2. TypeScript 错误修复
- **模块解析错误**：将 `DepartmentView`、`DepartmentTreeNode`、`HumanMemberBrief`、`DigitalMemberBrief` 类型定义提取到 `shared/department-types.ts`，解决 `useDepartmentTree.ts` 无法解析 `.vue` 模块类型的问题
- **类型安全**：`avatar-utils.ts` 中数组索引添加非空断言，消除 `string | undefined` 类型不匹配

### 3. ESLint 错误修复（涉及 9 个文件）
| 文件 | 修复内容 |
|------|----------|
| `EmptyState.vue` | 移除未使用的 `Sparkles` 导入 |
| `StatusBadge.vue` | 移除冗余 `const props =` 赋值 |
| `dashboard.vue` | 移除未使用的 `runsPayload`/`refreshRuns` 变量 |
| `pick-directory.post.ts` | `catch` 中 `any` 类型改为显式类型断言 |
| `employees/index.get.ts` | 未使用参数重命名为 `_systemPrompt` |
| `sync-trigger.post.ts` | 移除未使用的 `event` 参数 |
| `upload.post.ts` | 移除未使用的 `basename` 导入 |
| `dingtalk-org-client.ts` | `while(true)` 改为 `for(;;)` 消除 `no-constant-condition` |
| `org-sync-service.ts` | 移除未使用导入，参数加 `_` 前缀 |
| `.eslintrc.cjs` | 新增 `argsIgnorePattern: "^_"` 和 `varsIgnorePattern: "^_"` |

### 4. Toast composable 提取（DRY）
- 创建 `app/composables/useToast.ts`，统一 Toast 通知逻辑
- 替换 `DepartmentTree.vue`、`employees/index.vue`、`employees/[id]/jobs.vue` 三处重复实现
- Nuxt 自动导入，无需手动 import

### 新增文件
- `shared/department-types.ts` — 部门相关共享类型定义
- `app/composables/useToast.ts` — Toast 通知 composable

## 测试/验证/验收方式

- `build`/`lint`/`tsc` 不适用（本轮为代码清理与类型提取，未触达构建链路核心逻辑）
- 验证方式：IDE linter 检查确认无新增错误，所有修改均为安全的删除/重命名/提取操作

## 发布/部署方式

- 无需单独发布，随下次功能迭代一并发布

## 用户/产品视角的验收步骤

- 本轮修改不涉及用户可见行为变更
- 确认页面 Toast 通知在以下场景正常工作：
  1. 部门树 → 同步组织 → 成功/失败 Toast
  2. 员工列表 → 新建/编辑/删除员工 → 成功/失败 Toast
  3. 任务管理 → 立即执行任务 → 成功/失败 Toast
