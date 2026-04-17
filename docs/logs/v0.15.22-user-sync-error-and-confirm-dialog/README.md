# v0.15.22-user-sync-error-and-confirm-dialog

## 迭代完成说明

- 修复用户同步时命中 `idx_users_keycloak_sub` 唯一约束的问题：同步用户不再写入空的 `keycloak_sub`，改为基于外部 `userId` 生成稳定且唯一的同步登录标识。
- 调整同步更新逻辑，已存在的同步用户在再次同步时也会补齐对应的唯一登录标识，避免历史空值或冲突值残留。
- 优化 `POST /api/users/sync-trigger` 的错误输出：
  - 不再把底层 SQL 直接作为长 `statusMessage` 透出。
  - 对常见错误（登录标识冲突、重复外部 userId、外部接口认证失败、接口地址错误）映射为可读的中文提示。
  - 长错误文本改用 `message` 字段，避免 h3 对 `statusMessage` 的未来清洗告警。
- 将“同步人员”的二次确认从浏览器原生 `window.confirm` 改为项目统一的 `SharedConfirmDialog` 样式，并支持在弹窗内显示同步失败提示。
- 用户页 API 错误解析优先读取服务端返回的 `message`，保证前端提醒展示的是业务可读信息，而不是通用 500 文本。

## 测试/验证/验收方式

- 定向 ESLint：

```bash
pnpm -C packages/nextclaw-digital-employee exec eslint \
  server/repositories/user-repository.ts \
  server/services/user-sync-service.ts \
  server/api/users/sync-trigger.post.ts \
  app/pages/users/index.vue
```

- VS Code 问题检查：
  - server/repositories/user-repository.ts 无新增错误
  - server/services/user-sync-service.ts 无新增错误
  - server/api/users/sync-trigger.post.ts 无新增错误
  - app/pages/users/index.vue 无新增错误

## 发布/部署方式

- 常规发布数字员工平台代码即可，无新增 migration。
- 若当前服务已启动，更新代码后重启数字员工应用，使新的同步错误映射和确认弹窗逻辑生效。

## 用户/产品视角的验收步骤

1. 管理员进入“用户管理”页面，点击“同步人员”，确认看到项目统一样式的确认弹窗，而不是浏览器原生弹窗。
2. 在确认弹窗中点击“确认同步”，验证同步开始后按钮进入“同步中...”状态。
3. 若同步成功，页面提示新增/更新/跳过统计，并刷新用户列表。
4. 若同步失败，弹窗或 toast 中应显示中文业务提示，而不是原始 SQL 插入语句。
5. 对同一个外部 userId 再次同步，不应再触发 `idx_users_keycloak_sub` 冲突。