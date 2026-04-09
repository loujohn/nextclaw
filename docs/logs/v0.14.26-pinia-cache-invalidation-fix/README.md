# v0.14.26 — Pinia Store 缓存失效修复

## 迭代完成说明

### 根因

三个 Pinia store（employees / skills / departments）在 `useLazyFetch` 中使用了 `getCachedData: (k) => useNuxtData(k).data.value ?? undefined`。此回调在 `refresh()` 调用时返回 Nuxt Data Layer 中的旧快照，导致 `useLazyFetch` 认为数据仍然新鲜而跳过网络请求。

附带问题：
- `useEmployeeCrud` 中的 `refreshNuxtData("/api/dashboard")` 等调用无效（dashboard 的 `useLazyFetch` 无显式 key，自动生成的 key ≠ URL 字符串）
- 技能分类页搜索关键词跨分类残留（Vue Router 组件复用，本地 ref 未重置）
- 技能启停失败无用户反馈（`toggleError` 未在模板中渲染）
- employees store 使用 `useAsyncData` 而其他 store 使用 `useLazyFetch`，模式不统一

### 改动（6 文件，+28/-22）

| 文件 | 改动 |
|------|------|
| `app/stores/employees.ts` | `useAsyncData` → `useLazyFetch`，与 skills/departments 统一 |
| `app/stores/skills.ts` | 移除 `getCachedData` + 新增 `toggleSkill` action |
| `app/stores/departments.ts` | 移除 `getCachedData` |
| `app/composables/useEmployeeCrud.ts` | 移除无效 `refreshNuxtData` 调用 |
| `app/pages/skills/[category].vue` | 添加 `toggleError` 展示 + `watch(categorySlug)` 重置 filter |
| `app/pages/employees/index.vue` | 移除 `cachedDataOption` helper 及其 `getCachedData` 用法 |

### 统一 Store 模式

三个 store 统一为：
- 数据获取：`useLazyFetch` + 显式 `key: "store-<name>"`
- 无 `getCachedData`
- 业务 mutation 在 store action 内完成（`$fetch` + `refresh()`）

## 测试/验证/验收方式

| 项目 | 结果 |
|------|------|
| Tests | 184/184 passed |
| ESLint | passed |
| TypeScript | passed |
| Build | passed |
| `getCachedData` 全局扫描 | 0 处残留 |
| `useNuxtData` 全局扫描 | 0 处残留 |

## 发布/部署方式

前端重新构建部署即可，无后端/数据库变更。

## 用户/产品视角的验收步骤

1. **技能启停刷新**：进入技能中心 → 选择任意分类 → 点击"启用/停用" → 确认 UI 立即反映新状态
2. **技能启停错误反馈**：在网络断开时尝试启停 → 确认出现红色错误提示
3. **技能分类切换重置**：在分类 A 搜索关键词 → 切换到分类 B → 确认搜索框已清空
4. **员工列表数据新鲜**：创建新员工 → 确认列表立即出现新员工
5. **部门列表数据新鲜**：修改部门后返回列表 → 确认数据已更新
6. **Dashboard 统计**：创建/删除员工后导航到 Dashboard → 确认统计数字正确（30s 内更新或进入时刷新）
