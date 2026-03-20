# v0.13.85-dingtalk-direct-group-coexist

## 迭代完成说明

- 修复同一 DingTalk 账号下“私聊默认入口”和“群专属入口”不能稳定并存的问题。
- `core` 路由器新增 `peer.id = "*"` 通配支持，用于表达“某个 peer kind 下的任意会话”。
- 数字员工平台现在会把“默认私聊入口”投影成 `peer.kind=direct` 且 `peer.id="*"` 的绑定，不再使用会同时匹配群和私聊的泛绑定。
- 继续兼容历史绑定读取：旧的无 `peer` 绑定仍会被识别为私聊默认入口，避免已存数据立即失效。

## 测试/验证/验收方式

- core 路由测试：
  - `pnpm -C packages/nextclaw-core exec vitest run src/agent/route-resolver.test.ts`
- digital-employee 受影响测试：
  - `pnpm -C packages/nextclaw-digital-employee exec vitest run tests/channel-runtime.test.ts tests/dingtalk-config-storage.test.ts tests/dingtalk-routing.test.ts tests/runtime-config.test.ts tests/database-and-skill-gateway.test.ts tests/skill-import-and-run-service.test.ts`
- 定向 lint：
  - `pnpm -C packages/nextclaw-core exec eslint src/agent/route-resolver.ts src/agent/route-resolver.test.ts --max-warnings=0`
  - `pnpm -C packages/nextclaw-digital-employee exec eslint server/runtime/dingtalk-config.ts tests/dingtalk-routing.test.ts --max-warnings=0`
- 类型检查与构建：
  - `pnpm -C packages/nextclaw-digital-employee tsc`
  - `pnpm -C packages/nextclaw-digital-employee build`
- 冒烟：
  - 在 `/tmp` 下运行最小脚本，验证同一 `accountId=ops-bot` 下，私聊命中 `daily-bot`，群 `cid-risk` 命中 `risk-bot`，输出 `DINGTALK_PEER_SCOPE_SMOKE_OK`

## 发布/部署方式

- 本次涉及 `@nextclaw/core` 路由能力和 digital-employee 绑定投影逻辑，按现有服务部署流程重新构建并部署 digital-employee 即可。
- 不涉及数据库 migration。
- 部署后建议重新保存一次员工的“默认私聊入口”配置，使平台将绑定刷新为新的 `direct/*` 语义。

## 用户/产品视角的验收步骤

1. 在员工页为某个员工配置“默认私聊入口”。
2. 在集成中心为某个群配置该账号下的群专属员工。
3. 重启 digital-employee 服务。
4. 通过同一个 DingTalk 机器人发起私聊，应命中私聊默认员工。
5. 在绑定的群里 `@` 机器人，应命中该群专属员工。
6. 两者应可同时存在，互不遮挡。
