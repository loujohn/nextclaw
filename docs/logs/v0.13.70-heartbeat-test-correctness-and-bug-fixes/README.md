# v0.13.70 — heartbeat 测试正确性修复 & 多项实现 bug fix

## 迭代完成说明

### 问题起点

`automation-service.test.ts` 中"重启恢复"测试（第 277 行后）存在**验证性错误**：断言只检查 DB 里能查到 heartbeat 记录，而该记录在重启前就已存在，因此测试无法挡住"恢复逻辑失效但数据库仍有记录"的回归。

---

### 本次修复内容（共 5 项）

#### Fix 1：测试假阳性修复（主要目标）

**文件**：`packages/nextclaw-digital-employee/tests/automation-service.test.ts`

改动：
- 使用 `vi.useFakeTimers()` 控制时间
- 将 `everyMs` 改为 5 秒（适配 fake timer 快速触发）
- 模拟关机改为 `automation1.stop()`（否则 automation1 的 heartbeat timer 仍泄漏）
- 推进 `vi.advanceTimersByTimeAsync(6_000)` 触发新实例的 tick
- 核心断言改为验证 `gateway2` 独有的 reply `"心跳恢复正常"` 出现在 run records

旧断言只能检查"数据没丢"，新断言可以检查"新实例的 timer 真正触发并调用了新 gateway"。

---

#### Fix 2：`AutomationService.stop()` 方法缺失

**文件**：`packages/nextclaw-digital-employee/server/services/automation-service.ts`

新增 `stop()` 方法，统一停止所有注册的 `HeartbeatService` timer + `CronService`，重置 `started` 标志。

原代码没有 stop，测试只能 `cron.stop()`，heartbeat timer 会一直泄漏。

---

#### Fix 3：`runNow()` heartbeat 分支缺失（静默失效 bug）

**文件**：`packages/nextclaw-digital-employee/server/services/automation-service.ts`

原实现：
```typescript
async runNow(employeeId: string): Promise<boolean> {
  const schedule = await this.scheduleRepo.getByEmployeeId(employeeId);
  if (!schedule?.runtimeJobId) return false; // heartbeat 的 runtimeJobId 永远是 null
  return this.cronService.runJob(schedule.runtimeJobId, true);
}
```

heartbeat 调度的 `runtimeJobId` 永远为 `null`，因此 `runNow()` 对 heartbeat 员工永远静默返回 `false`，无法手动触发。

修复后：检查 `scheduleKind === "heartbeat"` 时从 `this.heartbeats` Map 取出实例调用 `hb.triggerNow()`。

---

#### Fix 4：`upsertSchedule()` 对 `enabled: false` heartbeat 仍启动 timer

**文件**：`packages/nextclaw-digital-employee/server/services/automation-service.ts`

原实现无论 `enabled` 取值，都无条件调用 `startHeartbeatForEmployee()`：
```typescript
if (input.scheduleKind === "heartbeat") {
  const intervalS = ...;
  this.startHeartbeatForEmployee(...); // ← 忽略 enabled
  ...
}
```

修复后：仅在 `input.enabled !== false` 时启动 timer。

---

#### Fix 5：`HeartbeatService` 两个低层 bug

**文件**：`packages/nextclaw-core/src/heartbeat/service.ts`

**5a — `start()` 缺少幂等保护**

原始 `start()` 只检查 `!this.enabled`，不检查 `this.running`。若被重复调用（例如通过 `upsertSchedule` 两次配置同一员工），会产生两个 `setInterval` timer，导致 tick 重复触发。

修复：加入 `|| this.running` 短路。

**5b — `tick()` 内 `onHeartbeat` 抛出时变为 unhandled rejection**

原始 `tick()` 直接 `await this.onHeartbeat(...)` 没有 try/catch，`tick()` 又通过 `void this.tick()` 调用，错误变成 unhandled promise rejection，可能导致测试/生产进程报错或重启。

修复：在 `tick()` 内包裹 try/catch，拦截 onHeartbeat 异常，不影响 timer 的持续运行。

---

### 变更文件汇总

| 文件 | 变更内容 |
|------|---------|
| `packages/nextclaw-digital-employee/tests/automation-service.test.ts` | 修复假阳性测试；补充 3 个新测试（runNow 心跳、disabled 心跳、幂等启动） |
| `packages/nextclaw-digital-employee/server/services/automation-service.ts` | 新增 `stop()`；修复 `runNow()` heartbeat 分支；修复 `upsertSchedule()` enabled:false |
| `packages/nextclaw-core/src/heartbeat/service.ts` | `start()` 幂等保护；`tick()` 异常捕获 |

---

## 测试/验证/验收方式

```bash
# 直接运行 automation 测试
pnpm --filter @nextclaw/digital-employee exec vitest run tests/automation-service.test.ts
```

期望输出：`passed=9 failed=0`（原 6 + 新增 3）

---

## 发布/部署方式

- `nextclaw-core` 修改了 `HeartbeatService`（源码层），需同步重新构建
- `nextclaw-digital-employee` 改动为服务层逻辑 + 测试，不影响 API 接口
- 纯内部逻辑修复，无需 DB migration，无需前端发布

```bash
pnpm --filter @nextclaw/core build
pnpm --filter @nextclaw/digital-employee build
```

---

## 用户/产品视角验收步骤

1. 创建一个 heartbeat 类型员工调度
2. 点击「立即运行」按钮 → 应成功触发（原来永远静默失败）
3. 将调度 enabled 设为 false → 心跳不再自动触发
4. 重启 platform 服务 → 已启用的 heartbeat 调度自动恢复，并在下一个间隔触发
5. 多次保存同一员工的 heartbeat 调度 → 不会触发重复执行
