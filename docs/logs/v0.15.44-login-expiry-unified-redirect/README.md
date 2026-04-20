# v0.15.44 login expiry unified redirect

## 迭代完成说明

- 数字员工前端新增统一的登录失效跳转状态管理，用于收口“登录已失效，请重新登录”的一次性系统提示。
- 新增客户端全局 401 拦截，仅对受保护接口生效，排除 `/api/auth/login` 与 `/api/auth/token`，避免误伤密码登录失败与 SSO token 交换流程。
- `useAuth` 中的 `fetchMe`、refresh token 续期失败与退出登录全部改为复用统一登录页跳转逻辑，确保账号密码登录、SSO 登录、退出登录最终都回到初始登录页。
- 登录页新增系统提示展示区，用户在登录态失效后会先看到明确提示，再重新选择 SSO 或账号密码登录。

## 测试/验证/验收方式

- 类型检查：在 `packages/nextclaw-digital-employee` 下执行 `pnpm exec nuxt typecheck`，结果通过且无输出。
- 文件级错误检查：针对 `app/composables/useAuth.ts`、`app/composables/useAuthRedirect.ts`、`app/plugins/auth-401.client.ts`、`app/pages/login.vue` 执行 IDE 错误检查，结果无错误。
- UI 冒烟：访问运行中的 `http://localhost:3000/dashboard`，预先写入无效 `de_access_token` cookie，页面触发 401 后自动跳回 `/login`，并展示“登录已失效，请重新登录”。
- 说明：ESLint 文件级检查未出现错误，但 `app/composables/useAuth.ts` 仍有既有的 `max-lines-per-function` warning，本次未顺手拆分该历史文件。

## 发布/部署方式

- 本次仅涉及数字员工前端代码，无数据库 migration。
- 合并后按现有数字员工前端部署流程重新构建并发布对应 Nuxt 服务即可。
- 若线上启用了独立前端进程，发布后需以失效 token 访问受保护页面做一次线上冒烟，确认 401 会回到 `/login` 并显示系统提示。

## 用户/产品视角的验收步骤

1. 先正常登录进入任意受保护页面，如工作台或员工列表。
2. 让登录态过期，或在浏览器中手动写入无效 access token。
3. 触发任意受保护接口请求。
4. 确认页面出现“登录已失效，请重新登录”提示，并自动回到初始登录页。
5. 在登录页分别验证“统一身份登录”“账号密码登录”入口仍可正常选择。
6. 点击退出登录，确认最终也回到同一个初始登录页，而不是停留在中间态页面。