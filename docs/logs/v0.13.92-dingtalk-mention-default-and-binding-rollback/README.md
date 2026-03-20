# v0.13.92-dingtalk-mention-default-and-binding-rollback

## 迭代完成说明

- 新增 DingTalk 群绑定默认模型 `createEmptyDingTalkGroupBinding(...)`，新建群绑定时默认不再强制 `@` 机器人，避免空 `mentionPatterns` 下的高误伤默认值。
- DingTalk 消息归一化补充原生提及信号判断：当回调 payload 提供 `isInAtList`、`mentioned`、`atUserIds` 或 `atUsers` 且命中当前机器人时，会直接判定为已提及；文本 `mentionPatterns` 仍保留为兜底。
- 集成页账号改名时，除 routing 外会同步重写 `defaultAccountId`，避免旧默认账号被删除后悄悄回退到“第一个账号”。
- 员工页 `PUT /api/employees/:id/dingtalk-binding` 改为原子更新：先写路由、再 reload，若 reload 失败则回滚旧绑定并尝试恢复旧 runtime，避免“接口报错但绑定已落库”的半失败状态。

## 测试 / 验证 / 验收方式

- 定向测试：
  - `pnpm -C packages/nextclaw-digital-employee exec vitest run tests/dingtalk-editor-model.test.ts tests/dingtalk-config-storage.test.ts`
  - `pnpm -C packages/extensions/nextclaw-channel-plugin-dingtalk exec vitest run src/channel.test.ts`
  - `pnpm -C packages/nextclaw-digital-employee exec vitest run tests/dingtalk-routing.test.ts tests/channel-runtime.test.ts`
- 静态检查：
  - `pnpm -C packages/nextclaw-digital-employee exec eslint app/pages/integrations/index.vue 'server/api/employees/[id]/dingtalk-binding.put.ts' server/runtime/dingtalk-config.ts shared/dingtalk-editor-model.ts tests/dingtalk-editor-model.test.ts tests/dingtalk-config-storage.test.ts tests/dingtalk-routing.test.ts tests/channel-runtime.test.ts`
  - `pnpm -C packages/nextclaw-digital-employee tsc`
  - `pnpm -C packages/nextclaw-digital-employee build`
- 结果说明：
  - `vitest` 全部通过
  - `tsc` / `build` 通过
  - `eslint` 无 error，仅保留既有 `max-lines` / `max-lines-per-function` warning
- 冒烟测试：
  - 在 `/tmp` 隔离目录启动 `packages/nextclaw-digital-employee/.output/server/index.mjs`
  - 通过真实 API 验证默认账号改名后 `defaultAccountId` 跟随迁移，且员工 DingTalk 绑定可正常保存并读取
  - 观察点：输出 `DINGTALK_BINDING_FIX_SMOKE_OK`

## 发布 / 部署方式

- 本次未执行提交、发布或部署。
- 若后续上线，按数字员工服务当前发布流程部署即可，无需新增 migration。
- 上线后建议重点复测：
  - 新建群绑定后默认行为是否无需额外配置即可收消息
  - 修改 `accountId` 后默认账号与员工绑定是否仍然指向新账号
  - 员工页保存 DingTalk 绑定失败时，旧入口是否保持可用

## 用户 / 产品视角的验收步骤

1. 打开数字员工“集成中心”，为 DingTalk 新增一个账号，并确认新建群绑定项默认没有勾选“必须 @ 机器人后才处理”。
2. 在群里直接发消息，或 `@` 机器人发“你是谁”，确认机器人可正常进入员工处理链路。
3. 将该账号的 `accountId` 改成新值并保存，刷新后确认默认账号仍是这个新值，没有偷偷切到别的账号。
4. 打开员工详情页，为员工保存默认私聊入口和群绑定；若故意制造 reload 失败，确认页面报错后刷新仍能看到旧绑定，没有出现“保存失败但绑定其实已经改掉”的情况。
