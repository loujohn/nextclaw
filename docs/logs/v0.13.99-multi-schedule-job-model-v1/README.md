# v0.13.99 — 数字员工定时任务多 job 模型第一版实现

## 迭代完成说明

本次迭代将数字员工自动化调度从"一员工一条 schedule"升级为"一员工多条独立 job"的产品模型，并在员工工作台新增"定时任务"tab。

### 后端改动

**新增数据库表 `employee_schedule_jobs`**
- 字段：`id`、`employee_id`、`name`、`description`、`schedule_kind`、`cron_expr`、`every_ms`、`heartbeat_interval_s`、`task_prompt`、`enabled`、`runtime_job_id`、`next_run_at`、`created_at`、`updated_at`
- 与 `employees` 通过 `employee_id` 一对多关联，支持同一员工挂多条独立任务
- 通过 `ensurePlatformDatabase` 幂等建表（存量数据库自动迁移）

**新增文件**
- `server/repositories/employee-schedule-job-repository.ts` — 完整 CRUD：`create`、`update`、`delete`、`getById`、`listByEmployeeId`、`listAllEnabled`、`patchNextRunAt`、`patchRuntimeJobId`
- `server/api/employees/[id]/jobs.get.ts` — 列出员工所有 job
- `server/api/employees/[id]/jobs.post.ts` — 创建 job
- `server/api/employees/[id]/jobs/[jobId].patch.ts` — 更新 job
- `server/api/employees/[id]/jobs/[jobId].delete.ts` — 删除 job
- `server/api/employees/[id]/jobs/[jobId]/run.post.ts` — 立即触发

**改造 `AutomationService`**
- 构造函数新增 `EmployeeScheduleJobRepository` 依赖
- CronService job 命名新格式：`ejob:{jobId}`（区别于旧格式 `employee:{employeeId}`）
- 新增 `jobHeartbeats` Map，独立管理 job 级别的 HeartbeatService 实例
- 新增公开方法：`listJobsForEmployee`、`createJob`、`updateJob`、`deleteJob`、`runJobNow`
- `start()` 新增 `restartJobSchedules()` 恢复重启后的 jobs
- `onJob` 回调兼容新旧两种格式名称
- `syncNextRunForJobs` 根据 `ejob:` / `employee:` 前缀分别写回不同仓库
- 原有单 schedule 相关方法（`upsertSchedule`、`runNow`、`clearSchedule`）保持不变，向后兼容

**改造 `platform-context.ts`**
- 实例化 `EmployeeScheduleJobRepository` 并注入到 `AutomationService`
- `PlatformContext` 类型新增 `employeeScheduleJobRepo` 字段

**改造 `schema.ts` / `knex.ts`**
- `PLATFORM_TABLES` 新增 `employeeScheduleJobs: "employee_schedule_jobs"`
- `createEmployeeScheduleJobsTable` 函数负责建表，并在 `ensurePlatformDatabase` 中调用

### 前端改动

**员工工作台 tab**
- `app/pages/employees/[id].vue`：新增"定时任务"tab，路由指向 `/employees/:id/jobs`

**新增定时任务管理页**
- `app/pages/employees/[id]/jobs.vue`：
  - 展示该员工所有 job 列表（任务名、运行方式、下次运行时间、启用状态）
  - 每条 job 支持：立即执行、启用/停用切换、编辑、删除
  - 支持新增/编辑 job 的弹窗表单（名称、描述、运行方式、Cron 表达式/间隔、任务 Prompt、启用开关）
  - 空状态引导，带 Cron 表达式示例说明

## 测试/验证/验收方式

改动涉及后端服务层和数据库建表逻辑，最小验证集：

1. 编辑器诊断：所有改动文件无 TypeScript/ESLint 报错（已验证）
2. 数据库迁移：启动平台后 `employee_schedule_jobs` 表自动创建，无需手动迁移
3. 向后兼容：旧的 `PATCH /employees/:id/schedule` 接口不变，使用旧 `employee_schedules` 表，存量 heartbeat/cron 调度不受影响
4. API 冒烟（可在 dev 环境执行）：
   - `POST /api/employees/:id/jobs` 创建一条 cron job
   - `GET /api/employees/:id/jobs` 返回已创建的 job 列表
   - `PATCH /api/employees/:id/jobs/:jobId` 更新 job
   - `POST /api/employees/:id/jobs/:jobId/run` 立即触发
   - `DELETE /api/employees/:id/jobs/:jobId` 删除

## 发布/部署方式

本次为应用层改动（DB migration + 服务层 + API + 前端），不含 NPM 包发布：

- 重新部署 `packages/nextclaw-digital-employee` 服务即可
- 数据库 migration 自动执行（`ensurePlatformDatabase` 幂等建表）
- 无需额外操作

不适用项：
- NPM 发布：不适用（本次仅改动 app 层，未更新发布的 packages）
- 远程 migration 脚本：不适用（使用内置 `ensurePlatformDatabase` 自动处理）

## 用户/产品视角的验收步骤

1. 打开任意员工的"工作台"页（`/employees/:id`）
2. 确认顶部 tab 中出现"定时任务"tab
3. 点击"定时任务"tab，看到空状态提示
4. 点击"新增任务"，填写：
   - 任务名称：`每日工时提醒`
   - 运行方式：`Cron 表达式`
   - Cron 表达式：`0 10 * * 1-5`
   - 任务 Prompt（可选）：填写本次触发的专属提示
   - 点击"保存"
5. 任务创建成功，列表中出现该条记录，显示下次运行时间
6. 再次新增第二条任务（例如每天 18:00 工时统计），确认两条任务并存且互相独立
7. 点击任意任务的"立即执行"按钮，确认该任务被触发
8. 点击"停用"按钮，确认任务进入已停用状态，logo 变灰
9. 点击"删除"确认删除，列表中该条消失
