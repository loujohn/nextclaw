# v0.13.83-dingtalk-runtime-secret-fix

## 迭代完成说明

- 修复数字员工平台从数据库组装 DingTalk runtime 配置时丢失 `clientSecret` 的问题，避免 channel 启动阶段错误报 `DingTalk accounts not configured`。
- 修复更新 DingTalk 账号时覆盖已有 `clientSecret` 的问题；现在未重新输入 secret 时会保留数据库中的旧值。
- 调整平台启动链路，改为直接从数据库原始记录生成 runtime `Config`，UI/API 仍保持 secret 脱敏展示。
- 新增针对 DB -> runtime secret 保留行为的回归测试。

## 测试/验证/验收方式

- 单测：
  - `pnpm -C packages/nextclaw-digital-employee exec vitest run tests/dingtalk-config-storage.test.ts tests/dingtalk-routing.test.ts tests/runtime-config.test.ts tests/channel-runtime.test.ts tests/database-and-skill-gateway.test.ts tests/skill-import-and-run-service.test.ts`
- 类型检查：
  - `pnpm -C packages/nextclaw-digital-employee tsc`
- 定向 lint：
  - `pnpm -C packages/nextclaw-digital-employee exec eslint server/runtime/dingtalk-config.ts server/runtime/platform-context.ts tests/dingtalk-config-storage.test.ts --max-warnings=0`
- 构建：
  - `pnpm -C packages/nextclaw-digital-employee build`
- 冒烟：
  - 在 `/tmp` 下创建临时数据库，写入 DingTalk 账号并更新非 secret 字段，再调用 runtime 组装逻辑，输出 `RUNTIME_SMOKE_OK`

## 发布/部署方式

- 本次仅为服务端代码修复，按现有 digital-employee 发布流程重新构建并部署服务即可。
- 不涉及新增 migration。
- 若线上已启动旧进程，部署后需重启 digital-employee 服务，让平台重新从数据库读取 DingTalk runtime 配置。

## 用户/产品视角的验收步骤

1. 在数字员工平台“集成中心”确认已有 DingTalk 账号，且 `clientId/clientSecret` 已正确保存。
2. 在员工详情页为目标员工绑定 `默认私聊入口`。
3. 重启 digital-employee 服务。
4. 观察启动日志，不应再出现 `Failed to start channel dingtalk: Error: DingTalk accounts not configured`。
5. 用钉钉私聊对应机器人，确认消息可以进入员工链路；若仍失败，下一步检查真实钉钉凭证或回调连通性，而不是平台数据库配置。
