# v0.14.3 — 员工自动化摘要：从单任务展示迁移到多任务聚合模型

## 迭代完成说明

### 背景与动机

v0.13.99 引入了员工多定时任务功能（`employee_schedule_jobs` 表），但员工详情页和列表页的状态展示仍停留在单任务时代：
- 员工详情头部的「自动运行」字段绑定的是旧 `employee_schedules`（legacy single schedule），「最近状态」取的是 `recentRuns[0]` 而不区分触发来源（容易把聊天触发误认为自动任务状态）
- 「状态检查」卡中「自动任务 就绪/待配置」是二元状态，无法反映多任务下的健康差异
- 员工列表的健康状态 `resolveHealth` 也使用了 `hasSchedule`（仍指旧单任务）

本次迭代完整从单任务展示语义切换为**多任务聚合摘要语义**，不屏蔽信息，而是升级展示精度。

### 变更文件

| 文件 | 变更内容 |
|------|---------|
| `shared/ui-models.ts` | 新增 `AutomationJobBrief`、`AutomationSummaryView` 类型及 `buildAutomationSummary()` 纯函数 |
| `server/api/employees/[id].get.ts` | 新增并行查询 `employeeScheduleJobRepo`、计算 `automationSummary` 并注入 response；健康字段增加 `jobsCount` / `enabledJobsCount` |
| `server/api/employees/index.get.ts` | 列表接口同步加入 `jobsCount` / `enabledJobsCount`；`hasSchedule` 现在也兼容新 jobs 模型 |
| `app/composables/useEmployeeDetail.ts` | 类型定义新增 `AutomationSummaryView` 及 `automationSummary` 字段；`health` 类型补全 `jobsCount` / `enabledJobsCount` |
| `app/pages/employees/[id].vue` | 头部「自动运行」→「任务调度」（显示任务数量）、「最近状态」→「自动化状态」（显示自动化健康摘要，带色调）；「状态检查」卡「自动任务 就绪/待配置」→「定时任务 · N 个任务 · 运行健康」聚合摘要 |
| `app/pages/employees/index.vue` | `EmployeeResponse` 类型增加 `jobsCount` / `enabledJobsCount`；`resolveHealth()` 使用新字段，新增`全部任务暂停`状态 |
| `tests/ui-models.test.ts` | 新增 6 个 `buildAutomationSummary` 测试用例，覆盖全部状态分支 |

### 核心逻辑：`buildAutomationSummary`

```
输入：jobs[]{enabled, nextRunAt} + recentScheduledRuns[]{status}

输出状态枚举：
  无任务      → tone=slate,   statusLabel="未配置"
  全部失败最近 → tone=danger,  statusLabel="存在失败"
  全部暂停    → tone=amber,   statusLabel="全部暂停"
  部分暂停    → tone=amber,   statusLabel="N 个暂停"
  健康运行    → tone=teal,    statusLabel="运行健康"
```

`nextScheduledRunAt` 取所有**已启用**任务中最早的那个，不混入已暂停任务。

---

## 测试/验证方式

### 单元测试（自动化可验证）

```bash
cd packages/nextclaw-digital-employee
pnpm exec vitest run tests/ui-models.test.ts
```

新增测试覆盖：
- `buildAutomationSummary` — 暂无任务
- `buildAutomationSummary` — 全部启用运行健康
- `buildAutomationSummary` — 最近有失败
- `buildAutomationSummary` — 全部暂停
- `buildAutomationSummary` — 部分暂停（N 个暂停）
- `buildAutomationSummary` — nextRunAt 取最早启用任务

结果：13/13 PASS（含原有 7 个）

### TypeScript 类型检查

```bash
pnpm exec tsc --noEmit
```

本次改动引入的类型错误：0（剩余错误为 `NextclawEngineGateway.ts` / `run-record-repository.ts` 内存量预存问题）

---

## 发布/部署方式

本次为纯功能前端 + API 层变更，无数据库 schema 变更。

1. 更新前端/平台服务：`pnpm build`（数字员工 Nuxt 应用）
2. 重启平台服务进程以加载新 API 路由逻辑

Migration：**不适用**（未改动数据表结构，新接口仅多查 `employee_schedule_jobs` 表，该表在 v0.13.99 已建立）

---

## 用户/产品视角验收步骤

### 员工详情页头部（`/employees/:id`）

1. 打开任意有定时任务的员工详情
2. 头部右侧四列统计区：
   - 「任务调度」列应显示 `N 个任务` 或 `暂无任务`（不再显示 cron 时间表字符串）
   - 「自动化状态」列应显示颜色化的聚合状态（绿色"运行健康"、橙色"部分暂停"等）
3. 对有定时任务的员工：任务调度 ≠「暂无任务」
4. 对无定时任务的员工：自动化状态显示灰色「未配置」

### 员工详情侧边栏「状态检查」卡

1. 「定时任务」条目应显示 `定时任务 · N 个任务 · 运行健康` 格式
2. 图标颜色应与状态色调一致：绿色=健康，橙色=部分暂停/全部暂停，红色=存在失败，灰色=未配置
3. 不再出现「自动任务 就绪」或「自动任务 待配置」旧文案

### 员工列表页（`/employees`）

1. 员工卡片健康标签：
   - 没有任何多任务且没有旧 schedule → 显示「待创建任务」（灰色）
   - 有任务但全部暂停 → 显示「全部任务暂停」（橙色）
   - 有启用任务且无最近失败 → 显示「运行健康」（绿色）
2. 不再出现「待配置任务」旧文案（改为「待创建任务」）
