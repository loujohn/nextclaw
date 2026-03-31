# 数字员工平台 v0.15–v0.18 版本路线图

**日期**: 2026-03-30
**状态**: Draft
**适用范围**: `packages/nextclaw-digital-employee`, `@nextclaw/core`

---

## 目标

将当前数字员工项目从“功能已具备基础形态”推进到“可稳定交付、可运营管理、可企业化扩展”的产品平台。

本路线图基于当前代码结构与已完成迭代状态制定，重点参考：

- `packages/nextclaw-digital-employee/server/services/automation-service.ts`
- `packages/nextclaw-digital-employee/server/api/employees/index.post.ts`
- `packages/nextclaw-digital-employee/server/engine/employee-workspace.ts`
- `packages/nextclaw-digital-employee/server/repositories/employee-repository.ts`
- `packages/nextclaw-digital-employee/shared/ui-models.ts`
- `packages/nextclaw-digital-employee/app/pages/employees/index.vue`
- `packages/nextclaw-digital-employee/app/pages/employees/[id]/chat.vue`
- `packages/nextclaw-digital-employee/server/db/schema.ts`
- `docs/logs/v0.14.8-skills-visibility-streaming-fix/README.md`

路线图设计遵循以下节奏：

1. **v0.15：平台主链路稳态化**
2. **v0.16：数字员工体验产品化**
3. **v0.17：运营体系与组织协同**
4. **v0.18：企业治理与平台化扩展**

---

## 当前状态判断

当前项目已经具备以下基础能力：

- 数字员工基础 CRUD 与工作区初始化
- 员工技能绑定与技能可见性过滤
- 聊天对话、推理过程、工具调用和结果卡片展示
- 自动化调度与 job / heartbeat 支撑
- run_records / run_events 可观测数据模型
- integrations / secrets 数据表基础
- 组织部门与真人员工、人机共存的数据建模

同时，当前代码结构暴露出几类典型优化空间：

- 路由层仍承担部分编排逻辑，服务边界还可以进一步收敛
- 自动化调度模型已经较强，但主路径标准化仍需加强
- 数据约束、状态治理、索引策略仍有工程化补强空间
- chat 页已经接近工作台，但仍可进一步产品化
- 员工创建与配置路径对最终用户仍偏“技术配置导向”
- 组织协同、权限、审计、运营分析尚未形成完整平台层能力

因此，这四个版本不以“堆新功能”为目标，而以“逐层完成平台化演进”为主线。

---

# v0.15 — 平台主链路稳态化

## 版本定位

把数字员工从“功能可用”推进到“主链路稳定可控”。

本版本重点不是继续铺开新能力，而是优先收敛几个关键闭环：

- 员工创建 / 更新 / 删除闭环
- chat → run → result 闭环
- schedule / job → run 闭环
- integrations / secrets 主链路闭环
- 数据状态一致性闭环

---

## 核心目标

### 1. 员工生命周期服务化

当前员工创建流程中，API handler 仍承担了部分应用编排职责，典型位置为：

- `packages/nextclaw-digital-employee/server/api/employees/index.post.ts`

应在本版本中将以下职责抽离到 service / application 层：

- 创建员工时的 repo 落库
- workspace 初始化
- 默认上下文与默认资源准备
- 失败时的回滚 / 补偿策略
- 删除员工时的调度与 workspace 清理逻辑
- 2

对应支撑文件包括：

- `packages/nextclaw-digital-employee/server/engine/employee-workspace.ts`
- `packages/nextclaw-digital-employee/server/repositories/employee-repository.ts`

目标是让路由层只负责输入输出，避免业务状态散落在 handler 中。

### 2. 数据模型与状态治理

基于现有 schema：

- `packages/nextclaw-digital-employee/server/db/schema.ts`

本版本应完成一轮平台数据治理补强，包括：

- employee / skill binding / schedule job 的唯一性约束补强
- run_records / run_events 的查询索引补强
- employee status、job status、integration status 的枚举收敛
- 删除语义统一：明确 hard delete / soft delete / archive 的适用边界

目标不是做大规模数据层重构，而是为后续运营、审计、统计打好稳定基础。

### 3. 自动化调度主路径收敛

当前：

- `packages/nextclaw-digital-employee/server/services/automation-service.ts`

已经同时承载 cron、every、heartbeat、legacy compatibility 等多种职责。`v0.15` 应优先将内部主路径收敛到更清晰的 job-centric 模型：

- job 作为主实体
- employee schedule 作为兼容视图或轻量包装
- `runNow / restart / clear / heartbeat` 统一围绕 job 组织
- 保持旧接口兼容，但内部语义尽量统一

目标是降低未来告警、重试、多任务扩展时的复杂度。

### 4. Secrets / Integrations 进入主流程

虽然 schema 已有：

- `integration_connections`
- `secrets`

但本版本重点不只是“有表和页面”，而是确保它们真正进入执行主流程：

- 运行前校验所需 integration 是否可用
- 区分权限错误、secret 缺失、外部平台错误
- 将错误从技术异常提升为可操作提示
- 让 chat / run / 集成配置之间形成稳定跳转关系

可直接受益的前端位置：

- `packages/nextclaw-digital-employee/app/pages/employees/[id]/chat.vue`

### 5. Run / Event 可观测性补强

基于：

- `run_records`
- `run_events`

本版本应统一：

- run status 流转语义
- event_type 分类规范
- summary / result_json 生成口径
- run detail 展示字段与展示顺序

目标是让 run detail 页面成为稳定的排障入口，而不是仅作为记录展示。

---

## 主要改动模块

- `server/api/employees/`*
- `server/services/*`
- `server/engine/employee-workspace.ts`
- `server/services/automation-service.ts`
- `server/db/schema.ts`
- `server/repositories/*`
- `app/pages/employees/[id]/chat.vue`
- `app/pages/runs/*`

---

## 建议验收标准

- 创建一个员工后，DB、workspace、默认状态保持一致
- 停用或删除员工后，不残留失控 schedule / job
- 一次 chat run 可完整追踪输入、执行过程、结果和失败原因
- integration / secret 缺失时，错误语义清晰且可引导处理
- run list / run detail 成为可靠排障入口

---

## 明确不做项

- 员工模板市场
- 多员工协作
- 全量 RBAC 体系
- 复杂运营报表
- 组织级协同能力深化

---

# v0.16 — 数字员工体验产品化

## 版本定位

把数字员工从“后台可运行对象”升级成“可配置、可理解、可复用的产品单元”。

如果 `v0.15` 重点在后端主链路收敛，那么 `v0.16` 重点就是把员工本身做成真正可交付的产品形态。

---

## 核心目标

### 1. 员工创建体验重构

当前员工创建表单已经包含大量底层字段，如 prompt、skills、schedule、boot content 等。这说明产品能力在增长，但创建体验仍偏配置面板模式。

建议本版本将创建流程升级为分步式向导：

1. 基本信息
2. 角色设定
3. 绑定技能
4. 绑定集成
5. 自动化设置
6. 启动检查 / 完成

重点页面：

- `packages/nextclaw-digital-employee/app/pages/employees/index.vue`

目标是降低上手门槛，使“创建员工”从工程操作转向产品操作。

### 2. 员工健康模型落地

当前列表页已经具备基础 health 数据：

- `hasSkills`
- `hasSchedule`
- `lastStatus`

应在本版本升级为更清晰的健康标签体系，例如：

- 未完成配置
- 可运行
- 运行异常
- 集成异常
- 长时间未执行
- 最近执行成功

目标是将员工列表从“信息页”升级为“运营页”。

### 3. Chat 页升级为工作台

当前 chat 页已经支持：

- reasoning 折叠
- tool calls 折叠
- tool result 折叠
- result cards
- abort

核心文件：

- `packages/nextclaw-digital-employee/app/pages/employees/[id]/chat.vue`

本版本建议继续产品化：

- chat 历史与当前 run 分组
- 当前 run 状态条
- 快捷重试 / 继续追问 / 固化为任务
- resultCards 与 run detail 的联动增强
- 可视化展示本次使用了哪些 skill / tool / integration

目标是将聊天页升级为数字员工工作台。

### 4. Skills 中心产品化

近期底层 skills 机制已明显稳定，包括：

- 内置覆盖
- 同名冲突拒绝
- skills 可见性过滤
- 前端流式聊天修复

可参考：

- `docs/logs/v0.14.8-skills-visibility-streaming-fix/README.md`

`v0.16` 重点应转向产品层：

- 已安装 / 已启用 / 已绑定 三种状态清晰区分
- skill 详情页展示来源、版本、适用员工、依赖集成
- 员工配置时给出推荐 skill 组合

### 5. 员工模板化

当前工作区模板机制已具备基础：

- `SOUL.md`
- `IDENTITY.md`
- 模板 seed 逻辑

核心文件：

- `packages/nextclaw-digital-employee/server/engine/employee-workspace.ts`

本版本建议落地模板能力：

- 从模板创建员工
- 将现有员工保存为模板
- 模板包含默认 prompt、skills、integrations、schedule
- 为后续“场景包”奠定基础

---

## 主要改动模块

- `app/pages/employees/index.vue`
- `app/pages/employees/[id]/chat.vue`
- `shared/ui-models.ts`
- 员工模板相关 server/services / repositories / UI 页面
- 技能管理相关 server/api + UI 页面

---

## 建议验收标准

- 新用户可通过向导完成员工创建
- 员工列表可快速识别健康、异常、未完成配置状态
- chat 页成为主操作入口，而不只是消息查看页
- 技能绑定和技能状态对用户清晰可见
- 至少沉淀 2–3 个可复用员工模板

---

## 明确不做项

- 复杂审批流
- 企业级权限矩阵
- 跨员工协同编排
- 组织级 SLA / 成本报表

---

# v0.17 — 运营体系与组织协同

## 版本定位

把数字员工从“单个可配置 agent”升级成“可运营的组织资源”。

从这个版本开始，重心从单员工体验转向批量管理、异常治理、组织协同与业务场景沉淀。

---

## 核心目标

### 1. 自动化运营面板

基于：

- `packages/nextclaw-digital-employee/server/services/automation-service.ts`
- `run_records / run_events`

构建自动化控制台，支持：

- job 列表
- 启停状态
- 下次运行时间
- 最近执行结果
- 连续失败统计
- 手动重跑
- 重试 / 暂停

目标是让自动化不再藏在员工详情内部，而成为运营层能力。

### 2. 告警与恢复机制

建议本版本先做轻量告警，不急于做完整通知中心。优先支持：

- 连续失败告警
- 集成失效告警
- 长时间未执行告警
- 最近运行异常员工聚合视图

并提供基础恢复动作：

- 重试
- 暂停 job
- 跳转到 integration 配置
- 跳转到 run detail

### 3. 组织架构联动深化

当前 schema 已经同时建模：

- departments
- human_employees
- employees

这意味着组织结构、真人员工、数字员工的共存基础已经具备。

`v0.17` 建议将这一关系做实：

- 部门下同时展示真人员工和数字员工
- 数字员工归属部门职责
- 人类员工与数字员工建立协作关系
- 支持“某个部门有哪些数字岗位”的组织表达

### 4. Run 运营视图

在 `v0.15` 已完成基础可观测性的前提下，`v0.17` 可以继续向运营视图升级：

- 按员工统计成功率
- 按 job 统计失败率
- 按触发来源统计
- 按时间区间看趋势
- 最近异常聚合

### 5. 场景包 / 行业模板雏形

依托 `v0.16` 的模板化能力，本版本可以开始沉淀面向业务场景的场景包，例如：

- 客服助理
- 数据日报助理
- 运维巡检助理
- 组织同步助理

每个场景包包含：

- prompt
- skills
- integration requirements
- recommended schedules
- sample outputs

目标是让模板从“技术模板”升级为“业务场景资产”。

---

## 主要改动模块

- automation / runs / security / organization 相关页面
- `server/services/automation-service.ts`
- `server/db/schema.ts`
- `server/repositories/*`
- `app/pages/runs/*`
- `app/pages/security/*`
- 组织结构相关页面与 API

---

## 建议验收标准

- 自动化运行可从 UI 批量管理
- 异常员工与异常 job 可被快速定位
- 部门 / 真人员工 / 数字员工关系在 UI 中可清晰呈现
- 运营者可查看成功率、失败率、异常趋势
- 模板开始具备业务场景复用价值

---

## 明确不做项

- 复杂多级审批链
- 全量企业审计平台
- 大规模多员工协同图编排
- 完整成本治理体系

---

# v0.18 — 企业治理与平台化扩展

## 版本定位

让数字员工平台具备“企业可控、可审计、可扩展”的治理能力。

本版本不是简单增加功能，而是补齐平台要走向企业落地所必须具备的治理边界。

---

## 核心目标

### 1. RBAC 与审计

企业化阶段应优先为以下动作建立权限边界：

- 创建 / 编辑 / 删除员工
- 修改 skills 绑定
- 修改 integrations / secrets
- 手动运行 / 暂停 job
- 查看敏感运行详情

同时落地基础审计日志：

- 配置变更
- 集成变更
- 密钥变更
- 手动执行 / 重试 / 暂停
- 员工删除 / 归档

### 2. Secrets 治理升级

在 `v0.15` secrets 已进入主流程之后，`v0.18` 再做治理升级：

- secret 按 scope 管理
- 引用关系可追踪
- 轮换能力
- 使用审计
- 可查看“哪些员工 / skills / integrations 依赖该 secret”

### 3. 多员工协作 / 编排

此能力不建议过早引入，但到 `v0.18` 可以开始做轻量版本，例如：

- 员工 A 产出作为员工 B 的输入
- 任务链式编排
- 固定场景下的二段式流程
- run 之间可追踪上下游关系

目标是让平台从“单员工执行器”升级为“组织任务系统”。

### 4. 平台扩展边界稳定化

回到既有架构原则：

- engine-facing logic 应通过 `server/engine` 收敛

本版本应进一步稳定平台边界：

- API 层只做输入输出
- service / application 层负责编排
- engine gateway 负责 runtime 边界
- repository 负责持久化
- UI model 负责展示模型

在此基础上可逐步整理：

- extension point
- plugin point
- scenario package 接入规范
- integration adapter 规范

### 5. 组织级分析与成本视图

在具备稳定运行与治理能力后，可补充经营视角：

- 哪些员工最常用
- 哪些任务最稳定
- 哪些集成最易出问题
- 哪些部门数字化程度最高
- 成本 / 调用量 / 成功率概览

---

## 主要改动模块

- `server/engine/*`
- `server/services/*`
- `server/repositories/*`
- 权限、安全、审计相关表结构与 API
- integrations / secrets / audit 相关 UI 页面
- 多员工协作相关运行编排层

---

## 建议验收标准

- 核心操作具备清晰权限边界
- 关键配置变更具备可追踪审计记录
- secrets 具备治理能力而不只是存储能力
- 至少有一类多员工协作场景可稳定运行
- 平台边界可以支撑后续扩展与二次开发

---

## 明确不做项

- 一次性构建超大而全的流程编排平台
- 无边界开放式 agent swarm
- 复杂组织治理功能一次性全量上线

---

# 四个版本的整体节奏


| 版本      | 核心关键词     | 核心方向                         |
| ------- | --------- | ---------------------------- |
| `v0.15` | 稳态化       | 主链路稳定、数据一致、调度收敛、可观测打底        |
| `v0.16` | 产品化       | 员工创建体验、健康模型、chat 工作台、模板化     |
| `v0.17` | 运营化       | 自动化控制台、异常治理、组织协同、场景包         |
| `v0.18` | 治理化 / 平台化 | RBAC、审计、secret 治理、多员工协作、扩展边界 |


---

## 推荐发布顺序

建议按以下顺序推进：

1. **v0.15：先把平台主链路稳住**
2. **v0.16：再把员工做成产品**
3. **v0.17：把运营体系搭起来**
4. **v0.18：补企业治理与平台化扩展**

这个顺序的价值在于：

- 不在基础不稳时过早做企业治理
- 不在产品体验未成型时过早做多员工协作
- 每个版本都能形成清晰、可对外讲述的产品价值

---

## 对应当前代码结构的主战场

### v0.15 重点文件域

- `packages/nextclaw-digital-employee/server/api/employees/index.post.ts`
- `packages/nextclaw-digital-employee/server/engine/employee-workspace.ts`
- `packages/nextclaw-digital-employee/server/db/schema.ts`
- `packages/nextclaw-digital-employee/server/services/automation-service.ts`

### v0.16 重点文件域

- `packages/nextclaw-digital-employee/app/pages/employees/index.vue`
- `packages/nextclaw-digital-employee/app/pages/employees/[id]/chat.vue`
- `packages/nextclaw-digital-employee/shared/ui-models.ts`
- skills 管理相关 server/api 与前端页面

### v0.17 重点文件域

- automation / runs / security / org sync 相关 service 与页面
- `packages/nextclaw-digital-employee/server/db/schema.ts`
- `app/pages/runs/`*
- `app/pages/security/*`
- 组织结构相关 repositories / api / pages

### v0.18 重点文件域

- `packages/nextclaw-digital-employee/server/engine/*`
- `packages/nextclaw-digital-employee/server/services/*`
- `packages/nextclaw-digital-employee/server/repositories/*`
- 权限、安全、审计、integration / secrets 相关页面与表结构

---

## 结论

这条路线图不是简单的功能堆叠，而是围绕当前项目代码结构逐步完成四次升级：

- `v0.15` 解决平台稳定性与主链路一致性
- `v0.16` 解决数字员工产品化与可配置体验
- `v0.17` 解决运营能力与组织协同表达
- `v0.18` 解决企业治理、扩展边界与平台演进能力

如果按这个顺序推进，数字员工项目会从一个“已有雏形的 agent 应用”，逐步成长为“具备企业落地能力的数字劳动力平台”。