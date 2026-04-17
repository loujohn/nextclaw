# v0.15.24-user-sync-background-progress

## 迭代完成说明

- 将用户同步从“前端等待单次长请求返回”改为“后端后台任务 + 前端轮询状态”的模式。
- 新增用户同步后台任务管理器，在服务端维护同步任务状态、阶段、人数进度和最终结果，支持：
  - 排队中
  - 认证中
  - 拉取外部数据中
  - 同步写入中
  - 已完成 / 失败
- 新增同步状态查询接口，前端在同步开始后轮询任务状态，从而在弹窗内实时展示：
  - 当前阶段
  - 百分比进度
  - 已拉取人数
  - 已处理人数
  - 新增 / 更新 / 跳过 / 失败人数
- 用户关闭同步进度弹窗时，会明确提示“关闭弹窗不会终止同步”，且实际同步任务继续在后端执行；用户可再次点击顶部“同步中”按钮查看最新进度。
- 抽离同步进度弹窗为独立组件，保持用户管理页代码结构更清晰。

## 测试/验证/验收方式

- 定向 ESLint：

```bash
pnpm -C packages/nextclaw-digital-employee exec eslint \
  server/services/user-sync-service.ts \
  server/services/user-sync-job-manager.ts \
  server/api/users/sync-trigger.post.ts \
  'server/api/users/sync-status/[jobId].get.ts' \
  app/pages/users/index.vue \
  app/components/users/SyncProgressDialog.vue
```

- VS Code 问题检查：
  - server/services/user-sync-service.ts 无新增错误
  - server/services/user-sync-job-manager.ts 无新增错误
  - server/api/users/sync-trigger.post.ts 无新增错误
  - server/api/users/sync-status/[jobId].get.ts 无新增错误
  - app/pages/users/index.vue 无新增错误
  - app/components/users/SyncProgressDialog.vue 无新增错误

## 发布/部署方式

- 常规发布数字员工平台代码即可，无新增 migration。
- 更新代码后重启 packages/nextclaw-digital-employee 服务，使后台同步任务和进度轮询接口生效。

## 用户/产品视角的验收步骤

1. 管理员进入“用户管理”页面，点击“同步人员”。
2. 在确认弹窗中点击“确认同步”后，应立即进入同步进度弹窗，而不是长时间停在确认态无反馈。
3. 进度弹窗中可看到当前阶段和人数统计，并随着同步推进实时更新。
4. 点击“关闭窗口（同步继续）”后，弹窗关闭但同步不会中断。
5. 同步进行中再次点击顶部“同步中”按钮，可重新打开进度弹窗查看最新状态。
6. 同步完成后，自动展示结果弹窗，并刷新用户列表。