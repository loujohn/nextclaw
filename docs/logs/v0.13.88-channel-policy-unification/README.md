# v0.13.88-channel-policy-unification

## 迭代完成说明

- 在 `@nextclaw/core` 新增共享渠道策略模块，将 `dmPolicy`、`groupPolicy`、`requireMention`、`mentionPatterns` 的核心判断收敛到同一处。
- DingTalk、Telegram、Discord 改为复用同一套准入与 mention 规则，不再各自维护重复的策略判断代码。
- 保留各渠道自身的接入差异：例如 Telegram/Discord 仍然保留平台原生 mention 信号提取；DingTalk 仍然保留自己的消息归一化与 API 收发。
- 本次不修改产品配置模型，也不增加新字段，只做行为语义统一。

## 测试/验证/验收方式

- 红绿测试：
  - `pnpm -C packages/nextclaw-core exec vitest run src/channels/policy.test.ts`
- DingTalk 插件测试：
  - `pnpm -C packages/extensions/nextclaw-channel-plugin-dingtalk test`
- 类型检查：
  - `pnpm -C packages/nextclaw-core tsc`
  - `pnpm -C packages/extensions/nextclaw-channel-runtime tsc`
- 构建：
  - `pnpm -C packages/nextclaw-core build`
  - `pnpm -C packages/extensions/nextclaw-channel-runtime build`
- 定向 lint：
  - `pnpm -C packages/nextclaw-core exec eslint src/channels/policy.ts src/channels/policy.test.ts src/index.ts --max-warnings=0`
  - `pnpm -C packages/extensions/nextclaw-channel-runtime exec eslint src/channels/telegram.ts --max-warnings=0`
- 冒烟：
  - 在 `/tmp` 下运行最小脚本，验证共享策略模块对 direct/group/mention 三类判断输出一致，结果为 `CHANNEL_POLICY_UNIFICATION_SMOKE_OK`

## 发布/部署方式

- 本次涉及 `@nextclaw/core` 与 `@nextclaw/channel-runtime` 的运行时逻辑收敛，不涉及数据库 migration。
- 重新构建并重启依赖这两个包的服务/应用即可。
- 若后续要发布 npm 包，需要联动评估依赖 `@nextclaw/core` / `@nextclaw/channel-runtime` 的包版本升级范围。

## 用户/产品视角的验收步骤

1. 分别准备一个 Telegram 群、Discord 频道和 DingTalk 群。
2. 在三个渠道中配置相同的策略组合，例如：
   - 私聊 `dmPolicy=allowlist`
   - 群聊 `groupPolicy=allowlist`
   - 群消息 `requireMention=true`
3. 用允许/不允许的用户和群各发送一轮消息。
4. 确认三种渠道对“是否接收消息”的判断一致。
5. 再关闭某个群的 `requireMention`，确认三种渠道都表现为“不 @ 也能进入链路”。
