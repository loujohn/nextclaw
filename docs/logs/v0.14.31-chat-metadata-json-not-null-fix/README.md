# v0.14.31 chat metadata json not-null fix

## 迭代完成说明

本次迭代修复数字员工聊天消息入库时 metadata_json 写入 NULL 导致发送失败的问题，统一了 chat_messages 的约束与写入行为：

1. chat_messages 新建表结构统一改为 metadata_json 非空，默认值为 {}。
2. 聊天消息仓储在未提供 metadata 时也始终写入 {}，不再显式写入 NULL。
3. 启动期数据库自修复补齐历史空值，将已有 chat_messages.metadata_json 的 NULL 统一更新为 {}。
4. 补充回归测试，覆盖流式聊天场景下用户消息 metadata_json 的默认落库值。

## 测试/验证/验收方式

1. 执行 pnpm -C packages/nextclaw-digital-employee test -- employee-chat-service.test.ts，确认聊天流式测试通过。
2. 执行 pnpm -C packages/nextclaw-digital-employee exec tsc --noEmit，确认本次改动未引入类型错误。
3. 如需数据库层验证，可检查 chat_messages 中 metadata_json 是否仍存在 NULL。

## 发布/部署方式

1. 按现有流程重启 nextclaw-digital-employee 服务。
2. 服务启动时会自动执行数据库初始化/修复逻辑，将历史空值补齐。
3. 无需单独手工迁移数据，除非目标环境关闭了项目既有自动建表/迁移入口。

## 用户/产品视角的验收步骤

1. 打开任意数字员工聊天页。
2. 发送一条普通文本消息。
3. 确认页面不再弹出 chat_messages.metadata_json NOT NULL constraint failed。
4. 刷新页面后确认刚发送的消息仍能正常从历史记录读取。