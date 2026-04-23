# v0.15.51 digital-employee logout initial login

## 迭代完成说明

- 修复 nextclaw-digital-employee 在“账号密码登录”场景下退出登录仍跳到 Keycloak SSO 页面的问题。
- logout 现在会先识别当前会话类型：只有当前 access token 或 id token 来自 Keycloak 时，才调用 Keycloak logout；本地账号密码登录会直接回到平台初始登录页。
- 初始登录重定向地址统一改为 /login?mode=password，确保无论是本地退出，还是 SSO 退出后的回跳，都先落到平台初始登录页。
- 登录页新增对 mode 查询参数的识别，按重定向参数恢复 password 或 sso 模式；未命中有效参数时继续保持现有默认行为。

## 测试/验证/验收方式

- 已执行 VS Code 问题检查：app/composables/useAuthRedirect.ts、app/pages/login.vue 无新增错误。
- 已执行定向校验：pnpm -C packages/nextclaw-digital-employee exec eslint app/composables/useAuthRedirect.ts app/pages/login.vue。
- 已执行定向校验：pnpm -C packages/nextclaw-digital-employee exec eslint app/composables/useAuth.ts；结果仅有该文件既有的 max-lines-per-function 警告，无新增错误。
- 验收点：退出登录后地址应落到 /login?mode=password，页面主标题下方文案应展示“使用账号密码登录”，并保留“使用企业统一身份登录”切换入口。
- build / tsc 不适用：本次仅触达前端认证跳转与登录页初始化逻辑，且该子项目已有已知 Nuxt 类型基线噪音，按项目约定采用定向 lint 与问题检查作为最小充分验证。

## 发布/部署方式

- 本次未执行发布或部署，当前仅完成代码修复与本地定向验证。
- 若后续需要随数字员工应用一并上线，按该子项目既有前端/应用发布流程合入并部署即可；本次不涉及数据库 migration、后端接口变更或额外环境变量调整。

## 用户/产品视角的验收步骤

1. 使用本地账号密码登录进入数字员工平台。
2. 点击页面右上角退出登录。
3. 确认浏览器直接回到平台登录页，而不是先跳转到 Keycloak SSO 页面。
4. 确认当前默认展示为账号密码登录视图，同时页面仍提供“使用企业统一身份登录”按钮，用户可自行切换到 SSO。