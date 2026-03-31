# 数字员工平台 v0.15–v0.18 版本路线图（升级版）

**日期**: 2026-03-31
**状态**: Draft v2
**基于**: [v1 路线图](digital-employee-v0.15-v0.18-roadmap.md) + 代码审计反馈
**适用范围**: `packages/nextclaw-digital-employee`, `@nextclaw/core`

---

## 变更说明（相对 v1）

本版本基于对 v1 路线图的全方位审计（产品 + 技术 + 代码），做了以下关键调整：

| 调整项 | 原方案 | 调整后 | 原因 |
|--------|--------|--------|------|
| 健康模型 | v0.16 新建 | v0.15 后端 + v0.16 UI | 本质属于"稳态化"，且后端已有 health 字段雏形 |
| Legacy schedule API | 保持兼容 | v0.15 迁移 + v0.16 移除 | 违反 `avoid-stack-bloat` 规则 |
| 场景包 | v0.17 批量沉淀 | v0.17 架构 + 1 个示范 | 模板机制未验证时批量做场景包风险高 |
| 多员工协作 | v0.18 子功能 | v0.18 仅做单向触发最简版 | 完整编排是独立子系统级别 |
| RBAC / 用户身份 | v0.18 | 移出本路线图 | 产品当前阶段暂不考虑 |
| 新增：DB migration | 无 | v0.15 建立机制 | 四版本持续改 schema，需 migration 管理 |
| 新增：错误分类体系 | 无 | v0.15 定义 | PRD 提"可操作提示"但缺统一错误模型 |
| 新增：组件拆分 | 无 | v0.15 首要任务 | index.vue 2600+ 行是最大技术债 |
| 新增：HeartbeatService 收敛 | 无 | v0.15 | Gateway 与 AutomationService 重复管理 |
| 新增：结构化日志 | 无 | v0.15 基础 | 可观测性需要日志基础设施 |

---

## 目标

将当前数字员工项目从"功能已具备基础形态"推进到"可稳定交付、可运营管理、可企业化扩展"的产品平台。

路线图设计遵循以下节奏：

1. **v0.15：平台主链路稳态化 + 技术债务治理**
2. **v0.16：数字员工体验产品化**
3. **v0.17：运营体系与组织协同**
4. **v0.18：平台化扩展与治理基础**

---

## 当前状态判断

### 已具备的基础能力

- 数字员工基础 CRUD 与工作区初始化
- 员工技能绑定与技能可见性过滤
- 聊天对话、推理过程、工具调用和结果卡片展示
- 自动化调度与 job / heartbeat 支撑（含多任务模型）
- run_records / run_events 可观测数据模型
- integrations / secrets 数据表基础（Secrets 已实现 AES-256-GCM 加密）
- 组织部门与真人员工、人机共存的数据建模
- 员工健康状态基础字段（hasSkills / hasSchedule / lastStatus）

### 关键技术债务

| 债务 | 影响 | 当前规模 |
|------|------|---------|
| `employees/index.vue` 单文件 2600+ 行 | v0.16 无法继续扩展 | 105K 字符 |
| 员工创建无事务保护 | 中间步骤失败数据不一致 | index.post.ts |
| AutomationService 三种调度范式并存 | 维护成本高，约 40% 代码处理分发 | 484 行 |
| HeartbeatService 重复管理 | Gateway 与 AutomationService 各自维护 heartbeats Map | 两处独立实现 |
| Schema 缺乏类型安全 | status/triggerType 等为裸 string | schema.ts |
| 无 DB migration 机制 | Schema 变更无追踪 | Knex 未启用 migration |
| console.warn 作为唯一日志手段 | 无法结构化查询 | automation-service.ts |

---

# v0.15 — 平台主链路稳态化

## 版本定位

把数字员工从"功能可用"推进到"主链路稳定可控"。本版本同时治理关键技术债务，为 v0.16 的产品化扩展扫清障碍。

核心闭环：

- 员工创建 / 更新 / 删除闭环（含事务保护）
- chat → run → result 闭环
- schedule / job → run 闭环（统一到 job-centric）
- integrations / secrets 主链路闭环
- 数据状态一致性闭环

---

## 核心目标

### 1. 员工生命周期服务化

当前员工创建流程中，API handler 仍承担部分应用编排职责：

- `server/api/employees/index.post.ts` 顺序执行 DB create → workspace init → skill bind → schedule，无事务保护

应在本版本中：

- 抽离编排职责到 `EmployeeLifecycleService`（service 层）
- 实现补偿式事务：任何步骤失败，回滚已完成步骤
- 删除员工时的调度清理、workspace 清理、关联 run 清理统一在 service 层
- 路由层只负责输入验证与输出格式化（标准：无业务编排逻辑）

对应支撑文件：

- `server/engine/employee-workspace.ts`
- `server/repositories/employee-repository.ts`

### 2. 数据模型与状态治理

基于 `server/db/schema.ts`，本版本完成：

- **DB migration 机制建立**：启用 Knex migration，将当前 schema 作为 baseline migration
- **枚举收敛**：
  - `employee.status` → `"active" | "inactive" | "archived"`
  - `run.status` → `"pending" | "running" | "completed" | "failed"`
  - `run.trigger_type` → `"manual" | "scheduled"`（注意：当前代码中 "chat" 是 trigger_source 而非 trigger_type）
  - `run.trigger_source` → 自由文本（"chat" / jobId / "cron" / "heartbeat" 等），不做枚举约束
  - `job.scheduleKind` → `"cron" | "every" | "heartbeat"`
- **唯一性约束补强**：employee.code（partial UNIQUE，仅对 status != 'archived' 生效，兼容 soft delete 复用 code）、skill binding (employee_id + skill_name)
- **查询索引补强**：run_records (employee_id + started_at)、run_events (run_id + seq)
- **删除语义统一**：明确 hard delete / soft delete / archive 的适用边界
  - 员工删除 → soft delete（status = archived），workspace 不移动/不删除（归档状态仅由 DB status 控制）
  - Run 记录 → 保留（跟随员工归档状态过滤）
  - Schedule job → hard delete（跟随员工生命周期）
  - Employee skills → 保留（归档员工恢复时可用）
  - **注意**：soft delete 需同步更新所有 employee 查询（list/getById/getByCode）添加 `WHERE status != 'archived'` 默认过滤，并提供 `includeArchived` 参数用于管理场景

- **API 兼容约定**：本版本及后续版本的 API 改动遵循"只加不减"原则：
  - 新增字段不破坏已有消费方
  - 行为变更（如 delete 从 hard 改为 soft）需在 API 文档中明确标注
  - 返回格式保持向后兼容

### 3. 自动化调度收敛到 Job-Centric

当前 `AutomationService` 同时承载三种调度范式：

| 范式 | 命名规则 | 来源 |
|------|---------|------|
| Legacy 单调度 | `employee:{id}` | upsertSchedule API |
| 多任务 | `ejob:{jobId}` | createJob API |
| 对话创建 | agentId 匹配 | CronService.onJob |

本版本应：

- 统一内部语义到 `ejob:{jobId}` 模型
- Legacy `upsertSchedule`/`runNow`/`clearSchedule` 加 `@deprecated` 标记
- 新增 migration 工具将现有 legacy schedule 数据迁移为 job 记录（同时处理 DB 记录和 CronService jobs.json 持久化文件）
- 对话创建的定时任务也纳入 job 模型
- **HeartbeatService 统一收敛到 AutomationService**：移除 NextclawEngineGateway 中的独立 heartbeat 管理

退出时间表：v0.16 移除全部 legacy schedule 代码路径。

### 4. Secrets / Integrations 进入主流程

当前 Secrets 基础设施良好（AES-256-GCM 加密、scope 机制），但尚未真正融入执行主链路。

本版本重点：

- 运行前校验所需 integration 是否可用
- 区分权限错误、secret 缺失、外部平台错误
- 将错误从技术异常提升为可操作提示
- chat / run / 集成配置之间形成稳定跳转关系
- **预留 key version header**：为 v0.18 的密钥轮换做结构预埋（在加密数据前缀中加版本号）

### 5. Run / Event 可观测性补强

基于 `run_records` / `run_events`，本版本统一：

- run status 流转语义（pending → running → completed/failed）
- event_type 分类规范
- summary / result_json 生成口径
- run detail 展示字段与展示顺序
- **event seq 策略确认**：经审查，当前 appendEvents 在单次 run 内串行执行，seq 冲突风险极低；但仍建议改为 DB auto-increment 以降低未来扩展风险（优先级可选）

### 6. 健康模型定义（后端）

虽然前端 UI 在 v0.16 产品化，但健康模型的**定义与计算**属于"平台稳态化"：

- 定义标准化健康模型（两层结构）：
  - **healthStatus**（枚举，5 种）：`unconfigured` | `healthy` | `warning` | `error` | `inactive`
  - **healthDetail**（结构体，包含子状态信息）：
    - `reason`: string（如 "no_skills" / "integration_failed" / "idle_too_long" / "consecutive_failures" / "recent_success"）
    - `lastRunAt`: string | null
    - `consecutiveFailures`: number
    - `missingIntegrations`: string[]
  - 映射关系：
    - unconfigured ← 无 skills
    - inactive ← status = inactive
    - error ← 最近 run 连续失败
    - warning ← 集成异常 / 长时间未执行（通过 reason 区分子状态）
    - healthy ← 其他（通过 reason 区分"最近执行成功"等子状态）
- 在新增 `EmployeeHealthService` 中实现健康计算
- GET /api/employees 返回 `healthStatus`（枚举）+ `healthDetail`（子状态详情）
- 为 v0.16 的 UI 展示提供稳定数据契约（UI 层根据 healthDetail.reason 做差异化展示）

### 7. 统一错误分类体系

定义平台级错误分类，使前端能给出可操作提示：

| 错误类别 | 示例 | 用户提示模板 |
|---------|------|------------|
| `config_error` | API Key 未配置 | "请先在设置中配置 XXX" |
| `integration_error` | 钉钉 Token 失效 | "XXX 集成连接异常，请重新配置" |
| `runtime_error` | 模型调用超时 | "执行超时，请稍后重试" |
| `model_error` | 模型返回格式异常 | "模型响应异常，请检查模型配置" |
| `data_error` | 员工/技能不存在 | "关联的 XXX 不存在，请检查配置" |

在 `EmployeeRunService` 中捕获异常并映射为分类错误，替代当前的 `String(error)` 直接存储。

### 8. 前端组件拆分与结构化日志

**前端**：

- `employees/index.vue`（2600+ 行）拆分为独立组件：
  - `EmployeeListPanel`（员工列表与筛选）
  - `EmployeeCreateForm`（创建/编辑表单，v0.16 将重构为 wizard）
  - `DepartmentSidebar`（部门树）
  - `EmployeeOverviewDashboard`（总览仪表板）
  - `EmployeeCard`（单个员工卡片）
- 拆分标准：每个组件 < 400 行

**后端**：

- 引入结构化日志（如 consola 或 Nuxt 内建 logger）
- 替换 `console.warn` 为分级日志输出
- 关键操作（员工创建/删除/调度变更/运行开始结束）记录结构化日志

---

## 主要改动模块

- `server/api/employees/*`
- `server/services/*`（新增 EmployeeLifecycleService、EmployeeHealthService）
- `server/engine/employee-workspace.ts`
- `server/services/automation-service.ts`
- `server/db/schema.ts` + migrations/
- `server/repositories/*`
- `app/pages/employees/index.vue`（拆分）
- `app/pages/employees/[id]/chat.vue`
- `shared/ui-models.ts`

---

## 验收标准

- [ ] 创建员工后，DB、workspace、默认状态保持一致；中间步骤失败可回滚
- [ ] 停用或删除员工后，不残留失控 schedule / job
- [ ] 一次 chat run 可完整追踪输入、执行过程、结果和失败原因
- [ ] integration / secret 缺失时，错误语义清晰（返回错误类别 + 可操作提示）
- [ ] run list / run detail 成为可靠排障入口
- [ ] AutomationService 中 legacy schedule 代码标记 @deprecated，新建 job 全部走 ejob 路径
- [ ] employees/index.vue 拆分为 5+ 独立组件，每个 < 400 行
- [ ] DB migration baseline 建立，后续 schema 变更通过 migration 管理
- [ ] 健康状态返回 healthStatus（枚举）+ healthDetail（子状态详情）
- [ ] 每个阶段完成后通过冒烟测试验证主链路无回归

---

## 明确不做项

- 员工模板市场
- 多员工协作
- 全量 RBAC 体系 / 用户登录
- 复杂运营报表
- 组织级协同能力深化
- 员工创建向导 UI（属 v0.16）
- 健康状态 UI 标签产品化（属 v0.16）

---

# v0.16 — 数字员工体验产品化

## 版本定位

把数字员工从"后台可运行对象"升级成"可配置、可理解、可复用的产品单元"。

v0.15 完成了后端稳态化和组件拆分，v0.16 在此基础上做面向用户的产品化体验。

---

## 核心目标

### 1. 员工创建体验重构

将创建流程升级为分步式向导：

1. 基本信息（名称、代号、描述）
2. 角色设定（systemPrompt 编辑器）
3. 绑定技能
4. 绑定集成
5. 自动化设置
6. 启动检查 / 完成

重点页面：

- 将 v0.15 拆分后的 `EmployeeCreateForm` 升级为 `EmployeeCreateWizard`（分步式向导）
- 目标是降低上手门槛，使"创建员工"从工程操作转向产品操作

### 2. 员工健康标签 UI 产品化

基于 v0.15 已定义的健康模型后端，在 UI 中产品化展示：

- 未完成配置 → 黄色标签 + 引导完成
- 可运行 → 绿色标签
- 运行异常 → 红色标签 + 跳转排障
- 集成异常 → 橙色标签 + 跳转配置
- 长时间未执行 → 灰色标签
- 最近执行成功 → 绿色标签 + 时间

### 3. Chat 页升级为工作台

当前 chat 页已支持 reasoning 折叠、tool calls 折叠、result cards、abort。

继续产品化：

- chat 历史与当前 run 分组
- 当前 run 状态条
- 快捷重试 / 继续追问 / 固化为任务
- resultCards 与 run detail 的联动增强
- 可视化展示本次使用了哪些 skill / tool / integration

### 4. Skills 中心产品化

- 已安装 / 已启用 / 已绑定 三种状态清晰区分
- skill 详情页展示来源、版本、适用员工、依赖集成
- 员工配置时给出推荐 skill 组合

### 5. 员工模板化

落地模板能力：

- 从模板创建员工
- 将现有员工保存为模板
- 模板包含默认 prompt、skills、integrations、schedule
- 为后续"场景包"奠定基础

### 6. Legacy Schedule 代码移除

v0.15 已标记 @deprecated 的 legacy schedule API 在本版本完全移除：

- 删除 `upsertSchedule` / `runNow(employeeId)` / `clearSchedule`
- 删除 `employee_schedules` 表（数据已在 v0.15 迁移到 jobs）
- 清理 `AutomationService` 中 legacy 分发逻辑

---

## 验收标准

- [ ] 新用户可通过向导完成员工创建
- [ ] 员工列表可快速识别健康、异常、未完成配置状态
- [ ] chat 页成为主操作入口，而不只是消息查看页
- [ ] 技能绑定和技能状态对用户清晰可见
- [ ] 至少沉淀 2–3 个可复用员工模板
- [ ] 全部 legacy schedule 代码移除，不残留

---

## 明确不做项

- 复杂审批流
- 企业级权限矩阵
- 跨员工协同编排
- 组织级 SLA / 成本报表

---

# v0.17 — 运营体系与组织协同

## 版本定位

把数字员工从"单个可配置 agent"升级成"可运营的组织资源"。

---

## 核心目标

### 1. 自动化运营面板

构建自动化控制台，支持：

- job 列表、启停状态、下次运行时间、最近执行结果
- 连续失败统计
- 手动重跑、重试、暂停
- 目标是让自动化不再藏在员工详情内部，而成为运营层能力

### 2. 告警与恢复机制（轻量版）

优先支持：

- 连续失败告警
- 集成失效告警
- 长时间未执行告警
- 最近运行异常员工聚合视图

并提供基础恢复动作：重试、暂停 job、跳转 integration 配置、跳转 run detail。

### 3. 组织架构联动深化

- 部门下同时展示真人员工和数字员工
- 数字员工归属部门职责
- 人类员工与数字员工建立协作关系
- 支持"某个部门有哪些数字岗位"的组织表达

### 4. Run 运营视图

- 按员工统计成功率 / 按 job 统计失败率
- 按触发来源统计 / 按时间区间看趋势
- 最近异常聚合

### 5. 场景包架构 + 1 个示范

**不再批量沉淀场景包**，而是：

- 定义场景包数据结构（prompt + skills + integration requirements + recommended schedules + sample outputs）
- 定义场景包导入/导出接口
- 落地 1 个完整示范场景包（如"数据日报助理"），验证整个链路
- 为 v0.18 的批量场景包积累奠定基础

---

## 验收标准

- [ ] 自动化运行可从 UI 批量管理
- [ ] 异常员工与异常 job 可被快速定位
- [ ] 部门 / 真人员工 / 数字员工关系在 UI 中可清晰呈现
- [ ] 运营者可查看成功率、失败率、异常趋势
- [ ] 1 个示范场景包可正常导入并创建员工

---

## 明确不做项

- 复杂多级审批链
- 全量企业审计平台
- 大规模多员工协同图编排
- 完整成本治理体系
- 批量场景包沉淀

---

# v0.18 — 平台化扩展与治理基础

## 版本定位

让数字员工平台具备"可扩展、可审计（轻量）"的治理能力。

**注意**：用户身份/RBAC/登录体系暂不在本路线图范围内。本版本聚焦无需用户身份的治理能力。

---

## 核心目标

### 1. 操作审计日志（轻量版）

不依赖用户身份系统，记录系统级操作审计：

- 配置变更（员工/技能/集成/密钥修改）
- 手动执行 / 重试 / 暂停
- 员工删除 / 归档
- 以操作时间、操作类型、目标对象为核心字段

### 2. Secrets 治理升级

- secret 按 scope 管理（已有基础）
- 引用关系可追踪（哪些员工/skills/integrations 依赖该 secret）
- 密钥轮换能力（利用 v0.15 预留的 key version header）
- 使用审计（何时被哪个 run 读取过）

### 3. 多员工单向触发（最简版）

**不做完整的 workflow 编排**，仅实现：

- 员工 A 执行完成后可配置触发员工 B
- 单向、单跳、无条件触发
- run 之间可追踪上下游关系
- 为未来完整编排预留扩展点

### 4. 平台扩展边界稳定化

进一步稳定平台边界：

- API 层只做输入输出
- service / application 层负责编排
- engine gateway 负责 runtime 边界
- repository 负责持久化
- UI model 负责展示模型

在此基础上逐步整理：

- extension point
- plugin point
- scenario package 接入规范
- integration adapter 规范

### 5. 批量场景包沉淀

基于 v0.17 的架构和示范，批量沉淀：

- 客服助理
- 数据日报助理
- 运维巡检助理
- 组织同步助理

### 6. 组织级分析视图

- 哪些员工最常用 / 哪些任务最稳定
- 哪些集成最易出问题
- 哪些部门数字化程度最高
- 调用量 / 成功率概览

---

## 验收标准

- [ ] 关键配置变更具备可追踪审计记录
- [ ] secrets 具备治理能力而不只是存储能力
- [ ] 至少有一类多员工单向触发场景可稳定运行
- [ ] 平台边界可以支撑后续扩展与二次开发
- [ ] 3+ 个场景包可正常使用

---

## 明确不做项

- 用户登录 / RBAC 权限体系
- 完整的 workflow/pipeline 编排引擎
- 无边界开放式 agent swarm
- 复杂组织治理功能一次性全量上线
- 成本核算体系

---

# 四个版本的整体节奏

| 版本 | 核心关键词 | 核心方向 |
|------|-----------|---------|
| `v0.15` | 稳态化 + 治债 | 主链路稳定、数据一致、调度收敛、技术债治理、可观测打底 |
| `v0.16` | 产品化 | 员工创建向导、健康标签 UI、chat 工作台、模板化、移除 legacy |
| `v0.17` | 运营化 | 自动化控制台、异常治理、组织协同、场景包架构 + 示范 |
| `v0.18` | 治理 + 扩展 | 审计、secret 治理、单向触发、扩展边界、批量场景包 |

---

## 推荐发布顺序

1. **v0.15：先把平台主链路稳住，同时治理技术债**
2. **v0.16：在干净的基础上做员工产品化**
3. **v0.17：把运营体系搭起来**
4. **v0.18：补治理能力与平台化扩展**

这个顺序的价值在于：

- v0.15 治理技术债后，v0.16 的产品化开发效率显著提升
- v0.16 移除 legacy 后，v0.17 的运营面板不再受历史包袱干扰
- 每个版本都能形成清晰、可对外讲述的产品价值

---

## 对应当前代码结构的主战场

### v0.15 重点文件域

- `server/api/employees/index.post.ts` → 服务化改造
- `server/engine/employee-workspace.ts` → 事务保护
- `server/db/schema.ts` + 新增 `migrations/` → 数据治理
- `server/services/automation-service.ts` → 调度收敛
- `server/engine/NextclawEngineGateway.ts` → 移除 heartbeat 管理
- `server/services/employee-run-service.ts` → 错误分类
- `app/pages/employees/index.vue` → 组件拆分
- `shared/ui-models.ts` → 健康模型类型定义

### v0.16 重点文件域

- v0.15 的 `EmployeeCreateForm` → 升级为 `EmployeeCreateWizard`
- `app/pages/employees/[id]/chat.vue` → 工作台化
- `shared/ui-models.ts` → 健康 UI 标签
- skills 管理相关页面
- 员工模板相关 server/services / repositories / UI 页面

### v0.17 重点文件域

- automation / runs / security / org sync 相关 service 与页面
- `server/db/schema.ts`（告警表等）
- `app/pages/runs/*`
- 组织结构相关 repositories / api / pages
- 场景包数据结构定义与导入导出

### v0.18 重点文件域

- `server/engine/*`
- `server/services/*`
- `server/repositories/*`
- 审计日志相关表结构与 API
- secrets 治理相关页面
- 多员工触发编排层

---

## 结论

这条路线图不是简单的功能堆叠，而是围绕当前项目代码结构逐步完成四次升级：

- `v0.15` 解决平台稳定性、主链路一致性和关键技术债务
- `v0.16` 在干净基础上解决数字员工产品化与可配置体验
- `v0.17` 解决运营能力与组织协同表达
- `v0.18` 解决治理能力、扩展边界与平台演进能力

如果按这个顺序推进，数字员工项目会从一个"已有雏形的 agent 应用"，逐步成长为"具备企业落地能力的数字劳动力平台"。
