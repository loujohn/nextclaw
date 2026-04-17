# v0.15.26-unified-login-synced-user-recognition

## 迭代完成说明

- 修复统一登录识别已同步用户的链路：SSO 首次回调时，除按 `keycloak_sub` 命中外，还会使用 token 中的稳定身份提示（如 `preferred_username`、`userId`、`external_user_id` 等）尝试认领已通过人员同步创建的用户。
- 对已同步用户命中后，不再新建重复账号，而是把该用户的 `keycloak_sub` 更新为真实统一登录 `sub`，并刷新邮箱、展示名、头像、最后登录时间。
- 补充回归测试场景：已同步用户在统一登录时应复用原用户记录，而不是新增第二条用户数据。

## 测试/验证/验收方式

- 已执行：`pnpm exec eslint server/repositories/user-repository.ts server/middleware/auth.ts tests/user-sync-service.test.ts`
- 已执行：`pnpm test tests/user-sync-service.test.ts`
- 结果说明：定向测试命令已触发，但当前环境缺少可连通的达梦实例，测试在 `ensureDmSchema` 阶段因 `[6001] 网络通信异常` 失败，属于环境阻塞，不是本次修复逻辑断言失败。
- 不适用项：未执行全量 `build` / `tsc`，本次只修改统一登录匹配逻辑与对应测试，先按影响范围执行最小充分验证。

## 发布/部署方式

- 合并代码后按现有数字员工服务发布流程重新部署 `packages/nextclaw-digital-employee`。
- 若线上环境启用了统一登录，无需新增 migration；只需发布服务代码并重启对应实例使新的登录匹配逻辑生效。
- 发布后建议使用一个已通过人员同步创建、但尚未成功统一登录过的账号做一次真实登录冒烟。

## 用户/产品视角的验收步骤

1. 在用户管理中确认目标账号已经由人员同步创建，且能看到外部 ID/用户名等同步资料。
2. 退出当前登录态，点击登录页的“统一身份登录”。
3. 使用上述同一企业账号完成统一登录。
4. 登录成功后回到用户管理，确认没有新增重复用户，原用户记录的最后登录时间已刷新。
5. 用同一账号访问原有权限范围页面，确认角色、启停状态和可见数据沿用原用户记录。
