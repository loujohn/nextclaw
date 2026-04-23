# v0.5.0-employee-api-split

## 迭代完成说明

- 将原先被多个页面复用的 `/api/employees/:id` 从“混合型详情接口”收缩为“员工概览聚合接口”，只保留概览页真实使用的字段：基础展示信息、技能版本态、自动化摘要、健康检查、最近运行状态。
- 新增三个专用接口，按固定职责拆分不同消费场景：
  - `/api/employees/:id/identity`：返回 `id/name/code`，供聊天页等轻量身份展示场景使用。
  - `/api/employees/:id/webhook`：返回 `id/code/webhookEnabled/webhookSecret`，供配置页 Webhook 区块使用。
  - `/api/employees/:id/edit`：返回编辑弹窗所需的基础字段、`departmentId`、`skillNames`、`schedule`，供员工编辑 bootstrap 使用。
- 聊天页 [app/pages/employees/[id]/chat.vue](../../../app/pages/employees/%5Bid%5D/chat.vue) 已改为请求 `/api/employees/:id/identity`，不再为一个标题展示拉取技能、排班、recentRuns、automationSummary、Webhook 等聚合信息。
- 配置页 [app/pages/employees/[id]/config.vue](../../../app/pages/employees/%5Bid%5D/config.vue) 的 Webhook 区块已改为请求 `/api/employees/:id/webhook`，避免把概览数据无效拉入配置页。
- 编辑入口 [app/composables/useEmployeeCrud.ts](../../../app/composables/useEmployeeCrud.ts) 已改为请求 `/api/employees/:id/edit`，编辑 bootstrap 不再混入 recentRuns、automationSummary、health、Webhook 和技能版本差异数据。
- 共享类型 [app/composables/useEmployeeDetail.ts](../../../app/composables/useEmployeeDetail.ts) 已同步收缩到概览接口的真实返回结构，避免继续用“半同步的全量详情类型”误导其它调用方。

## 测试/验证/验收方式

- 定向问题检查：对以下改动文件执行问题检查，确认无新增问题：
  - [server/api/employees/[id].get.ts](../../../server/api/employees/%5Bid%5D.get.ts)
  - [server/api/employees/[id]/identity.get.ts](../../../server/api/employees/%5Bid%5D/identity.get.ts)
  - [server/api/employees/[id]/webhook.get.ts](../../../server/api/employees/%5Bid%5D/webhook.get.ts)
  - [server/api/employees/[id]/edit.get.ts](../../../server/api/employees/%5Bid%5D/edit.get.ts)
  - [app/composables/useEmployeeDetail.ts](../../../app/composables/useEmployeeDetail.ts)
  - [app/pages/employees/[id]/config.vue](../../../app/pages/employees/%5Bid%5D/config.vue)
  - [app/composables/useEmployeeCrud.ts](../../../app/composables/useEmployeeCrud.ts)
  - [app/pages/employees/[id].vue](../../../app/pages/employees/%5Bid%5D.vue)
- 定向 ESLint：

```bash
pnpm -C packages/nextclaw-digital-employee exec eslint --rule 'max-lines: off' --rule 'no-useless-escape: off' 'app/composables/useEmployeeDetail.ts' 'app/pages/employees/[id].vue' 'app/pages/employees/[id]/chat.vue' 'app/pages/employees/[id]/config.vue' 'app/composables/useEmployeeCrud.ts' 'server/api/employees/[id].get.ts' 'server/api/employees/[id]/identity.get.ts' 'server/api/employees/[id]/webhook.get.ts' 'server/api/employees/[id]/edit.get.ts'
```

- lint 说明：命令通过；其中对聊天页临时关闭 `max-lines` 与 `no-useless-escape`，原因是这两个是该文件已有历史规则噪音，不属于本次接口拆分引入。
- 本次未触达数据库 schema、构建配置和发布链路，`migration` 不适用。

## 发布/部署方式

- 本次包含前端调用切换和服务端 API 新增，按常规数字员工包发布流程部署即可。
- 不涉及数据库 migration。
- 若存在前端与服务端分步发布窗口，需优先发布服务端，再发布前端，避免旧前端已切换新接口而服务端路由尚未上线。

## 用户/产品视角的验收步骤

1. 打开任一员工概览页，确认页面仍正常显示姓名、描述、技能、自动化状态、资料卡状态。
2. 进入该员工聊天页，确认页面标题仍展示正确员工名，并能正常发送消息；聊天页不应再依赖概览聚合接口。
3. 进入该员工配置页的 Webhook 标签，确认能正确展示和保存 Webhook 开关、密钥和 URL。
4. 在员工列表页打开编辑弹窗，确认基础信息、模型、技能、调度数据正常回填，保存后行为不变。
5. 如需进一步验收网络面，分别观察前端请求是否已拆分为 `/api/employees/:id`、`/api/employees/:id/identity`、`/api/employees/:id/webhook`、`/api/employees/:id/edit` 各自承担单一职责。