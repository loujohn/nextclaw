# v0.15.18 chat timeline newline markdown render

## 迭代完成说明

- 执行时间线模块内容现在会先把字面 `\n` / `\r\n` 还原成真实换行，再参与展示。
- 对时间线内容增加 markdown 特征识别：若内容是 markdown，则按 markdown 正常格式化渲染；否则按纯文本换行展示。
- 工具调用仍默认使用代码块样式；工具结果若为 markdown，会切换为富文本渲染。

## 测试/验证/验收方式

- 执行：`tests/chat-message-groups.test.ts`，确认现有聊天时间线分组逻辑未被破坏。
- 执行：VS Code 问题检查，确认 `app/pages/employees/[id]/chat.vue` 无新增错误。
- 未执行全量 `build/lint/tsc`：本次为聊天页时间线单点渲染优化，采用定向测试 + 问题检查作为最小充分验证。

## 发布/部署方式

- 本次仅涉及 `packages/nextclaw-digital-employee` 聊天页前端展示代码，无 migration、无后端发布链路变化。
- 按现有数字员工平台常规前端部署流程发布即可。

## 用户/产品视角的验收步骤

1. 在聊天页触发一轮执行时间线内容包含字面 `\n` 的工具结果或思考内容。
2. 展开“执行时间线”，确认内容按换行正常显示，而不是把 `\n` 原样显示在文本里。
3. 再触发一条 markdown 格式的工具结果或回复片段，确认标题、列表、代码块等 markdown 结构能正常格式化展示。