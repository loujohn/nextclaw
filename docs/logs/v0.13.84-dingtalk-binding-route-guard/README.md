# v0.13.84-dingtalk-binding-route-guard

## 迭代完成说明

- 修复数字员工渠道 runtime 在未命中员工绑定时回退到 `agentId=main` 的问题。
- 现在外部渠道消息若未命中显式员工绑定，会直接返回明确错误：`No employee binding configured for <channel> account <accountId> <peerKind>:<peerId>`。
- 将原先误导性的 `Employee not found for agentId: main` 改为更准确的绑定缺失提示；如果是绑定存在但员工实体已删除，则返回 `Bound employee not found for agentId: ...`。
- 新增回归测试，覆盖“正常命中绑定”和“缺失绑定时不再回退 main”两条路径。

## 测试/验证/验收方式

- 单测：
  - `pnpm -C packages/nextclaw-digital-employee exec vitest run tests/channel-runtime.test.ts tests/dingtalk-config-storage.test.ts tests/dingtalk-routing.test.ts tests/runtime-config.test.ts tests/database-and-skill-gateway.test.ts tests/skill-import-and-run-service.test.ts`
- 定向 lint：
  - `pnpm -C packages/nextclaw-digital-employee exec eslint server/runtime/channel-runtime.ts tests/channel-runtime.test.ts --max-warnings=0`
- 类型检查：
  - `pnpm -C packages/nextclaw-digital-employee tsc`
- 构建：
  - `pnpm -C packages/nextclaw-digital-employee build`

## 发布/部署方式

- 本次仅涉及 digital-employee 服务端 runtime 与测试代码，按现有服务部署流程重新构建并重启服务即可。
- 不涉及数据库 migration。
- 部署后建议重新保存一次员工的钉钉私聊绑定，并观察服务日志确认不再出现 `agentId: main` 相关报错。

## 用户/产品视角的验收步骤

1. 在数字员工平台确认目标员工已配置“默认私聊入口”。
2. 重启 digital-employee 服务。
3. 用钉钉私聊机器人发送一条消息。
4. 若绑定存在，应进入员工正常回复链路。
5. 若绑定不存在，用户应看到明确错误提示指出缺少哪个 `accountId`/会话绑定，而不是 `Employee not found for agentId: main`。
