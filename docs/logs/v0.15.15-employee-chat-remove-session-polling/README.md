# v0.15.15-employee-chat-remove-session-polling

## 迭代完成说明

- 移除员工聊天页 app/pages/employees/[id]/chat.vue 中基于 setInterval 的 external sync 定时器。
- 聊天页不再每 15 秒自动调用 /api/employees/:id/sessions?limit=30 刷新会话列表。
- 保留页面从后台切回前台时的单次同步行为，避免完全失去外部运行结果的补刷新能力。

## 测试/验证/验收方式

- 对修改文件执行 VS Code 问题检查：未发现新的错误。
- 执行定向 ESLint：pnpm exec eslint app/pages/employees/[id]/chat.vue
- 验证结果：未出现新的错误；存在该文件既有 max-lines warning，不属于本次变更引入。

## 发布/部署方式

- 本次为前端页面逻辑调整，无需数据库 migration。
- 按数字员工项目常规前端发布流程重新构建并部署即可。
- 若仅本地验证，可在 packages/nextclaw-digital-employee 下启动 dev 环境后进入员工聊天页观察网络请求。

## 用户/产品视角的验收步骤

1. 打开任一员工的聊天页。
2. 在浏览器网络面板中过滤 sessions 接口，请求路径为 /api/employees/:id/sessions?limit=30。
3. 停留页面超过 15 秒，确认不再出现持续、周期性的该接口请求。
4. 将页面切到后台后再切回前台，确认最多触发一次同步请求，而不是恢复周期轮询。
5. 发送一条消息并确认聊天、会话列表和消息列表仍能正常刷新。
