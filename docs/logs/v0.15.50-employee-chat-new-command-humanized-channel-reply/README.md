# v0.15.50 employee-chat-new-command-humanized-channel-reply

## 迭代完成说明

- 修正数字员工渠道侧 `/new` 的用户回包文案，避免直接把 core 命令层的技术型英文提示暴露给钉钉用户。
- 保留现有真实行为不变：渠道侧 `/new` 仍然先通过 core `CommandRegistry` 清空当前 peer 对应 session 的历史，只是不再透传 `Conversation history cleared (...)`。
- 在 [packages/nextclaw-digital-employee/server/runtime/channel-runtime.ts](../../../packages/nextclaw-digital-employee/server/runtime/channel-runtime.ts) 中将渠道 `/new` 成功后的回包统一改为更自然的中文提示“好的，我们重新开始。接下来想聊什么？”。
- 更新 [packages/nextclaw-digital-employee/tests/channel-runtime-command.test.ts](../../../packages/nextclaw-digital-employee/tests/channel-runtime-command.test.ts) 的断言，覆盖“历史确实清空 + 渠道回包为人性化中文”的组合行为。

## 测试/验证/验收方式

- 先做定向红绿验证：
  - 执行 `pnpm -C /Users/loujohn/project/nextclaw/packages/nextclaw-digital-employee exec vitest run tests/channel-runtime-command.test.ts`
  - 在修改前确认失败，失败原因为仍返回 `Conversation history cleared (2 messages).`
  - 修改后再次执行同命令，结果通过。
- 命令链路回归：执行 `pnpm -C /Users/loujohn/project/nextclaw/packages/nextclaw-digital-employee exec vitest run tests/chat-command.test.ts tests/employee-chat-command.test.ts tests/channel-runtime-command.test.ts`，确认 `/new` 的 UI/渠道分层语义都保持正确。
- 类型检查：执行 `pnpm -C /Users/loujohn/project/nextclaw/packages/nextclaw-digital-employee tsc`。
- 定向 lint：执行 `pnpm -C /Users/loujohn/project/nextclaw/packages/nextclaw-digital-employee exec eslint --rule 'max-lines: off' --rule 'no-useless-escape: off' 'server/runtime/channel-runtime.ts' 'tests/channel-runtime-command.test.ts'`。

## 发布/部署方式

- 本次仅为数字员工渠道回包文案修正，不涉及数据库变更，无需 migration。
- 按常规数字员工应用发布流程部署 `packages/nextclaw-digital-employee` 即可。
- 如与其它渠道/聊天改动合并发布，发布前至少重复执行本 README 中的命令链路回归与类型检查。

## 用户/产品视角的验收步骤

1. 在钉钉私聊同一数字员工，先发送几条消息建立上下文。
2. 发送 `/new`。
3. 确认机器人回复为“好的，我们重新开始。接下来想聊什么？”这类自然中文，而不是 `Conversation history cleared (...)`。
4. 继续追问一个依赖旧上下文的问题，确认机器人不会再引用 `/new` 之前的聊天内容。
5. 在 UI 聊天页输入 `/new`，确认仍然是直接切换到新的内部会话，不会出现额外回复消息，说明这次修正只影响渠道回包层。
