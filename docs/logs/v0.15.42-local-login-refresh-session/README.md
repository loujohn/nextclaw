# v0.15.42-local-login-refresh-session

## 迭代完成说明

- 排查确认本地用户名密码登录仅签发 1 小时 access token，且没有 refresh token 续期机制；SSO 登录则具备 refresh 流程，导致两类登录体验不一致，本地登录更容易在短时间后失效。
- 为本地登录补充 refresh token：登录接口现在同时返回 access token 与 refresh token，前端复用既有 `/api/auth/token` 刷新链路自动续签。
- 扩展本地 JWT 工具能力：区分 access token / refresh token 的 audience 与用途，并支持通过运行时配置调整本地 access/refresh TTL。
- 刷新接口新增本地 refresh token 分支：当 refresh token 为本地签发时，由后端直接校验 refresh token、重新读取当前用户状态并重新签发一组新 token。
- 前端密码登录改为复用统一 token 响应处理逻辑，确保本地登录也会持久化 refresh token 并按过期时间自动续签。

## 测试/验证/验收方式

- VS Code 问题检查：对认证相关改动文件执行问题检查，未发现新的类型或语法错误。
- 定向单测：`pnpm -C packages/nextclaw-digital-employee exec vitest run tests/local-jwt.test.ts`
- 定向 lint：`pnpm -C packages/nextclaw-digital-employee exec eslint app/composables/useAuth.ts server/utils/local-jwt.ts server/api/auth/login.post.ts server/api/auth/token.post.ts server/middleware/auth.ts nuxt.config.ts tests/local-jwt.test.ts`
- lint 结果仅出现既有警告：`app/composables/useAuth.ts` 函数体过长，本次未新增该结构性问题。
- 未执行全量 `build/tsc`：本次只触达数字员工包内认证链路，且仓库已有 Nuxt/类型基线噪音；因此采用“改动文件问题检查 + 定向 vitest + 定向 eslint”作为最小充分验证。

## 发布/部署方式

- 若为本地或测试环境，重启数字员工平台对应 Nuxt 服务使新的认证逻辑生效。
- 若要调整登录保持时长，可在部署环境设置：`LOCAL_ACCESS_TOKEN_TTL` 默认 `1h`，`LOCAL_REFRESH_TOKEN_TTL` 默认 `14d`。
- 本次仅涉及前后端认证逻辑，不涉及数据库 schema 变更，因此 migration 不适用。
- 已登录的本地账号需要重新登录一次，拿到新的 refresh token 后才能享受自动续期能力。

## 用户/产品视角的验收步骤

1. 使用本地账号（用户名密码）登录数字员工平台。
2. 保持页面停留超过原 access token 生命周期的关键节点，或手工将 `LOCAL_ACCESS_TOKEN_TTL` 调小到便于验证的值后重测。
3. 在 access token 接近过期后继续操作页面，确认用户不会被强制跳回登录页，接口仍可正常返回。
4. 刷新浏览器页面，确认前端可以基于本地 refresh token 恢复登录态。
5. 手动退出登录后重新打开页面，确认本地 token 已清理，不会自动恢复旧登录态。