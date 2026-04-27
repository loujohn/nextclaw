# v0.15.66-scheduled-session-creator-filter-align

## 迭代完成说明

- 定时任务执行链路补齐了会话创建人透传：`employee_schedule_jobs` 与 legacy `employee_schedules` 中已保存的 `created_by_user_id` 会在触发会话创建时传入，保证定时任务发起的会话归属到定时任务创建人。
- `EmployeeRunService.runEmployeeTurn()` 新增可选 `actorUserId` 参数，用于 scheduled 场景创建/复用会话时写入 `chat_sessions.created_by_user_id`。
- 聊天会话来源判定从“`created_by_user_id` 是否为空”改为“`session_key` 是否命中 scheduled 前缀”，避免定时会话一旦写入创建人后被误判成普通对话。
- 增加回归断言，确保定时任务触发的会话同时满足：保留创建人、来源仍为 `scheduled`、来源标签仍为“定时任务”。

## 测试/验证/验收方式

- 已执行：VS Code 问题检查，确认以下文件无静态错误：
  - `packages/nextclaw-digital-employee/server/repositories/chat-session-repository.ts`
  - `packages/nextclaw-digital-employee/server/services/employee-run-service.ts`
  - `packages/nextclaw-digital-employee/server/services/automation-service.ts`
  - `packages/nextclaw-digital-employee/tests/automation-service.test.ts`
- 已执行：`pnpm -C packages/nextclaw-digital-employee exec vitest run tests/automation-service.test.ts`
- 结果：命令在当前环境失败，原因是测试依赖达梦实例，当前本地环境报 `[6001] 网络通信异常`，无法切换到 `DIGITAL_EMPLOYEE_TEST` Schema；因此未能完成数据库集成回归。
- `build` / `lint` / `tsc`：本次未额外执行全量命令，采用“问题检查 + 定向测试”作为最小充分验证。当前阻塞点为数据库联通性，而非本次改动引入的静态错误。

## 发布/部署方式

- 本次为后端逻辑修复，无独立发布脚本变更。
- 按数字员工常规发布流程发布对应服务后生效。
- 若发布环境包含后端实例重启，重启后新触发的定时任务会按新逻辑写入会话创建人；历史已生成会话不会自动回填。

## 用户/产品视角的验收步骤

1. 以用户 A 创建一个定时任务。
2. 等待该定时任务触发一次，或手动执行一次 `run_now`。
3. 打开对应员工的聊天会话列表，确认新生成的定时会话来源仍显示为“定时任务”。
4. 以仅可查看本人会话的用户 A 访问聊天记录，确认能看到该定时会话。
5. 以另一个无全量查看权限的用户 B 访问同一员工聊天记录，确认看不到用户 A 创建的该定时会话。