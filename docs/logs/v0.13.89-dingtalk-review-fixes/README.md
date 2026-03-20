# v0.13.89-dingtalk-review-fixes

## 迭代完成说明

- 修复数字员工 DingTalk 群路由模型错误使用 `groupId` 单键的问题，改为显式数组结构，允许同一 `groupId` 在不同 `accountId` 下并存。
- 修复 DingTalk 账号改名时 `clientSecret` 被静默丢失的问题，新增 `sourceAccountId` 传递并在服务端保留原 secret。
- 修复 digital-employee runtime reload 只刷新 `config`、未把新的 `extensionRegistry` 下发到缓存 engine 的问题。
- 修复 DingTalk 多账号启动时部分账号成功连接后整体失败却不回滚的问题，失败时会断开已启动 client 并清空运行态。
- 修复 `dingtalk-groups` API 仍按旧 `Record` 结构拼装返回值导致的类型错误。

## 测试 / 验证 / 验收方式

- 定向测试：
  - `pnpm -C packages/nextclaw-digital-employee exec vitest run tests/dingtalk-routing.test.ts tests/dingtalk-config-storage.test.ts tests/dingtalk-editor-model.test.ts tests/channel-runtime.test.ts`
  - `pnpm -C packages/extensions/nextclaw-channel-plugin-dingtalk exec vitest run src/channel.test.ts`
- 类型与构建：
  - `pnpm -C packages/nextclaw-core tsc`
  - `pnpm -C packages/nextclaw-digital-employee tsc`
  - `pnpm -C packages/nextclaw-digital-employee build`
- 定向 ESLint：
  - `pnpm -C packages/nextclaw-core exec eslint src/agent/loop.ts src/engine/native.ts src/engine/types.ts`
  - `pnpm -C packages/nextclaw-digital-employee exec eslint server/api/integrations/dingtalk-groups.get.ts server/runtime/dingtalk-config.ts server/engine/NextclawEngineGateway.ts app/pages/integrations/index.vue shared/dingtalk-editor-model.ts tests/dingtalk-routing.test.ts tests/dingtalk-config-storage.test.ts tests/dingtalk-editor-model.test.ts tests/channel-runtime.test.ts`
- 冒烟：
  - 在 `/tmp` 下启动 `packages/nextclaw-digital-employee/.output/server/index.mjs`
  - 通过 `PUT /api/integrations/dingtalk` 验证账号改名后 `clientSecretSet` 仍为真
  - 通过 `GET /api/integrations/dingtalk-groups` 验证相同 `groupId` 在不同 `accountId` 下均返回
  - 结果：`DINGTALK_FIX_SMOKE_OK`

## 发布 / 部署方式

- 本次未执行提交、发布或部署。
- 若后续发布，先确保数字员工服务使用本次构建产物，再按项目既有发布流程执行。
- 若线上已存在被旧 bug 擦空 secret 的账号，需要在集成中心重新保存一次该账号 secret。

## 用户 / 产品视角的验收步骤

1. 在集成中心新建两个 DingTalk 账号，例如 `ops-bot` 与 `daily-bot`。
2. 将 `ops-bot` 改名为 `ops-renamed`，不重新输入 secret，保存后重新打开集成中心，确认该账号仍显示“已设置密钥”。
3. 在群绑定中分别给 `ops-renamed` 和 `daily-bot` 新增相同 `groupId` 的绑定，保存后刷新页面，确认两条绑定都仍然存在。
4. 修改 DingTalk 集成配置后，不重启服务，验证私聊或群聊入口仍能被正确路由到员工。
