# v0.13.81-digital-employee-channel-runtime-bridge

## 迭代完成说明

- 为数字员工平台新增通用 `DigitalEmployeeChannelRuntime`，复用 `MessageBus`、`ChannelManager`、`AgentRouteResolver`、`handleInbound` 与 OpenClaw plugin gateway 启动链路。
- `NextclawEngineGateway` 改为支持共享 `MessageBus` / `SessionManager` / 运行时配置应用，修复每个 employee engine 各自持有独立总线导致渠道入站无法回包的问题。
- 抽出员工运行准备逻辑，统一 UI 聊天和渠道入站的 workspace / skill 同步行为。
- 钉钉配置与员工绑定接口在写入后会主动触发 channel runtime reload，使新的账号和绑定立即生效。

## 测试/验证/验收方式

- 单测：
  - `pnpm -C packages/nextclaw-digital-employee exec vitest run tests/skill-import-and-run-service.test.ts tests/dingtalk-routing.test.ts tests/runtime-config.test.ts tests/channel-runtime.test.ts tests/database-and-skill-gateway.test.ts`
- 类型检查：
  - `pnpm -C packages/nextclaw-digital-employee tsc`
- 定向 lint：
  - `pnpm -C packages/nextclaw-digital-employee exec eslint tests/channel-runtime.test.ts tests/database-and-skill-gateway.test.ts server/runtime/channel-runtime.ts server/runtime/openclaw-runtime.ts server/runtime/platform-context.ts server/runtime/dingtalk-config.ts server/repositories/employee-repository.ts server/services/employee-runtime-preparation.ts server/services/employee-run-service.ts server/api/integrations/dingtalk.put.ts 'server/api/employees/[id]/dingtalk-binding.put.ts' server/engine/NextclawEngineGateway.ts --max-warnings=0`
- 构建：
  - `pnpm -C packages/nextclaw-digital-employee build`
- 隔离冒烟：
  - 在 `/tmp` 下启动 `.output/server/index.mjs`
  - 依次调用 `/api/integrations/dingtalk`、`POST /api/employees`、`PUT/GET /api/employees/:id/dingtalk-binding`、`GET /api/integrations/dingtalk-groups`
  - 结果：`SMOKE_OK`

## 发布/部署方式

- 本次未执行提交、发布或部署。
- 若后续发布，保持现有 digital-employee 发布流程不变；本次改动不要求额外 migration。
- 真正联调钉钉前，需要准备有效的 `AppKey/AppSecret/robotCode` 并让运行进程可访问对应企业回调入口。

## 用户/产品视角的验收步骤

1. 打开数字员工平台，在“集成中心”配置一个钉钉账号并保存。
2. 创建或选择一个员工，在员工详情页把“默认私聊入口”绑定到该钉钉账号。
3. 如需群协作，再为该员工增加群绑定并保存。
4. 保存后无需重启平台，配置应立即生效。
5. 使用真实钉钉企业凭证联调时，机器人私聊或群内命中绑定规则后，应能进入对应员工 session，并由该员工回复。
