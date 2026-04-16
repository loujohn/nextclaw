# 迭代完成说明

- 员工聊天流式执行失败时，服务端现在会持久化一条 assistant 失败消息，历史记录不再只剩用户提问。
- 员工聊天页实时流处理补充了默认失败回复文案，并在失败/取消场景给回复附加状态标识，避免界面出现“没有回复”的空白感。
- 统一新增 `buildChatFailureMessage()`，把失败回复和失败提示收口成一致的中文文案格式。

# 测试/验证/验收方式

- 静态检查：VS Code Problems 检查通过，以下文件无新增错误：
  - `packages/nextclaw-digital-employee/shared/ui-models.ts`
  - `packages/nextclaw-digital-employee/server/services/employee-run-service.ts`
  - `packages/nextclaw-digital-employee/app/pages/employees/[id]/chat.vue`
- 定向测试：执行 `pnpm -C packages/nextclaw-digital-employee test -- employee-chat-service.test.ts` 时，被仓库现有测试基线阻塞，错误为 `createPlatformKnex(...).schema` 读取 undefined，失败发生在测试初始化阶段，非本次改动引入。

# 发布/部署方式

- 本次仅涉及前端页面与服务端聊天失败持久化逻辑，按常规数字员工应用发布流程部署即可。
- 若部署环境包含已运行实例，发布后无需额外 migration。

# 用户/产品视角的验收步骤

1. 进入任一员工详情页聊天页，发送一条会触发执行失败的消息。
2. 观察实时对话区：应出现一条 assistant 回复，正文包含“执行失败”，并显示“执行失败”状态徽标。
3. 刷新页面或切换到该历史会话后再返回，失败回复仍然存在，状态徽标仍可见。
4. 再发送一条正常消息，确认成功回复仍按原样展示，未影响已有聊天流程。