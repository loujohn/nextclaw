# v0.13.87-dingtalk-group-mention-toggle

## 迭代完成说明

- 在数字员工平台的 DingTalk 集成编辑器中，为每个群路由新增“该群消息必须 @ 机器人后才处理”开关。
- 新增群级 `mentionPatterns` 编辑能力；当群级开启必须 `@` 时，可单独配置该群的触发关键字，不再只能继承账号级规则。
- 抽离 DingTalk 编辑器的数据转换逻辑到独立 helper，避免在页面组件中继续堆积路由/配置组装逻辑。
- 复用现有 DingTalk 配置结构：群级开关仍然落在 `channels.dingtalk.accounts.<accountId>.groups.<groupId>`，无需修改 core 或插件契约。

## 测试/验证/验收方式

- 单元测试：
  - `pnpm -C packages/nextclaw-digital-employee exec vitest run tests/dingtalk-editor-model.test.ts tests/dingtalk-config-storage.test.ts`
- 定向 lint：
  - `pnpm -C packages/nextclaw-digital-employee exec eslint app/pages/integrations/index.vue shared/dingtalk-editor-model.ts tests/dingtalk-editor-model.test.ts --max-warnings=0`
- 类型检查与构建：
  - `pnpm -C packages/nextclaw-digital-employee tsc`
  - `pnpm -C packages/nextclaw-digital-employee build`
- 冒烟：
  - 在 `/tmp` 下运行最小脚本，验证群级 `requireMention=false` 能被编辑器模型正确回填与持久化，输出 `DINGTALK_GROUP_MENTION_UI_SMOKE_OK`

## 发布/部署方式

- 本次仅涉及 digital-employee 平台的 DingTalk 集成编辑器与配置组装逻辑，不涉及数据库 migration。
- 重新构建并重启 digital-employee 服务即可。
- 服务更新后，在“集成中心 -> DingTalk”中重新保存目标群配置，保存动作会触发 channel runtime reload。

## 用户/产品视角的验收步骤

1. 打开“集成中心”，进入 DingTalk 配置编辑器。
2. 在目标群绑定项里关闭“该群消息必须 @ 机器人后才处理”。
3. 保存配置。
4. 在该群中发送一条普通消息，不 `@` 机器人。
5. 确认消息仍会进入绑定员工链路并得到回复。
