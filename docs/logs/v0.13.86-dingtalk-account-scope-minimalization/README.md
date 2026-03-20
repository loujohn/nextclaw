# v0.13.86-dingtalk-account-scope-minimalization

## 迭代完成说明

- 根据最新产品边界，收缩 DingTalk 路由方案：同一个账号下的私聊和群聊都由同一个员工处理。
- 回退此前为“私聊/群聊分流到不同员工”预埋的 `core` wildcard 路由改动，恢复 `core` 原有匹配语义。
- 数字员工平台回退为账号级绑定投影：`channel + accountId -> agentId`，不再生成 `direct/*` 绑定。
- 保留此前已经修复好的 DB 作为真源、runtime 启动链路、明确错误提示等必要改动。

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
  - 在 `/tmp` 下运行最小脚本，验证同一个 `accountId=ops-bot` 的账号级绑定会同时覆盖私聊和群聊，输出 `DINGTALK_ACCOUNT_SCOPE_SMOKE_OK`

## 发布/部署方式

- 本次为 digital-employee 平台绑定投影与相关测试的收缩，不涉及数据库 migration。
- 按现有 digital-employee 服务流程重新构建并重启服务即可。
- 部署后建议重新保存一次员工的“默认私聊入口”绑定，使当前账号级绑定在数据库中重新落库。

## 用户/产品视角的验收步骤

1. 在员工页为目标员工设置“默认私聊入口”。
2. 不需要为同一账号额外拆分群/私聊员工。
3. 重启 digital-employee 服务。
4. 用该账号对应的钉钉机器人进行私聊，确认命中该员工。
5. 在群里 `@` 同一个机器人，确认也命中同一个员工。
