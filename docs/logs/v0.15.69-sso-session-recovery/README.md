# v0.15.69 sso session recovery

## 迭代完成说明

- 统一登录链路新增会话恢复能力：受保护接口返回 401 时，前端不再立刻跳回登录页，而是先尝试使用 refresh token 续期 access token。
- `useAuth` 新增 `recoverSession` 与按需续期逻辑，当页面从后台切回前台或重新获得焦点时，会在 access token 即将过期时主动补一次 refresh。
- `fetchMe` 在 access token 已失效但 refresh token 仍有效的情况下，改为先恢复会话再重试用户信息拉取，减少“明明有 refresh token 仍被迫重新登录”的场景。

## 测试/验证/验收方式

- 类型检查：在 `packages/nextclaw-digital-employee` 下执行 `pnpm exec nuxi typecheck`，结果静默通过。
- 文件级错误检查：针对 `app/composables/useAuth.ts` 与 `app/plugins/auth-401.client.ts` 执行 IDE 错误检查，结果无错误。
- 局部 lint：在 `packages/nextclaw-digital-employee` 下执行 `pnpm exec eslint app/composables/useAuth.ts app/plugins/auth-401.client.ts`，结果无新错误；保留 `app/composables/useAuth.ts` 既有的 `max-lines-per-function` warning。
- 冒烟验收建议：将 Keycloak access token 生命周期设为 10 分钟，登录后让页面后台放置超过 10 分钟，再切回页面触发任意受保护接口，请确认不会立即回到登录页，而是自动恢复登录态。

## 发布/部署方式

- 本次仅涉及数字员工前端鉴权逻辑，无数据库 migration。
- 合并后重新构建并发布 `@nextclaw/digital-employee` 对应的 Nuxt 服务即可生效。
- 若线上使用 Keycloak 统一登录，建议同时检查 Realm / Client 的 access token 与 refresh token 生命周期配置，确保前端自动续期与服务端策略一致。

## 用户/产品视角的验收步骤

1. 使用统一身份登录进入数字员工任意受保护页面。
2. 保持页面打开并等待超过当前 access token 生命周期，例如 10 分钟。
3. 将浏览器标签页切到后台一段时间后再切回，或直接触发任意需要鉴权的页面操作。
4. 确认页面不会立刻跳回登录页；若 refresh token 仍有效，应自动恢复会话并继续使用。
5. 仅在 refresh token / SSO session 也失效时，页面才应提示“登录已失效，请重新登录”并跳回登录页。