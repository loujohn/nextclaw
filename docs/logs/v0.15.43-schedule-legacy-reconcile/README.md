# v0.15.43-schedule-legacy-reconcile

## 迭代完成说明

- 排查定时任务重复执行问题后，确认重复来源不止一种：
  - 新 jobs 链路在历史热更新/多实例漂移下，可能在 cron 存储里累积同名 `ejob:{jobId}` 运行时；
  - 历史 legacy 单任务 `employee_schedules` 仍可能与新的 jobs 并存，导致同一员工同时跑“旧 schedule + 新 job”；
  - legacy `employee:{employeeId}` 运行时本身也可能在存储里残留重复项。
- 调整 `AutomationService.start()` 启动恢复流程：
  - 启动时先识别“已有启用 jobs 的员工”；
  - 对这些员工自动停用 legacy schedule，并移除对应 `employee:*` 运行时，避免旧新两套调度同时执行；
  - 对仍在使用 legacy 单任务的员工，按稳定名称 `employee:{employeeId}` 进行重启期去重与运行时指针修复。
- 保持前端与接口模型不变，本次只修复调度执行层，避免扩大到展示层重构。

## 测试/验证/验收方式

- 定向回归测试：`pnpm -C packages/nextclaw-digital-employee exec vitest run tests/automation-reconciliation.test.ts`
- 本次重点观察点：
  - 同名 `ejob:*` 重启后只保留 1 条 canonical runtime；
  - 已有新 jobs 的员工，legacy `employee:*` runtime 会被移除且 legacy schedule 被停用；
  - 纯 legacy 员工若有重复 `employee:*` runtime，也会在启动时收敛到 1 条。
- 未执行全量 `build/lint/tsc`：本次仅触达数字员工调度恢复逻辑，已有针对该问题的窄回归测试，采用定向 vitest 作为最小充分验证。

## 发布/部署方式

- 发布 `packages/nextclaw-digital-employee` 所在服务版本并重启对应服务进程。
- 本次不涉及数据库 schema 变更，migration 不适用。
- 重启后启动恢复逻辑会自动清理 legacy 与重复 runtime；若线上已有当天重复运行记录，历史记录不会回写删除，但后续触发会按修复后的单一调度执行。

## 用户/产品视角的验收步骤

1. 选择一个此前出现“同一天连续执行多次”的员工。
2. 发布并重启服务后，进入该员工详情页与定时任务页，确认只保留当前有效的新任务，不再出现旧 schedule 继续生效的现象。
3. 等待下一次每日触发时间，确认当天只新增 1 条对应的自动运行记录。
4. 若该员工是历史老数据，再检查仪表盘/员工列表与运行中心，确认没有再次出现同一时间段连续多条自动运行记录。