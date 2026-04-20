# 迭代完成说明

- 补齐定时任务模块的创建者、修改者归因，覆盖两条调度链路：
  - 新版多任务表 employee_schedule_jobs
  - 旧版单任务表 employee_schedules
- 在定时任务创建、定时任务修改、旧版 schedule.patch 更新时，统一写入当前登录用户 ID 到 created_by_user_id、updated_by_user_id。
- 定时任务接口返回类型同步补充 createdByUserId、updatedByUserId，便于后续按用户做数据权限过滤与审计展示。
- 本次为上一轮资源归因补充迭代，承接 [v0.15.39-resource-audit-user-fields](../v0.15.39-resource-audit-user-fields/README.md)。

# 测试/验证/验收方式

- 执行定向静态校验：
  - pnpm -C packages/nextclaw-digital-employee exec eslint server/repositories/employee-schedule-repository.ts server/repositories/employee-schedule-job-repository.ts server/services/automation-service.ts server/api/employees/[id]/jobs.post.ts server/api/employees/[id]/jobs/[jobId].patch.ts server/api/employees/[id]/schedule.patch.ts shared/api-types.ts tests/automation-service.test.ts migrations/012_resource_audit_user_fields.ts
- 执行定向测试建议：
  - pnpm -C packages/nextclaw-digital-employee test -- automation-service.test.ts
- 关注点：
  - 创建 cron/every/heartbeat 定时任务时，createdByUserId/updatedByUserId 正确写入。
  - 修改定时任务后，updatedByUserId 正确刷新且 createdByUserId 不变。
  - 旧版 schedule.patch 入口更新调度时，也能记录 updatedByUserId。

# 发布/部署方式

- 先执行 packages/nextclaw-digital-employee 的数据库 migration，使 employee_schedules 与 employee_schedule_jobs 新增归因列。
- 再发布数字员工后端服务，使新的 actor 透传逻辑与 schema 一起生效。
- 若环境中已存在运行中的调度服务，发布后重启服务，确保定时任务 API 与调度服务使用同一版本代码。

# 用户/产品视角的验收步骤

- 使用一个已登录账号进入数字员工的定时任务管理页，新建一个任务后查看任务列表/详情接口，确认出现创建者、修改者字段且值为当前用户 ID。
- 使用另一个账号或切换当前登录用户修改该任务，再次查看接口，确认 createdByUserId 保持原值，updatedByUserId 更新为最新操作者。
- 走旧版 schedule.patch 调度入口更新一个员工的默认调度后，检查返回或详情接口，确认修改者字段也被写入。