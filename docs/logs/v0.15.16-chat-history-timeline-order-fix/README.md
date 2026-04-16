# v0.15.16 chat history timeline order fix

## 迭代完成说明

- 排查确认：历史记录回显时时间线顺序错乱，根因不是“界面只显示到分钟”本身，而是历史消息未持久化事件级 `processTimeline`，回放时只能用 `reasoning/toolCalls/reply` 重新拼装，导致和实时流式展示顺序不一致。
- 修复方式：服务端在聊天消息落库时持久化事件级 `processTimeline`，历史读取时优先还原已存 timeline 顺序，不再依赖回放阶段临时重建。
- 聊天页时间线时间显示补充到秒，便于识别同一分钟内多个节点的先后关系。

## 测试/验证/验收方式

- 执行：`pnpm -C packages/nextclaw-digital-employee exec vitest run tests/employee-run-service-history-replay.test.ts`
- 执行：VS Code 问题检查，确认 `chat.vue`、`employee-run-service.ts` 与新增测试文件无新增错误。
- 未执行全量 `build/lint/tsc`：本次为聊天历史回放局部修复，采用定向单测 + 问题检查作为最小充分验证。

## 发布/部署方式

- 本次仅涉及 `packages/nextclaw-digital-employee` 的聊天前后端代码，无数据库 migration、无额外发布链路变化。
- 按现有数字员工平台常规发布流程部署即可。

## 用户/产品视角的验收步骤

1. 发起一轮包含多段 thinking、工具调用和工具结果的对话，观察实时“执行时间线”顺序。
2. 刷新页面或重新进入该历史会话。
3. 确认历史回显后的“执行时间线”节点顺序与实时展示一致，不再出现 reasoning/tool/result/reply 顺序错乱。
4. 观察时间线右侧时间，确认已显示到秒，方便核对同一分钟内多个节点的先后关系。