# v0.15.56-user-management-reset-password-route-fix

## 迭代完成说明

- 修复用户管理“重置密码”接口 404 问题。
- 将服务端路由文件从 `server/api/users/[id].reset-password.post.ts` 调整为 Nitro 可正确解析子路径的 `server/api/users/[id]/reset-password.post.ts`。
- 保持前端现有调用路径 `/api/users/:id/reset-password` 不变，避免额外改动用户管理页面逻辑。

## 测试/验证/验收方式

- 已执行冒烟验证：`curl -X POST http://localhost:3000/api/users/49a70ebf-bd59-4eec-90d1-49045efb73f1/reset-password -H 'content-type: application/json' --data '{"password":"123456"}'`
- 验证结果：接口返回 `401`，说明路由已被服务端正确命中，不再是 `404 Page not found`。
- 已执行静态检查：VS Code 问题检查，新增服务端文件无错误。
- 不适用项：未执行 `build` / `lint` / `tsc`，本次改动仅为单一路由文件位置修正，且已通过本地运行态接口冒烟完成更直接验证。

## 发布/部署方式

- 按现有 `packages/nextclaw-digital-employee` 发布流程部署即可。
- 本次不涉及数据库 migration。
- 若线上已有运行实例，部署后确保 Nuxt/Nitro 服务完成重启，使新的 API 路由注册生效。

## 用户/产品视角的验收步骤

1. 进入用户管理页面。
2. 对一个本地账号点击“重置密码”，输入不少于 6 位的新密码并提交。
3. 确认页面不再出现接口 404 报错。
4. 使用该用户的新密码登录，确认密码已生效。