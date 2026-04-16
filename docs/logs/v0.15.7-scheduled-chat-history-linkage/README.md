# 迭代完成说明

- 修复了 scheduled/manual 定时任务执行失败时，错误信息只落 run 记录、不落聊天会话的问题；现在失败也会写入一条 assistant 错误消息到对应 scheduled 会话。
- 员工聊天页新增后台轻量同步：当页面停留在聊天页时，会周期性刷新会话列表；如果当前选中的会话在外部任务执行后有新消息或更新时间变化，会自动重载该会话历史。
- 本次改动覆盖“定时任务自动执行”“Jobs 页立即执行任务”“对应会话失败”三种与聊天历史联动相关的缺口。

# 测试/验证/验收方式

- 静态检查：以下产品文件无新增错误：
  - `packages/nextclaw-digital-employee/server/services/employee-run-service.ts`
  - `packages/nextclaw-digital-employee/app/pages/employees/[id]/chat.vue`
- 定向 lint：执行 `pnpm exec eslint server/services/employee-run-service.ts app/pages/employees/'[id]'/chat.vue`，结果为 0 error；仅保留仓库既有 `max-lines` warning。
- 定向测试：尝试执行 `pnpm -C packages/nextclaw-digital-employee test -- automation-service.test.ts`，但被当前环境的达梦连接问题阻塞，错误为 `无法切换到达梦 Schema "DIGITAL_EMPLOYEE" / [6001] 网络通信异常`，未能跑到业务断言阶段。

# 发布/部署方式

- 本次仅涉及聊天页前端同步逻辑和服务端定时任务失败消息持久化逻辑，无需新增 migration。
- 按数字员工应用常规发布流程部署即可；若线上已有聊天页长驻用户，刷新前端资源后即可生效后台同步能力。

# 用户/产品视角的验收步骤

1. 在员工 Jobs 页手动触发一个定时任务，随后进入聊天页。
2. 观察会话列表：应出现对应 `定时任务 · ...` 的 scheduled 会话，且预览文案更新为本次任务最新输出。
3. 若当前正停留在该 scheduled 会话，等待后台任务再次执行后，无需手动刷新页面，聊天历史应自动出现新增消息。
4. 制造一次任务失败，进入对应 scheduled 会话，确认聊天历史中出现一条 assistant 失败回复，状态/文案明确包含“执行失败”。