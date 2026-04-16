# 迭代完成说明

- 将数字员工“配置”-“工作空间”与独立工作空间页统一重构为真实员工目录树视图，直接映射 `packages/nextclaw-digital-employee/.nextclaw-digital-employee/agents/<employee-code>` 下的文件结构。
- 新增统一工作空间服务与 API：目录树、文件详情、原始下载、memory 文本保存、图片替换全部走同一条协议链路；上传文件不再单独按日期树展示，而是按真实目录位置展示。
- 收紧权限规则：仅 `memory/` 下文本文件允许编辑保存；仅员工工作空间同级目录中的图片文件允许替换保存；其余文件只读；当前不支持预览的文件会明确提示“请下载后查看”。
- 上传文件列表改为只显示文件名，并补充来源信息；详情区同步显示来源会话、来源消息与发送文本。

# 测试/验证/验收方式

- 单元测试：`pnpm --dir packages/nextclaw-digital-employee test tests/employee-workspace-file-service.test.ts`
- 应用级类型校验：`cd packages/nextclaw-digital-employee && pnpm exec nuxi typecheck`
- 静态问题检查：确认 `app/components/employee/EmployeeWorkspacePanel.vue`、`app/pages/employees/[id]/config.vue`、`app/pages/employees/[id]/workspace.vue`、`server/services/employee-workspace-file-service.ts` 无新增错误。
- 冒烟说明：本次未在本地启动 Nuxt UI 做交互冒烟，改以统一服务定向测试 + Nuxt typecheck 作为本轮最小充分验证。

# 发布/部署方式

- 本次变更仅涉及 `packages/nextclaw-digital-employee` 的前后端工作空间模块，无数据库结构变更。
- 按常规数字员工前端/服务端发布流程部署 `packages/nextclaw-digital-employee` 即可。
- 远程 migration：不适用，本次未触达数据库 schema 或后端迁移链路。

# 用户/产品视角的验收步骤

1. 进入任一员工的“配置”页，切换到“工作空间”标签，确认左侧目录树与该员工 agents 目录实际结构一致。
2. 打开 `memory/` 下的 Markdown 或文本文件，进入编辑模式修改并保存，确认刷新后内容仍存在。
3. 打开 `memory/` 以外的普通文本文件，确认只能预览和下载，不能进入编辑保存。
4. 打开工作空间中的图片文件，选择一张新图片并保存，确认预览更新且刷新后仍为新图片。
5. 打开 `uploadFile/` 下的上传文件，确认列表只显示文件名与来源；若为当前系统不支持预览的类型，会显示下载提示而不是错误内容。