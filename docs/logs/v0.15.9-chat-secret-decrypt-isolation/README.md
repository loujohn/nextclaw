# v0.15.9-chat-secret-decrypt-isolation

## 迭代完成说明

- 修复 SecretsRepository 在读取作用域 Secret 时的脆弱性：单条损坏密文不再导致整条聊天执行链路失败。
- 损坏的 Secret 会被跳过并写入告警日志，避免无关坏数据拖垮数字员工对话。
- Secret 列表读取增加损坏态占位展示，便于后台识别问题条目。
- 新增纯单元回归测试，验证存在损坏密文时仍能保留有效 Secret 的可用性。

## 测试/验证/验收方式

- 单元测试：pnpm -C packages/nextclaw-digital-employee test -- tests/secrets-repository.test.ts
- 静态校验：pnpm -C packages/nextclaw-digital-employee exec eslint server/repositories/secrets-repository.ts tests/secrets-repository.test.ts tests/employee-chat-service.test.ts
- 校验结果：单元测试通过；ESLint 无 error，但 employee-chat-service.test.ts 存在一个既有 max-lines-per-function warning，未在本次修复中扩散为新的 lint error。

## 发布/部署方式

- 本次为服务端逻辑修复，无独立发布脚本变更。
- 合入后按现有数字员工发布流程重新构建并部署对应服务端应用即可。
- 若线上已有损坏 Secret，无需迁移；部署后系统会自动跳过该条坏数据并输出日志告警。

## 用户/产品视角的验收步骤

1. 在后台 Secret 数据中保留一条正常 Secret，并制造一条损坏或历史不可解密的 Secret。
2. 打开任一数字员工对话页，发送查询类消息，例如“查询重庆今天天气”。
3. 确认对话可以正常返回，不再出现“Unsupported state or unable to authenticate data”导致的执行失败。
4. 打开服务端日志，确认存在损坏 Secret 的 skip invalid secret 告警。
5. 打开 Secret 列表，确认损坏条目以 [invalid secret] 占位展示，便于后续人工修复或重建。