# v0.13.72 — CronService 三种模式全覆盖测试 + Bug 修复

## 迭代完成说明（改了什么）

### Bug 修复

#### Bug 1：`at` 模式对**过去时间**返回 `null`，导致任务永远不触发

- **根因**：`computeNextRun` 中 `at` 分支写法为 `schedule.atMs > now ? schedule.atMs : null`，
  若 `atMs` 已过期（例如服务重启后恢复任务），`nextRunAtMs` 为 `null`，定时器永远不会 arm，任务卡死。
- **修复**：当 `atMs <= now` 时返回 `now`（立即触发），而非 `null`。
  服务重启后积压的 at 任务会在启动后立刻执行，而不是永久丢失。

#### Bug 2：`cron` 模式 `tz` 字段被完全忽略

- **根因**：类型中虽然定义了 `tz?: string | null`，但调用 `cronParser.parseExpression` 时
  从未将 `tz` 传入选项对象，时区设置完全无效——所有 cron 任务均按运行时本地 OS 时区计算。
- **修复**：当 `schedule.tz` 非空时，将其作为 `tz` 选项传入 `cronParser.parseExpression`。

### 新增测试

文件：[packages/nextclaw-core/src/cron/service.test.ts](../../../packages/nextclaw-core/src/cron/service.test.ts)

共 **17 个用例**，覆盖三种 schedule 模式及公共行为：

| 分组 | 用例数 | 核心覆盖点 |
|---|---|---|
| `at` 模式 | 4 | 未来时间触发、**过去时间立即触发（Bug 1 回归）**、deleteAfterRun 清理、null atMs 不触发 |
| `every` 模式 | 4 | 周期重复触发、禁用后停止触发、磁盘持久化重载、everyMs≤0 不产生 nextRunAt |
| `cron` 模式 | 4 | 正确计算 nextRunAt、**tz 字段生效（Bug 2 回归）**、非法表达式不崩溃、fake timer 触发 |
| 公共行为 | 5 | runJob force 执行、removeJob 删除、status() 正确报告、错误捕获记录 lastStatus=error |

---

## 测试 / 验证 / 验收方式

### 单元测试（CI 可复现）

```bash
# CronService 核心测试（17 个）
cd packages/nextclaw-core && pnpm vitest run

# AutomationService 集成测试（9 个，含 cron/every/heartbeat 三种模式端到端）
cd packages/nextclaw-digital-employee && pnpm vitest run
```

**期望结果**：全部通过，无 skip / fail。

### 回归验证结果（本次执行）

```
nextclaw-core:           Test Files 17 passed  |  Tests 57 passed
nextclaw-digital-employee: Test Files  7 passed  |  Tests 43 passed
```

---

## 发布 / 部署方式

本迭代为**纯逻辑 Bug 修复 + 测试补充**，不涉及 API 变更、数据库迁移或 UI 变更。

- migration：**不适用**（无 DB schema 变更）
- 前端发布：**不适用**（无 UI 变更）
- NPM 发布：按需执行，修复已合并到 `@nextclaw/core` 当前 `main` 分支；
  若需发版，执行 `changeset → version → publish` 流程，涉及包：
  - `@nextclaw/core`（包含 bug 修复）
  - 直接依赖 `@nextclaw/core` 的联动包（`@nextclaw/digital-employee` 等）

---

## 用户 / 产品视角的验收步骤

1. **`at` 模式过期恢复**：创建一个 `atMs` 为过去时间的 one-shot 任务，重启服务后该任务立即执行，
   不再卡死。
2. **`cron` 时区正确**：通过 `nextclaw cron add` 或 UI 创建带 `tz: "Asia/Tokyo"` 的 cron 任务，
   `nextRunAt` 应按东京时区计算，而非按服务器本地时区。
3. **回归无退化**：原有 `every` / `cron` / `heartbeat` 三种模式的所有自动化测试仍 100% 通过。
