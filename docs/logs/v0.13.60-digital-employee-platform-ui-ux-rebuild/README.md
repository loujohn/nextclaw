# v0.13.60-digital-employee-platform-ui-ux-rebuild

## 迭代完成说明

- 完成 `packages/nextclaw-digital-employee` 的全局产品化重构，统一为“运营驾驶舱 + AI 工作台”的视觉与交互体系。
- 重写首页、员工中心、员工工作台、聊天页、技能中心、运行中心、集成中心，补齐统一导航、状态卡、空态、错误态、结果卡片与响应式布局。
- 扩展平台 UI 视图模型与 API 聚合返回：
  - `GET /api/dashboard` 增加异常摘要、快捷动作、业务化运行聚合
  - `GET /api/employees/:id` 增加工作台健康状态与最近结果上下文
  - `POST /api/employees/:id/chat` 返回 `messages`、`resultCards`、`runSummary`
  - 新增 `GET /api/employees/:id/chat/history`
  - `GET /api/runs`、`GET /api/runs/:id` 返回业务化运行摘要
  - `GET /api/integrations` 返回模型、禅道、钉钉状态卡
- 扩展 `NextclawEngineGateway` 会话历史能力，并在运行服务中补齐消息历史与结果卡片沉淀。
- 系统化收口根级 `.gitignore`，新增 `.superpowers/`、Nuxt/Nitro 构建产物、本地 SQLite/DB 文件、数字员工平台运行目录等忽略项。
- 相关规划文档继续沿用并在本迭代中落地实现：
  - [数字员工平台设计方案](../../../superpowers/specs/2026-03-11-digital-employee-platform-design.md)
  - [数字员工平台实施计划](../../../superpowers/plans/2026-03-11-digital-employee-platform.md)

## 测试/验证/验收方式

- 代码验证：
  - `pnpm -C packages/nextclaw-digital-employee lint`
  - `pnpm -C packages/nextclaw-digital-employee test`
  - `pnpm -C packages/nextclaw-digital-employee tsc`
  - `pnpm -C packages/nextclaw-digital-employee build`
- UI 冒烟：
  - 使用构建产物启动独立服务后，实际访问 `/`、`/employees`、`/employees/:id`、`/employees/:id/chat`、`/skills`、`/runs`、`/integrations`
  - 验证三步创建员工可完成并跳转工作台
  - 验证聊天页可展示会话历史、错误态、结果卡片容器和运行联动
  - 验证技能中心、运行中心、集成中心均按新版 IA 正常渲染
- 仓库收口验证：
  - `git check-ignore -v .superpowers packages/nextclaw-digital-employee/.output packages/nextclaw-digital-employee/.nextclaw-digital-employee/platform.sqlite`

## 发布/部署方式

- 本次变更为数字员工平台前后端一体重构，无独立线上发布动作。
- 本地开发启动：
  - `pnpm -C packages/nextclaw-digital-employee dev`
- 生产构建与启动：
  - `pnpm -C packages/nextclaw-digital-employee build`
  - `node packages/nextclaw-digital-employee/.output/server/index.mjs`
- 若需要实际聊天能力，需提供模型环境变量：
  - `NEXTCLAW_MODEL`
  - `NEXTCLAW_PROVIDER_API_BASE`
  - `NEXTCLAW_PROVIDER_API_KEY`

## 用户/产品视角的验收步骤

1. 打开首页，确认它已经变成运营驾驶舱，而不是技术索引页：能看到今日态势、快捷动作、即将运行与最新结果。
2. 进入员工中心，按“三步创建流程”新建一个员工，并确认创建后自动跳转到员工工作台。
3. 在员工工作台查看概览、技能、自动任务和最近结果；确认布局已经是面向业务用户的工作台形态。
4. 进入聊天页，发送一条任务指令；确认页面会展示消息流、错误恢复入口，以及用于消费结果的结构化卡片区域。
5. 打开技能中心，确认主视图是技能目录，能看到用途、状态、来源类型、引用员工，导入不再占据主视觉。
6. 打开运行中心，确认先看到业务化运行摘要，再按需查看详情与原始结果。
7. 打开集成中心，确认至少可以看到模型、禅道、钉钉三类关键连接的状态、摘要和下一步动作。
