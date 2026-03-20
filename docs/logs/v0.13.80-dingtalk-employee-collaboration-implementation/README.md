# v0.13.80-dingtalk-employee-collaboration-implementation

## 迭代完成说明

- 将 `@nextclaw/core` 的 DingTalk 配置模型扩展为多账号结构，支持 `defaultAccountId`、`accounts.*`、群策略与 mention 规则，并允许 `bindings` 持久化路由元数据。
- 将内置 `@nextclaw/channel-plugin-dingtalk` 从 runtime wrapper 改为真实插件实现，支持多机器人账号、私聊/群聊路由元数据归一化，以及按 `accountId + peer` 发送回复。
- 数字员工平台新增 DingTalk 多账号配置、群路由读取/写入、员工级 DingTalk 绑定 API，并把集成中心与员工详情页改为可配置钉钉入口与群绑定的 UI。

## 测试/验证/验收方式

- 单测：
  - `pnpm -C packages/nextclaw-core exec vitest run src/config/schema.dingtalk.test.ts`
  - `pnpm -C packages/extensions/nextclaw-channel-plugin-dingtalk test`
  - `pnpm -C packages/nextclaw-openclaw-compat exec vitest run src/plugins/loader.bundled-enable-state.test.ts`
  - `pnpm -C packages/nextclaw-digital-employee exec vitest run tests/dingtalk-routing.test.ts tests/runtime-config.test.ts`
- 类型/构建：
  - `pnpm -C packages/nextclaw-core tsc`
  - `pnpm -C packages/nextclaw-digital-employee exec eslint app/pages/integrations/index.vue 'app/pages/employees/[id]/index.vue' server/api/integrations/dingtalk.get.ts server/api/integrations/dingtalk.put.ts server/api/integrations/dingtalk-groups.get.ts server/api/integrations/index.get.ts 'server/api/employees/[id]/dingtalk-binding.get.ts' 'server/api/employees/[id]/dingtalk-binding.put.ts' server/runtime/dingtalk-config.ts tests/dingtalk-routing.test.ts tests/runtime-config.test.ts --max-warnings=0`
  - `pnpm -C packages/nextclaw-digital-employee tsc`
  - `pnpm -C packages/nextclaw-digital-employee build`
- 冒烟：
  - 以隔离目录启动构建产物：
    - `PORT=4311 NEXTCLAW_HOME=/tmp/nextclaw-dingtalk-smoke NEXTCLAW_DIGITAL_EMPLOYEE_HOME=/tmp/nextclaw-digital-employee-smoke node .output/server/index.mjs`
  - 调用 `/api/integrations/dingtalk`、`/api/integrations/dingtalk` `PUT`、`/api/employees`、`/api/employees/:id/dingtalk-binding`、`/api/integrations/dingtalk-groups`，确认账号配置、员工绑定和群绑定都能实际读写。

## 发布/部署方式

- 本次仅完成代码与平台配置能力实现，未执行提交、changeset、npm 发布或线上部署。
- 若后续需要发布，按现有 monorepo 流程执行：
  - 评估受影响包版本：`@nextclaw/core`、`@nextclaw/channel-plugin-dingtalk`、`@nextclaw/openclaw-compat`、`@nextclaw/digital-employee`
  - 完成 changeset/version/publish 或数字员工应用部署
  - 部署后用真实钉钉企业凭证做一次私聊与群聊验证

## 用户/产品视角的验收步骤

1. 打开数字员工平台“集成中心”，进入钉钉配置面板。
2. 新增至少一个钉钉账号，填写 `accountId`、`clientId`、`clientSecret`、`robotCode`，保存成功后应看到“已连接”。
3. 在同一面板新增一个群绑定，选择入口账号和主响应员工，开启或关闭“允许后台协作”，保存后刷新仍可看到该绑定。
4. 打开某个员工详情页，在“钉钉入口”卡片里选择默认私聊入口并保存，刷新后仍能看到同一个账号。
5. 使用真实运行环境时，后续将该配置同步到实际服务，即可让该员工通过钉钉私聊或指定群入口被唤起；群协作者仍应由入口员工统一对外回复。
