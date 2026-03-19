# v0.13.74 — Cron 下次运行时间未更新修复

## 迭代完成说明

### 问题描述

通过 Cron 表达式设置的定时任务（如"每天 11:00–12:00 间每隔 20 分钟执行"）在自动执行后，
UI 界面显示的**"下次运行时间"始终停留在初始值**，未随每次执行自动推进。

### 根因分析

排查发现存在**两个独立但协同导致问题**的 bug：

#### Bug 1 — UI 层通知缺失（nextclaw-ui 路径）

`CronService` 自动执行任务（`onTimer()`）后，内存和磁盘里的 `nextRunAtMs` 已正确更新，
但没有任何机制通知前端刷新。具体表现：

- `useCronJobs` 只有 `staleTime: 10_000`，无 `refetchInterval`，不会主动轮询
- WebSocket 的 `config.updated` 处理器不响应 cron 变更
- 定时器内部触发的执行完全静默，前端永远拿不到新值

#### Bug 2 — DB 层 nextRunAt 从未同步（数字员工平台路径，根本原因）

`AutomationService.upsertSchedule()` 在创建任务时**一次性**将 `nextRunAt` 写入数据库，
此后 `CronService` 每次自动执行只更新自身内存/文件，**从不回写数据库**。

Dashboard 和预约列表读的是 `scheduleRepo.nextRunAt`（数据库字段），
因此无论 CronService 内部状态如何更新，界面始终展示创建时的初始值。

### 修复方案

**修复链路：任务执行 → nextRunAtMs 更新 → 通知所有上游层**

```
CronService.onTimer()
  → executeJob() 更新 nextRunAtMs（内存 + 磁盘）
  → saveStore()
  → onBatchComplete(executedJobs)            ← 新增：携带更新后的 jobs
       ├─ (nextclaw-ui 路径)
       │    WebSocket push "config.updated:cron"
       │    → 前端 invalidateQueries(['cron']) → 立即拉取最新数据
       │    + useCronJobs 增加 refetchInterval: 30_000 兜底
       └─ (digital-employee 路径)
            scheduleRepo.patchNextRunAt()     ← 新增：写回 DB
```

### 改动文件清单

| 文件 | 变更说明 |
|------|----------|
| `packages/nextclaw-core/src/cron/service.ts` | `onBatchComplete` 回调签名改为 `(executedJobs: CronJob[]) => void`；在 `onTimer()` 中传入已执行的 jobs |
| `packages/nextclaw-core/src/index.ts` | 导出 `CronJob`、`CronSchedule`、`CronJobState` 类型 |
| `packages/nextclaw-digital-employee/server/repositories/employee-schedule-repository.ts` | 新增 `patchNextRunAt(employeeId, nextRunAt)` 轻量更新方法 |
| `packages/nextclaw-digital-employee/server/services/automation-service.ts` | 注册 `onBatchComplete`；执行后异步调用 `syncNextRunForJobs()` 把新 `nextRunAtMs` 写回 DB |
| `packages/nextclaw/src/cli/commands/service.ts` | `onBatchComplete` 注册更新参数签名；推 WebSocket 事件 |
| `packages/nextclaw-ui/src/hooks/useWebSocket.ts` | `config.updated` 处理中增加 `path === 'cron'` 分支，触发 `invalidateQueries(['cron'])` |
| `packages/nextclaw-ui/src/hooks/useConfig.ts` | `useCronJobs` 增加 `refetchInterval: 30_000` 轮询兜底 |
| `packages/nextclaw-core/src/cron/service.test.ts` | 新增 4 个回归测试 |
| `packages/nextclaw-digital-employee/tests/automation-service.test.ts` | 新增 3 个回归测试（数据库同步路径） |

---

## 测试 / 验证 / 验收方式

### 单元测试

```bash
# CronService 回归测试（21 个，全通过）
cd packages/nextclaw-core
pnpm exec vitest run src/cron/service.test.ts

# AutomationService 回归测试（12 个，全通过）
cd packages/nextclaw-digital-employee
pnpm exec vitest run tests/automation-service.test.ts
```

#### 新增测试用例说明

**`CronService - nextRunAtMs advances after execution`（4 个）**

| 测试名 | 验收点 |
|--------|--------|
| `cron expr: nextRunAtMs advances to next slot after timer fires` | 11:20 执行后 nextRunAtMs 变为 11:40，而非停留在 11:20 |
| `every mode: nextRunAtMs increments by interval after each automatic fire` | interval 任务每次执行后 nextRunAtMs 单调递增 |
| `onBatchComplete is called with the executed jobs (with updated state)` | 回调接收到的 jobs 中 nextRunAtMs 已是更新后的值 |
| `nextRunAtMs persists to disk after automatic execution and reloads correctly` | 重启后从磁盘读出的是执行后的 nextRunAtMs，而非初始值 |

**`automation service - nextRunAt syncs to DB after automatic execution`（3 个）**

| 测试名 | 验收点 |
|--------|--------|
| `scheduleRepo.nextRunAt updates after every-interval job fires automatically` | every 模式自动执行后 DB 字段更新 |
| `scheduleRepo.nextRunAt updates after cron-expr job fires automatically` | cron 模式自动执行后 DB 字段更新 |
| `scheduleRepo.nextRunAt does NOT update on manual runNow` | 手动触发不影响 nextRunAt（后续仍按计划时间） |

### 类型检查

```bash
pnpm --filter @nextclaw/core tsc --noEmit
pnpm --filter nextclaw tsc --noEmit
cd packages/nextclaw-digital-employee && pnpm exec tsc --noEmit
```

---

## 发布 / 部署方式

本次为纯逻辑修复，无数据库 schema 变更，无破坏性 API 改动。

- 前端：重新构建 `@nextclaw/ui` 并更新静态资源
- 后端：重新构建 `@nextclaw/core` → 依赖方自动获取更新类型与实现
- 平台：`nextclaw-digital-employee` 服务重启即生效

---

## 用户 / 产品视角验收步骤

1. 创建一条 Cron 表达式定时任务，例如"每天 11:00–12:00 间每 20 分钟"
2. 在 UI 任务列表记录当前显示的"下次运行时间"（例如 11:20）
3. 等待或手动推进时间至 11:20，任务自动执行
4. **验收点**：任务执行后，"下次运行时间"应自动更新为 11:40，而不是停留在 11:20
5. 同样验证 Dashboard 中对应员工卡片的"下次运行"字段同步更新
6. 等待下一个时间点（11:40）执行后，字段再次推进到 12:00（或次日 11:00，视表达式而定）
