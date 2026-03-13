# v0.13.66 员工字段对应检查 & 定时任务修复

## 迭代完成说明

### 1. 员工新增/编辑字段与 agents 文件对应关系检查

经过全面排查，创建/编辑表单中的所有可编辑字段均与 `.nextclaw-digital-employee/agents/<code>/` 目录下的文件正确对应：

| 表单字段 | 对应文件 | 写入方式 |
|---|---|---|
| `name`（名称） | `IDENTITY.md` Name + `SOUL.md` 标题 | 自动生成 |
| `description`（职责描述） | `IDENTITY.md` Description | 自动生成 |
| `systemPrompt`（角色设定） | `SOUL.md` 正文 | `writeSoulFile()` |
| `userContent`（服务对象） | `USER.md` | 直接写入 |
| `heartbeatContent`（心跳巡检内容） | `HEARTBEAT.md` | 直接写入 |
| `bootContent`（启动任务，高级） | `BOOT.md` | 直接写入 |
| `agentsContent`（操作规则，高级） | `AGENTS.md` | 直接写入 |
| `skillNames` | `skills/` 目录 | `syncEmployeeSkills()` |

不通过 UI 暴露（系统自管）的文件：`TOOLS.md`、`MEMORY.md`、`memory/`。

### 2. 定时任务修复（三处关键 Bug）

#### Bug 1：服务重启后 heartbeat 调度丢失
- **根因**：`AutomationService.start()` 只启动了 CronService（从磁盘加载 cron/every 类型），但不恢复 heartbeat 调度（HeartbeatService 是纯内存对象）
- **修复**：`AutomationService.start()` 新增 `restartHeartbeatSchedules()` 方法，在启动时从 DB 查询所有 `enabled=1` 的 heartbeat 调度并重新启动

#### Bug 2：heartbeat 执行绕过 EmployeeRunService，不记录运行日志
- **根因**：之前 `upsertSchedule(heartbeat)` 调用 `gateway.startHeartbeat()`，该方法直接调用 `gateway.runEmployeeTurn()`，跳过了 `EmployeeRunService`，导致无运行记录入库
- **修复**：`AutomationService` 自行管理 `heartbeats: Map<string, HeartbeatService>`，heartbeat tick 通过 `runService.runEmployeeTurn()` 执行，可正确创建运行记录并记录摘要

#### Bug 3：测试文件构造函数参数缺失（测试全部失败）
- **根因**：`EmployeeRunService` 构造函数新增了 `EmployeeSkillRepository` 参数；`AutomationService` 新增了 `gateway` 参数，但两个测试文件未同步更新
- **修复**：更新 `tests/automation-service.test.ts` 和 `tests/skill-import-and-run-service.test.ts` 中的实例化代码

### 3. 测试用例扩充（automation-service.test.ts）

重写为完整的三类型测试矩阵（共 6 个测试用例）：

- **cron 类型**：手动触发 + 服务重启后从磁盘恢复（2个）
- **every 类型**：手动触发 + 伪时钟自动触发（2个）
- **heartbeat 类型**：重启恢复验证 + 伪时钟 tick 触发验证（2个）

### 4. EmployeeScheduleRepository 新增方法

新增 `listActiveByKind(scheduleKind)` 方法，供 `restartHeartbeatSchedules()` 查询所有激活的heartbeat 调度。

## 测试/验证

```bash
# 运行所有测试（21 个全部通过）
pnpm --filter @nextclaw/digital-employee test
```

输出：
```
Test Files  5 passed (5)
Tests  21 passed (21)
```

类型检查：所有修改文件无 TypeScript 错误（通过 VS Code 类型系统验证）。

## 发布/部署方式

本次变更仅影响 `packages/nextclaw-digital-employee`，属于服务端逻辑修复（不涉及 UI 或外部 API 变更），部署方式按常规应用更新即可：

```bash
# 开发调试
pnpm --filter @nextclaw/digital-employee dev

# 生产构建
pnpm --filter @nextclaw/digital-employee build
```

## 用户/产品视角验收步骤

1. 创建一名员工，设置心跳巡检内容，选择"心跳巡检"调度类型，间隔设为 3 分钟
2. 服务启动后，等待 3 分钟，在员工详情页"执行记录"中应出现一条运行记录
3. **重启服务**（停止并重新启动 `pnpm dev`），等待 3 分钟，仍应出现新的运行记录（验证重启恢复）
4. 设置"固定间隔"或"每日定时"类型，同样验证运行记录可正常生成
5. 验证员工编辑页面中，HEARTBEAT.md、USER.md、BOOT.md、AGENTS.md 的内容均可读取并保存回对应文件
