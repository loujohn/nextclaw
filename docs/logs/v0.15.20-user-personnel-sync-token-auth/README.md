# v0.15.20-user-personnel-sync-token-auth

## 迭代完成说明

- 将人员同步接口认证从“直接读取固定 PERSONNEL_SYNC_API_TOKEN”升级为“服务端先调用 oauth2/token 接口换取 access_token，再以 Bearer 访问人员同步接口”。
- 在用户同步服务中加入 token 获取配置、Basic 认证头规范化、access token 缓存与过期前提前刷新逻辑，避免每次同步都依赖手工维护静态 token。
- 保留 PERSONNEL_SYNC_API_TOKEN 作为临时调试兜底，但默认推荐使用动态 token 获取链路。
- 更新同步触发接口的配置校验与错误提示，明确缺失的认证环境变量。
- 更新环境变量示例，补充 PERSONNEL_SYNC_TOKEN_URL、PERSONNEL_SYNC_TOKEN_BASIC_AUTH、PERSONNEL_SYNC_USERNAME、PERSONNEL_SYNC_PASSWORD、PERSONNEL_SYNC_LOGIN_TYPE、PERSONNEL_SYNC_GRANT_TYPE。

## 测试/验证/验收方式

- 定向 ESLint：

```bash
pnpm -C packages/nextclaw-digital-employee exec eslint \
  server/services/user-sync-service.ts \
  server/api/users/sync-trigger.post.ts
```

- VS Code 问题检查：
  - server/services/user-sync-service.ts 无新增错误
  - server/api/users/sync-trigger.post.ts 无新增错误

- 说明：.env.example 属于非代码示例文件，eslint 默认忽略；本次未执行真实外部 oauth2/token 冒烟，因为当前会话未注入可用的生产认证配置。

## 发布/部署方式

- 为 packages/nextclaw-digital-employee 配置以下环境变量：

```bash
PERSONNEL_SYNC_API_URL=https://shangji.cqdcg.com:10000/api/admin/project/workHour/listAllUsers
PERSONNEL_SYNC_TOKEN_URL=https://shangji.cqdcg.com:10000/api/admin/oauth2/token
PERSONNEL_SYNC_TOKEN_BASIC_AUTH=Basic <base64(client_id:client_secret)>
PERSONNEL_SYNC_USERNAME=<sync-username>
PERSONNEL_SYNC_PASSWORD=<sync-password>
PERSONNEL_SYNC_LOGIN_TYPE=quick
PERSONNEL_SYNC_GRANT_TYPE=password
```

- 如需短期排障，可临时配置 PERSONNEL_SYNC_API_TOKEN 覆盖动态取 token；正常场景不建议长期使用。

- 代码发布方式不变，无新增 migration。

## 用户/产品视角的验收步骤

1. 在服务环境注入上述人员同步认证参数。
2. 以管理员身份进入“用户管理”页面并点击“同步人员”。
3. 若 token 参数齐全，服务端应先成功换取 access_token，再完成外部人员拉取与数据库同步。
4. 若 token 参数缺失，接口返回的错误提示应能直接指出缺失的是同步认证配置，而不是笼统的同步失败。
5. 同步完成后，用户列表刷新并展示新增/更新/跳过统计。