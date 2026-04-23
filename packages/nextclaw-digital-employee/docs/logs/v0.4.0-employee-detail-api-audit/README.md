# v0.4.0-employee-detail-api-audit

## 迭代完成说明

- 本次排查聚焦员工详情接口 [server/api/employees/[id].get.ts](../../../server/api/employees/%5Bid%5D.get.ts)、统一前端封装 [app/composables/useEmployeeDetail.ts](../../../app/composables/useEmployeeDetail.ts)、以及所有直接消费 `/api/employees/${id}` 的页面和模块。
- 该接口的实际职责不是“查一条员工基础记录”，而是“给员工工作台提供聚合详情”：先读取员工基础信息，再并行补齐技能、排班、最近运行记录、自动化摘要和健康检查。
- 实际返回结构由两部分拼成：

| 分类 | 字段 |
| --- | --- |
| 员工基础信息 | `id`、`name`、`code`、`description`、`systemPrompt`、`model`、`status`、`departmentId`、`createdByUserId`、`updatedByUserId`、`webhookEnabled`、`webhookSecret`、`createdAt`、`updatedAt` |
| 技能信息 | `skills[]`，每项含 `id`、`skillName`、`version`、`latestVersion`、`hasUpdate`、`installMissing` |
| 排班信息 | `schedule`，含 `id`、`scheduleKind`、`cronExpr`、`everyMs`、`nextRunAt` |
| 最近运行 | `recentRuns[]`，取最近 20 条运行记录并裁剪为 `id`、`status`、`summary`、`startedAt`、`finishedAt` |
| 自动化摘要 | `automationSummary`，来自 [shared/ui-models.ts](../../../shared/ui-models.ts) 的 `buildAutomationSummary()` |
| 健康检查 | `health.hasPrompt`、`health.hasSkills`、`health.hasSchedule`、`health.jobsCount`、`health.enabledJobsCount` |

- 基础信息字段来自 [server/repositories/employee-repository.ts](../../../server/repositories/employee-repository.ts) 的 `EmployeeView`；聚合附加字段由 [server/api/employees/[id].get.ts](../../../server/api/employees/%5Bid%5D.get.ts) 在接口层补充。
- 前端共享类型 [app/composables/useEmployeeDetail.ts](../../../app/composables/useEmployeeDetail.ts) 只声明了其中一部分字段，遗漏了 `model`、`status`、`webhookEnabled`、`webhookSecret`、`createdAt`、`updatedAt`。因此当前调用方已经出现“服务端实际返回一套、前端共享类型只描述半套、部分页面再各自补本地类型”的分裂状态。

### 使用位置

| 模块/页面 | 入口文件 | 使用方式 | 实际读取字段 |
| --- | --- | --- | --- |
| 员工详情概览页 | [app/pages/employees/[id].vue](../../../app/pages/employees/%5Bid%5D.vue) | 通过 `useEmployeeDetail(employeeId)` 获取完整详情，并把 `data.data` 传给概览卡片 | `name`、`description`、`code`、`departmentId`、`skills`、`automationSummary` |
| 概览资料卡 | [app/components/employee-overview/ProfileCard.vue](../../../app/components/employee-overview/ProfileCard.vue) | 由概览页透传 `employee` | `id`、`name`、`code`、`skills`、`health.hasPrompt`、`health.hasSkills`、`automationSummary`、`recentRuns[].status` |
| 员工聊天页 | [app/pages/employees/[id]/chat.vue](../../../app/pages/employees/%5Bid%5D/chat.vue) | 通过 `useEmployeeDetail(employeeId)` 获取详情，并在对话区展示员工名；运行结束后调用 `refreshEmployee()` | 只直接读取 `name` |
| 员工配置页 Webhook 区块 | [app/pages/employees/[id]/config.vue](../../../app/pages/employees/%5Bid%5D/config.vue) | 直接 `useLazyFetch(() => `/api/employees/${employeeId.value}`)` | `code`、`webhookEnabled`、`webhookSecret` |
| 员工编辑引导数据 | [app/composables/useEmployeeCrud.ts](../../../app/composables/useEmployeeCrud.ts) | 在 `openEditor()` 内直接 `$fetch(/api/employees/${id})`，宿主页面为 [app/pages/employees/index.vue](../../../app/pages/employees/index.vue) | `id`、`name`、`code`、`description`、`systemPrompt`、`model`、`skills[].skillName`、`schedule.scheduleKind`、`schedule.cronExpr`、`schedule.everyMs` |

- 以上是当前代码里真正消费 `/api/employees/${id}` 的入口；其余员工相关页面如运行记录、定时任务、工作空间等都走各自专用接口，没有直接使用这个详情接口。

### 冗余信息获取判断

| 模块/页面 | 结论 | 说明 |
| --- | --- | --- |
| [app/pages/employees/[id]/chat.vue](../../../app/pages/employees/%5Bid%5D/chat.vue) | 冗余明显 | 页面只拿员工名做会话头部展示，却会连带拿到技能、排班、20 条 recentRuns、automationSummary、health、Webhook 信息。聊天页本身还会独立请求 sessions、messages、runs，因此这里属于高冗余获取。 |
| [app/pages/employees/[id]/config.vue](../../../app/pages/employees/%5Bid%5D/config.vue) | 冗余明显 | Webhook 区块只需要 `code`、`webhookEnabled`、`webhookSecret`，却会把技能、排班、recentRuns、automationSummary、health 一并取回。 |
| [app/composables/useEmployeeCrud.ts](../../../app/composables/useEmployeeCrud.ts) | 冗余中等偏高 | 编辑弹窗只需要基础可编辑字段、技能名列表和排班基础信息，但当前接口还会返回状态、Webhook、审计时间、recentRuns、automationSummary、health，以及编辑态根本不需要的技能版本差异字段。 |
| [app/pages/employees/[id].vue](../../../app/pages/employees/%5Bid%5D.vue) | 部分冗余 | 概览页是最合理的消费者，但当前仍有几块没真正用到：`schedule` 本身未直接展示，`health.hasSchedule/jobsCount/enabledJobsCount` 未直接消费，`recentRuns` 只被用于资料卡里的“是否运行中”判定，而“近期活动”仍额外调用 [app/components/employee-overview/RecentActivity.vue](../../../app/components/employee-overview/RecentActivity.vue) 里的 `/api/employees/${id}/runs`。 |

### 结论与建议

1. `/api/employees/${id}` 目前更像“员工工作台聚合接口”，适合概览页，不适合聊天页、Webhook 配置页和编辑引导复用。
2. 当前最值得拆分的是两个轻量读取场景：聊天页只需要员工展示名，配置页只需要 Webhook 配置。它们继续复用聚合接口，会持续放大无效数据传输与耦合。
3. 编辑弹窗建议独立一个更贴近表单的 bootstrap 接口，直接返回可编辑字段和 `skillNames`，避免把 recentRuns、automationSummary、Webhook、审计字段全部带进来。
4. 若短期不拆接口，至少应先统一共享类型：让 [app/composables/useEmployeeDetail.ts](../../../app/composables/useEmployeeDetail.ts) 与服务端真实 payload 对齐，避免各页面继续复制本地 payload 类型。

## 测试/验证/验收方式

- 本次仅新增分析文档，未修改运行时代码；`build`、`lint`、`tsc` 不适用，原因是未触达构建、类型或运行链路。
- 结构校验：确认新增目录命名符合 `v<semver>-<slug>`，且版本号严格高于现有最大有效版本 `v0.3.0`。
- 内容校验：逐一对照 [server/api/employees/[id].get.ts](../../../server/api/employees/%5Bid%5D.get.ts)、[app/composables/useEmployeeDetail.ts](../../../app/composables/useEmployeeDetail.ts)、[app/pages/employees/[id].vue](../../../app/pages/employees/%5Bid%5D.vue)、[app/pages/employees/[id]/chat.vue](../../../app/pages/employees/%5Bid%5D/chat.vue)、[app/pages/employees/[id]/config.vue](../../../app/pages/employees/%5Bid%5D/config.vue)、[app/composables/useEmployeeCrud.ts](../../../app/composables/useEmployeeCrud.ts) 做人工交叉核对。

## 发布/部署方式

- 本次仅涉及文档沉淀，不涉及前端发布、服务端部署、数据库 migration。
- 如需把审计结论继续落地成代码改造，可在后续迭代中按“聊天轻量接口 / Webhook 轻量接口 / 编辑 bootstrap 接口 / 共享类型对齐”四个方向拆分实施。

## 用户/产品视角的验收步骤

1. 打开本文档，确认能明确回答“employees/${id} 接口是做什么的、返回了什么、被谁使用、哪里存在冗余”。
2. 随机打开员工概览页、聊天页、配置页，对照文档里的使用位置，确认页面职责与文档描述一致。
3. 对照 [server/api/employees/[id].get.ts](../../../server/api/employees/%5Bid%5D.get.ts) 和文档的“实际返回结构”表，确认字段分组没有遗漏基础员工字段、技能字段、排班字段、recentRuns、automationSummary、health。
4. 对照 [app/pages/employees/[id]/chat.vue](../../../app/pages/employees/%5Bid%5D/chat.vue)、[app/pages/employees/[id]/config.vue](../../../app/pages/employees/%5Bid%5D/config.vue)、[app/composables/useEmployeeCrud.ts](../../../app/composables/useEmployeeCrud.ts)，确认冗余判断与各处真实读取字段一致。