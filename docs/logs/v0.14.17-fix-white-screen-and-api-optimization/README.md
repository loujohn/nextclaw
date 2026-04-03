# v0.14.17 — 修复切换白屏 + API 响应优化 + 缓存策略

## 迭代完成说明

### 问题背景

线上环境切换左侧导航 Tab（组织架构、工作中心、技能中心）时出现白屏，且存在重复 API 请求和 `/api/employees` 响应数据量过大的问题。

### 改动内容

#### 1. 白屏根因修复

- **Layout 层**：移除 `<Transition name="page" mode="out-in">` 中的 `mode="out-in"`。该模式要求旧页面完全退出后新页面才进入，而 `await useFetch()` 阻塞了新页面渲染，导致中间出现空白。
- **全局 useFetch → useLazyFetch**：将 12 个页面共计 20+ 处 `await useFetch()` 改为 `useLazyFetch()`，页面不再因数据请求阻塞渲染。
- **骨架屏兜底**：在 `employees/index.vue`、`skills/index.vue`、`employees/[id].vue` 等页面添加 `<PageSkeleton>` 组件作为数据加载时的 UI 占位。

#### 2. API 响应体瘦身

- `/api/employees` 列表接口裁剪冗余字段：
  - 去除 `systemPrompt`（列表卡片不需要）
  - `skills` 仅返回 `skillName`（去除 config 等详细数据）
  - `latestRun` 仅返回 `status` 和 `finishedAt`（去除 summary、工具调用日志等大体积数据）

#### 3. 缓存优化

- **客户端（stale-while-revalidate）**：`employees/index.vue` 通过 `getCachedData` + `useNuxtData` 实现 Nuxt payload 缓存，切回已访问页面时瞬间显示旧数据并后台刷新。
- **服务端（human-employees）**：`/api/org/human-employees` 新增 5 分钟 TTL 内存缓存，组织同步时自动失效（`sync-trigger.post.ts` 和 `sync.post.ts` 调用 `invalidateHumanEmployeeCache()`）。

#### 4. 按需加载

- 集成中心页面原本在页面加载时即请求 `/api/employees`，现改为仅在打开钉钉编辑器时按需获取，并缓存结果避免重复请求。

#### 5. 代码优化

- `config.vue` 和 `workspace.vue` 中消除 `null as unknown as string` 类型 hack，改用 `computed URL` + `watch: false, immediate: false` + 手动 watch 模式。
- 合并 `selectedFilename` 的多个重复 watcher 为单个。

### 涉及文件（17 个）

| 文件 | 变更 |
|------|------|
| `app/layouts/default.vue` | 移除 Transition mode |
| `app/composables/useEmployeeDetail.ts` | useFetch → useLazyFetch + 补充 departmentId 类型 |
| `app/pages/employees/index.vue` | useLazyFetch + getCachedData + PageSkeleton |
| `app/pages/dashboard.vue` | useLazyFetch（6 处） |
| `app/pages/skills/index.vue` | useLazyFetch + PageSkeleton |
| `app/pages/skills/[category].vue` | useLazyFetch |
| `app/pages/employees/[id].vue` | useLazyFetch（5 处）+ PageSkeleton |
| `app/pages/employees/[id]/chat.vue` | useLazyFetch（3 处） |
| `app/pages/employees/[id]/config.vue` | useLazyFetch + computed URL 重构 |
| `app/pages/employees/[id]/jobs.vue` | useLazyFetch |
| `app/pages/employees/[id]/runs.vue` | useLazyFetch（2 处） |
| `app/pages/employees/[id]/workspace.vue` | useLazyFetch + computed URL 重构 |
| `app/pages/integrations/index.vue` | 延迟加载 employees + useLazyFetch |
| `server/api/employees/index.get.ts` | 裁剪响应字段 |
| `server/api/org/human-employees.get.ts` | 服务端缓存 |
| `server/api/org/sync-trigger.post.ts` | 缓存失效 |
| `server/api/org/sync.post.ts` | 缓存失效 |

## 测试/验证/验收方式

### 构建验证

```bash
cd packages/nextclaw-digital-employee && npx nuxt build
# ✅ 构建成功
```

### TypeScript 检查

```bash
cd packages/nextclaw-digital-employee && npx nuxt typecheck
# 仅剩 4 个预存错误（LocationQueryValue 3 个 + avatar-utils 1 个），无新增
```

### 冒烟测试

1. 打开线上地址 `http://employee.ai.dev.dcginner:10003/employees`
2. 快速切换「组织架构」→「工作中心」→「技能中心」→「集成中心」Tab
3. 验证：
   - 无白屏，切换时出现骨架屏后正常渲染
   - DevTools Network 面板确认无重复的 `/api/employees` 请求
   - `/api/employees` 响应体不包含 `systemPrompt` 和 `latestRun.summary`

## 发布/部署方式

- 已推送到 `company/main`（commit `02e5312`）
- 由 CI/CD 自动部署到线上环境

## 用户/产品视角的验收步骤

1. 在浏览器中打开数字员工管理平台
2. 依次点击左侧所有 Tab，确认切换流畅、无白屏
3. 进入任意数字员工详情页，确认数据正常显示
4. 打开集成中心 → 点击钉钉配置，确认员工列表正常加载
5. 执行一次组织同步，确认同步后数据及时更新
