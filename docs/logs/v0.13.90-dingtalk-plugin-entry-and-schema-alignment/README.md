# v0.13.90-dingtalk-plugin-entry-and-schema-alignment

## 迭代完成说明

- 修复 DingTalk 插件包根入口直接 re-export `src/index.ts` 的问题，改为使用 JS shim + `jiti` 加载插件实现，使包根入口可以被普通 Node ESM 直接导入。
- 将 DingTalk 插件配置 schema 收敛为共享常量，运行时 `plugin.configSchema` 与 `openclaw.plugin.json` 统一为同一套字段定义。
- 为 schema 补齐 legacy 单账号字段：`clientId`、`clientSecret`、`robotCode`、`corpId`、`agentId`、`allowFrom`、`dmPolicy`、`groupPolicy`、`groupAllowFrom`、`requireMention`、`mentionPatterns`、`groups`，同时保留 `defaultAccountId` 与 `accounts` 多账号模型。
- 补充回归测试，覆盖“普通 Node 可直接 import 包根入口”和“manifest schema 与运行时 schema 同步”。

## 测试 / 验证 / 验收方式

- 定向测试：
  - `pnpm -C packages/extensions/nextclaw-channel-plugin-dingtalk exec vitest run src/config-schema.test.ts src/channel.test.ts`
- 运行链路验证：
  - `pnpm -C packages/nextclaw-openclaw-compat build`
  - `pnpm -C packages/nextclaw-digital-employee build`
- 测试观察点：
  - `src/config-schema.test.ts` 中的 plain-node import 用真实 `node --input-type=module` 执行，返回 `builtin-channel-dingtalk`
  - `src/config-schema.test.ts` 确认 `openclaw.plugin.json` 与共享 schema 完全一致

## 发布 / 部署方式

- 本次未执行提交、发布或部署。
- 若后续发布 DingTalk 插件包，需要确保 `package.json` 中新增的 `jiti` 依赖被一并发布。
- 由于根入口已改为 JS shim，外部消费方不再依赖仓库内测试环境对 `.ts` 入口的特殊处理。

## 用户 / 产品视角的验收步骤

1. 在任意普通 Node 环境中直接 `import("@nextclaw/channel-plugin-dingtalk")`，确认能拿到插件对象而不是因 `.ts` 入口失败。
2. 使用 legacy 单账号配置或多账号配置启动插件，确认配置校验不会再因为 schema 缺失字段而拒绝旧配置。
3. 在数字员工项目中重新构建并启动，确认 DingTalk 集成页和运行时加载链路不受插件入口调整影响。
