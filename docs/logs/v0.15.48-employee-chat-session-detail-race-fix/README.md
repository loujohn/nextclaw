# v0.15.48 employee-chat-session-detail-race-fix

## 迭代完成说明

- 修复数字员工聊天页在“历史会话详情请求未完成”时切换到“新对话”或其他历史会话，旧请求返回后覆盖当前消息区的竞态问题。
- 在 [packages/nextclaw-digital-employee/app/pages/employees/[id]/chat.vue](packages/nextclaw-digital-employee/app/pages/employees/[id]/chat.vue) 为会话详情加载增加请求失效机制：会话切换、员工切换、页面卸载时都会使旧请求失效，并且仅允许当前会话、当前员工、当前版本的响应写回 `messages` 与 `nextCursor`。
- 维持现有“加载更多历史消息”的滚动恢复逻辑，不改接口协议，不扩散到其它聊天模块。

## 测试/验证/验收方式

- 编辑器问题检查：对 [packages/nextclaw-digital-employee/app/pages/employees/[id]/chat.vue](packages/nextclaw-digital-employee/app/pages/employees/[id]/chat.vue) 执行问题检查，未发现本次改动新增错误。
- 定向 lint：执行 `pnpm -C packages/nextclaw-digital-employee exec eslint 'app/pages/employees/[id]/chat.vue'`。
- lint 结果说明：存在该文件既有问题，分别是 `no-useless-escape`（旧正则写法）与 `max-lines`（文件超长），不属于本次竞态修复引入。
- UI 冒烟：尝试使用本地 `localhost:3001` 页面做浏览器验证，但当前环境存在登录页资源 404/接口 500，且 `127.0.0.1:3001` 连接被拒绝，未能完成端到端冒烟。

## 发布/部署方式

- 本次仅为前端页面逻辑修复，无数据库变更，无后端发布步骤。
- 按常规前端变更流程随下一次数字员工包发布一并上线即可。

## 用户/产品视角的验收步骤

1. 打开任一数字员工详情页的聊天页。
2. 点击某个历史会话，并在消息详情仍处于加载中时，立即点击“新建”或切换到另一个历史会话。
3. 确认当前消息区只显示最新选中目标对应的内容，不会短暂闪回或残留上一个会话的消息。
4. 重复执行快速切换 3 到 5 次，确认不会出现消息串会话、分页 cursor 错位或滚动位置异常。