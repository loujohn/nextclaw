# v0.15.4-chat-dm-message-normalization

## 迭代完成说明

- 修复聊天消息写入达梦时 `chat_messages.created_at` 仍可能透传 ISO 8601 时间串的问题；新增统一归一化逻辑，将聊天消息时间收敛为达梦可接受的 `YYYY-MM-DD HH:mm:ss` 格式。
- 修复聊天历史/实时事件对结构化消息内容的降级丢失问题；当消息内容包含 `text`、`image_url`、`input_image` 等多段内容时，统一转成可展示的 Markdown 文本，其中图片块会渲染为 Markdown 图片语法，避免聊天界面图片丢失。
- 聊天仓储、引擎网关、运行服务统一复用消息标准化模块，避免 SQLite 时代的格式习惯继续散落在各调用点。
- 新增定向单测，覆盖“ISO 时间转达梦时间”和“多模态消息转 Markdown”两个核心兼容场景。

## 测试/验证/验收方式

- 通过：`pnpm -C packages/nextclaw-digital-employee exec vitest run tests/chat-message-normalization.test.ts`
- 通过：上述命令覆盖 2 个断言，分别验证时间归一化和图片内容归一化。
- 定向 ESLint 已执行：`pnpm -C packages/nextclaw-digital-employee exec eslint server/services/employee-run-service.ts server/engine/NextclawEngineGateway.ts server/chat/chat-message-normalization.ts server/repositories/chat-message-repository.ts tests/chat-message-normalization.test.ts`
- 结果说明：新增文件与新增逻辑无 lint error；`server/services/employee-run-service.ts` 仍存在既有 `max-lines` 警告（文件总行数超限），本次未做无关拆分。

## 发布/部署方式

- 本次为服务端聊天兼容性修复，无独立发布脚本变更。
- 按现有数字员工发布流程完成构建、部署后，确保服务端使用达梦配置启动。
- 若生产环境已存在失败请求，无需额外 migration；修复在应用层生效，重新发起聊天请求即可按新逻辑写入。

## 用户/产品视角的验收步骤

1. 在达梦环境打开数字员工聊天页面，发送一条纯文本消息，确认接口不再返回 `错误的日期时间类型格式`。
2. 让模型返回包含图片块或带图片上下文的消息，确认聊天面板能看到图片而不是空白内容。
3. 刷新页面后重新进入同一会话，确认历史消息中的图片仍能正常显示，消息顺序与分页不乱。
4. 再执行一次带工具调用的聊天，确认工具结果消息仍能展示，不受本次内容归一化影响。