# v0.13.79-digital-employee-dingtalk-shared-source

## 迭代完成说明（改了什么）

- 迭代目标：在 nextclaw-digital-employee 的“集成中心”落地与“消息渠道 > DingTalk”一致的钉钉配置能力，并保证两处完全同源。
- 第一阶段（功能新增）：
  - 在“集成中心”新增钉钉编辑能力，字段与行为对齐“消息渠道 DingTalk”：`enabled`、`clientId`、`clientSecret`（留空不覆盖）、`allowFrom`。
  - 新增后端接口：`GET /api/integrations/dingtalk`、`PUT /api/integrations/dingtalk`，用于集成中心读取/保存钉钉配置。
  - 集成中心列表中的钉钉卡片状态改为读取钉钉配置（是否启用、展示标识），保存后刷新卡片状态。
  - 页面交互采用项目已有侧滑编辑风格，保持数字员工项目 UI 体系一致。
- 第二阶段（同源修复）：
  - 发现问题：集成中心展示的 `clientId` 与消息渠道不一致，根因为运行时进程内 `NEXTCLAW_HOME` 被数字员工网关覆盖，导致读取到另一份 `config.json`。
  - 修复方式：在 `packages/nextclaw-digital-employee/server/runtime/dingtalk-config.ts` 中固定钉钉配置读取/写回路径到共享配置源（优先服务启动时 `NEXTCLAW_HOME`，否则回退 `~/.nextclaw/config.json`）。
  - `getDingTalkChannelConfig` 与 `updateDingTalkChannelConfig` 均使用同一显式 `configPath`；`saveConfig` 也写回同一路径，确保集成中心与消息渠道读写同源。
  - 同步修复 `packages/nextclaw-digital-employee/server/api/integrations/index.get.ts` 的类型问题（`name` 保持 `string`）。
- 结果：实现“同一功能在不同页面的不同样式展示”，并保证两处数据源、保存语义、结果表现一致。

## 测试/验证/验收方式

- 静态检查：
  - 对以下文件执行问题检查并确认无新增错误：
    - `packages/nextclaw-digital-employee/server/runtime/dingtalk-config.ts`
    - `packages/nextclaw-digital-employee/server/api/integrations/index.get.ts`
    - `packages/nextclaw-digital-employee/server/api/integrations/dingtalk.get.ts`
    - `packages/nextclaw-digital-employee/server/api/integrations/dingtalk.put.ts`
    - `packages/nextclaw-digital-employee/app/pages/integrations/index.vue`
- 功能冒烟（新增能力）：
  - 进入“集成中心”，点击钉钉卡片“编辑配置”，确认弹窗可正常打开。
  - 验证字段完整性：开关、Client ID、Client Secret、Allow From 标签增删。
  - 保存时验证语义：`clientSecret` 留空不覆盖，输入值时可更新。
- 一致性冒烟（同源修复）：
  - 打开“消息渠道”查看 DingTalk `clientId`。
  - 打开“集成中心”查看钉钉配置，确认 `clientId` 与“消息渠道”一致。
  - 在“集成中心”修改并保存后，返回“消息渠道”确认字段同步一致。
- 说明：本次不涉及数据库 migration；验证重点为“功能可用 + 同源一致性 + 保存语义一致”。

## 发布/部署方式

- 代码合并后按现有 digital-employee 运行方式重启服务进程，使运行时加载最新逻辑。
- 若使用开发模式：在项目根目录执行对应 dev 命令并确保进程已重启。
- 本次不涉及数据库 migration，不涉及额外发布组件。

## 用户/产品视角的验收步骤

1. 进入“集成中心”，点击钉钉卡片的编辑入口，确认弹窗样式与项目既有编辑体验一致。
2. 在弹窗内查看字段：启用开关、Client ID、Client Secret、Allow From，确认与“消息渠道 DingTalk”配置项一致。
3. 进入“消息渠道”，记录当前 DingTalk 的 `clientId`。
4. 回到“集成中心”，确认显示同一个 `clientId`。
5. 在“集成中心”修改钉钉配置并保存，再回到“消息渠道”核对更新结果一致。
6. 仅修改其它字段且 `clientSecret` 留空时，确认已存在密钥不会被清空。
7. 刷新两个页面后再次核对，确认不是前端缓存导致的一次性一致。
