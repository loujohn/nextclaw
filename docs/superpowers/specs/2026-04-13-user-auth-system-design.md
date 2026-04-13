# 用户系统 + Keycloak 对接 — 设计文档

**日期**: 2026-04-13
**状态**: Approved
**适用范围**: `packages/nextclaw-digital-employee`

---

## 设计决策摘要

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 平台定位 | 企业 SSO + 独立账号兼顾 | 支持钉钉组织同步用户和外部独立用户 |
| 登录体验 | 跳转 Keycloak 登录页 | 实现简单，Keycloak 处理所有认证逻辑 |
| 用户 vs 人类员工 | 分离 + 手动关联 | 职责清晰，外部用户可能不在钉钉组织中 |
| Token 存储 | 内存 + localStorage | 行业 SPA 通用做法，实现简单 |
| 未登录行为 | 显示品牌登录落地页 | 更好的用户体验和品牌呈现 |
| 认证中间件 | 混合（Middleware + Guard） | JWT 解析自动化 + 权限检查按需精细化 |
| 登录页设计 | 左右分栏 | 企业级专业感 |

---

## 1. 数据模型

### 1.1 users 表

```sql
CREATE TABLE users (
  id                TEXT PRIMARY KEY,
  keycloak_sub      TEXT NOT NULL UNIQUE,
  email             TEXT NOT NULL UNIQUE,
  display_name      TEXT NOT NULL DEFAULT '',
  avatar_url        TEXT NOT NULL DEFAULT '',
  role              TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin', 'manager', 'user')),
  is_active         INTEGER NOT NULL DEFAULT 1,      -- 0=禁用 1=启用
  department_id     TEXT REFERENCES departments(id) ON DELETE SET NULL,
  human_employee_id TEXT REFERENCES human_employees(id) ON DELETE SET NULL,
  preferences       TEXT NOT NULL DEFAULT '{}',       -- JSON 字符串
  last_login_at     TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE INDEX idx_users_keycloak_sub ON users(keycloak_sub);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_is_active ON users(is_active);
```

### 1.2 与 human_employees 的关系

- `human_employee_id` 为可选外键，仅通过 admin 手动绑定
- 不做自动匹配（email/姓名在两个系统间可能不一致）
- 关联后的效果：用户可查看个人任务、钉钉消息历史

### 1.3 用户状态

| 值 | 含义 | 行为 |
|----|------|------|
| `1` | 启用 | 正常访问 |
| `0` | 禁用 | 中间件拒绝请求（403），前端跳转提示页 |

- admin 在用户管理页切换用户状态
- 禁用用户的已有 access_token 在下次请求时被拦截（中间件检查 `is_active`）

### 1.4 角色说明

| 角色 | 存储值 | 说明 |
|------|--------|------|
| 系统管理员 | `admin` | 全局权限 |
| 部门管理员 | `manager` | 本部门范围，通过 `department_id` 限定 |
| 普通成员 | `user` | 已授权资源的访问权限 |

- 角色存储在本地 `users.role` 字段
- 首次登录默认 `user` 角色
- admin 通过用户管理页修改角色

---

## 2. 认证流程

### 2.1 OIDC PKCE 登录流程

```
用户访问平台
  │
  ├── 有 token (localStorage) → 尝试解析
  │   ├── 有效 → 正常使用
  │   └── 过期 → 用 refresh_token 续期
  │       ├── 成功 → 正常使用
  │       └── 失败 → 清除 token → 跳转登录页
  │
  └── 无 token → 显示登录落地页
      │
      └── 用户点击"登录"
          │
          ├── 前端生成 code_verifier + code_challenge (S256)
          ├── 前端生成随机 state，存入 sessionStorage
          ├── 重定向到 Keycloak:
          │   GET /auth/realms/{realm}/protocol/openid-connect/auth
          │   ?client_id=de-platform
          │   &response_type=code
          │   &redirect_uri={origin}/auth/callback
          │   &code_challenge={challenge}
          │   &code_challenge_method=S256
          │   &scope=openid profile email
          │   &state={state}
          │
          ├── 用户在 Keycloak 完成登录（密码/SSO/2FA）
          │
          ├── Keycloak 回调: /auth/callback?code=xxx&state={state}
          │
          ├── 前端校验 state 与 sessionStorage 一致（防 OAuth CSRF）
          │   └── 不一致 → 拒绝并显示错误
          │
          ├── 前端用 code + code_verifier 换取 token:
          │   POST /auth/realms/{realm}/protocol/openid-connect/token
          │   → access_token + refresh_token + id_token
          │
          ├── access_token 存入内存变量
          ├── refresh_token 存入 localStorage
          │
          └── GET /api/auth/me (Authorization: Bearer {access_token})
              └── 服务端查询/创建 user 记录 → 返回用户信息
```

### 2.2 Token 管理策略

| 项 | 规格 |
|----|------|
| Access Token 存储 | 内存（页面刷新时用 refresh_token 重新获取） |
| Refresh Token 存储 | localStorage |
| Access Token 有效期 | 由 Keycloak 配置（建议 5 分钟） |
| Refresh Token 有效期 | 由 Keycloak 配置（建议 30 天） |
| 自动续期 | Access Token 过期前 30 秒自动刷新 |
| Refresh Token Rotation | 开启（Keycloak 配置），每次刷新下发新 refresh_token |
| 并发刷新策略 | useAuth 内部维护单例锁，多 tab/多请求共享同一 refresh Promise |
| 刷新失败处理 | 清除所有 token → 跳转登录页 |

### 2.3 登出流程

```
用户点击"登出"
  ├── 清除内存中的 access_token
  ├── 清除 localStorage 中的 refresh_token
  └── 重定向到 Keycloak 登出端点:
      GET /auth/realms/{realm}/protocol/openid-connect/logout
      ?post_logout_redirect_uri={origin}/login
```

---

## 3. 服务端架构

### 3.1 中间件链（方案 C：混合）

```
请求到达 Nuxt Server
  │
  ▼
server/middleware/auth.ts
  │
  ├── 路径匹配公开路由白名单？
  │   公开路由: /auth/callback, /api/health, /login, /_nuxt/*, /favicon.ico
  │   └── 是 → 跳过，继续到 handler
  │
  ├── 提取 Authorization: Bearer {token}
  │   └── 无 header → 401 Unauthorized
  │
  ├── 验证 JWT 签名
  │   ├── 获取 Keycloak JWKS (缓存 5 分钟)
  │   ├── 验证 token 签名、过期时间、issuer、audience(aud === 'de-platform')
  │   └── 验证失败 → 401 Unauthorized
  │
  ├── 解码 JWT payload
  │   ├── sub (Keycloak user ID)
  │   ├── email
  │   ├── name (display name)
  │   └── realm_access.roles (Keycloak roles, 仅参考)
  │
  ├── Upsert 本地 user 记录（防首次登录并发冲突）
  │   ├── INSERT INTO users (...) VALUES (...)
  │   │   ON CONFLICT(keycloak_sub) DO UPDATE SET
  │   │   last_login_at=NOW, display_name=excluded.display_name, email=excluded.email
  │   ├── SELECT * FROM users WHERE keycloak_sub = {sub}
  │   └── 检查 is_active → 0 则返回 403 "账号已被禁用"
  │
  └── 注入 event.context.user = {
        id, keycloakSub, email, displayName, role,
        isActive, departmentId, humanEmployeeId, avatarUrl
      }
```

### 3.2 权限 Guard 函数

```typescript
// server/utils/auth-guards.ts

function requireAuth(event: H3Event): UserContext {
  const user = event.context.user;
  if (!user) throw createError({ statusCode: 401 });
  return user;
}

function requireRole(event: H3Event, ...roles: string[]): UserContext {
  const user = requireAuth(event);
  if (!roles.includes(user.role)) throw createError({ statusCode: 403 });
  return user;
}

function requireDepartmentAccess(event: H3Event, departmentId: string): UserContext {
  const user = requireAuth(event);
  if (user.role === 'admin') return user;
  if (user.role === 'manager' && user.departmentId === departmentId) return user;
  throw createError({ statusCode: 403 });
}
```

### 3.3 现有 API 鉴权改造

所有 `/api/**` 路由通过 middleware 自动获得 `event.context.user`。需要精细权限的 API 添加 Guard：

| API | Guard |
|-----|-------|
| `/api/users/**` | `requireRole('admin')` |
| `/api/employees` POST/PATCH/DELETE | `requireRole('admin', 'manager')` + 部门校验 |
| `/api/skills/categories` POST/PATCH/DELETE | `requireRole('admin')` |
| `/api/integrations/**` PUT | `requireRole('admin')` |
| `/api/secrets/**` | `requireRole('admin')` |
| `/api/tasks` POST | `requireRole('admin', 'manager')` |
| `/api/tasks/:id/rating` PATCH | `requireRole('admin', 'manager')` |
| `/api/message-rules/**` | `requireRole('admin')` |
| 其他所有 API | 仅需登录（middleware 已保证） |

---

## 4. 前端架构

### 4.1 新增页面

| 路径 | 组件 | 说明 |
|------|------|------|
| `/login` | `pages/login.vue` | 品牌落地页，左右分栏设计 |
| `/auth/callback` | `pages/auth/callback.vue` | OIDC 回调，处理 code → token；需处理 `?error=xxx` 错误参数（用户取消、账号被禁等） |
| `/users` | `pages/users/index.vue` | 用户管理（admin only） |

### 4.2 核心 Composable

```typescript
// composables/useAuth.ts

interface UseAuth {
  // 状态
  user: Ref<UserView | null>;
  isAuthenticated: ComputedRef<boolean>;
  isAdmin: ComputedRef<boolean>;
  isManager: ComputedRef<boolean>;
  loading: Ref<boolean>;

  // 方法
  login(): void;                    // 跳转 Keycloak
  logout(): Promise<void>;          // 清除 token + Keycloak 登出
  refreshToken(): Promise<boolean>; // 续期（内部有单例锁，防并发）
  waitUntilReady(): Promise<void>;  // 等待初始化/token恢复完成
  getAccessToken(): string | null;  // 获取当前 token
  hasRole(...roles: string[]): boolean;
  canManageDepartment(deptId: string): boolean;
}
```

### 4.3 路由守卫

```typescript
// middleware/auth.global.ts (Nuxt client middleware)

const PUBLIC_ROUTES = ['/login', '/auth/callback'];

export default defineNuxtRouteMiddleware(async (to) => {
  const { isAuthenticated, loading, waitUntilReady } = useAuth();

  if (PUBLIC_ROUTES.includes(to.path)) return;

  // 等待 token 恢复完成（刷新页面场景），避免 loading 期间放行
  if (loading.value) await waitUntilReady();

  if (!isAuthenticated.value) return navigateTo('/login');
});
```

> `waitUntilReady()` 返回 Promise，在 refresh_token 续期完成或确认无 token 后 resolve。

### 4.4 侧边栏/导航栏改造

- 导航栏右侧：用户头像 + 下拉菜单（角色标签、个人设置、登出）
- 侧边栏菜单按角色动态显示/隐藏：
  - `user`: Dashboard、我的员工（已授权）、我的任务
  - `manager`: + 部门员工管理、部门任务、Skill 管理（本部门）
  - `admin`: + 用户管理、集成配置、安全设置、组织架构、全局 Skill

### 4.5 登录落地页设计

左右分栏布局：
- **左栏**：深色背景，品牌 Logo + 标语 + 功能亮点
- **右栏**：白色/浅色背景，欢迎文字 + "统一身份登录" 按钮

---

## 5. 权限矩阵

| 功能模块 | admin | manager | user |
|---------|-------|---------|------|
| Dashboard | 全局数据 | 本部门数据 | 个人相关 |
| 数字员工管理 | 全部 CRUD | 本部门 CRUD | 已授权只读 |
| 员工对话 | 全部 | 本部门 | 已授权的 |
| Skill 管理 | 全局+员工级 | 本部门员工 | 只读 |
| 任务管理 | 全部 | 本部门 | 仅个人 |
| 集成配置 | 全部 | 只读 | 不可见 |
| 安全/密钥 | 全部 | 不可见 | 不可见 |
| 用户管理 | 全部 | 不可见 | 不可见 |
| 组织架构 | 全部 | 本部门 | 不可见 |

---

## 6. 环境变量

```env
# Keycloak 配置（必需）
KEYCLOAK_URL=https://auth.example.com
KEYCLOAK_REALM=digital-employee
KEYCLOAK_CLIENT_ID=de-platform

# 可选
KEYCLOAK_CLIENT_SECRET=xxx   # 仅后端 service account 场景需要
```

前端通过 Nuxt `runtimeConfig.public` 注入 Keycloak URL、Realm、Client ID。

---

## 7. JWKS 缓存策略

- 启动时从 Keycloak 拉取 JWKS
- 缓存 5 分钟，过期后异步刷新
- 验证失败时立即刷新 JWKS（处理 Keycloak 密钥轮换）
- Keycloak 不可达时，使用缓存的最后一份 JWKS（仅验证已有 token，不允许新登录）

---

## 8. 错误处理

| 场景 | HTTP 状态 | 行为 |
|------|----------|------|
| 无 token | 401 | 前端跳转 /login |
| Token 过期 | 401 | 前端自动 refresh → 重试 → 失败则跳转 /login |
| 签名无效 | 401 | 前端跳转 /login |
| 账号已禁用 | 403 | 前端显示"账号已被禁用，请联系管理员" |
| 角色不足 | 403 | 前端显示"无权限"页面 |
| OAuth state 不匹配 | — | 前端显示"认证异常，请重新登录" |
| Callback error 参数 | — | 前端解析 `?error=xxx&error_description=xxx`，显示对应提示 |
| Keycloak 不可达 | 503 | 使用缓存 JWKS；新登录显示"认证服务暂时不可用" |

---

## 9. 文件清单

### 新增

| 文件 | 说明 |
|------|------|
| `server/middleware/auth.ts` | JWT 解析 + 用户注入 |
| `server/utils/auth-guards.ts` | requireAuth / requireRole / requireDepartmentAccess |
| `server/utils/jwks-cache.ts` | JWKS 缓存管理 |
| `server/repositories/user-repository.ts` | users 表 CRUD |
| `server/api/auth/me.get.ts` | 获取当前用户信息 |
| `server/api/auth/logout.post.ts` | 服务端登出处理 |
| `server/api/users/index.get.ts` | 用户列表 (admin) |
| `server/api/users/[id].patch.ts` | 更新用户角色/绑定 (admin) |
| `app/composables/useAuth.ts` | 前端认证状态管理 |
| `app/middleware/auth.global.ts` | 前端路由守卫 |
| `app/pages/login.vue` | 登录落地页 |
| `app/pages/auth/callback.vue` | OIDC 回调页 |
| `app/pages/users/index.vue` | 用户管理页 |
| `migrations/002_users_table.ts` | users 表 migration |

### 改造

| 文件 | 改造内容 |
|------|---------|
| `app/app.vue` 或布局组件 | 导航栏增加用户头像/登出 |
| 侧边栏组件 | 按角色动态菜单 |
| 所有需要精细权限的 API handler | 添加 requireRole 调用 |
| `nuxt.config.ts` | 添加 Keycloak runtimeConfig |

---

## 10. 安全备忘

| 项 | 状态 | 说明 |
|----|------|------|
| PKCE (S256) | ✅ 已包含 | SPA 标准做法 |
| OAuth state 参数 | ✅ 已包含 | 防 OAuth CSRF |
| JWT aud 校验 | ✅ 已包含 | 防跨 client token 滥用 |
| Refresh Token Rotation | ✅ 已包含 | Keycloak 端开启，每次刷新废弃旧 token |
| 用户禁用即时生效 | ✅ 已包含 | 中间件检查 `is_active` |
| Upsert 防并发 | ✅ 已包含 | `ON CONFLICT DO UPDATE` |
| Refresh Token 存 localStorage | ⚠️ 已知风险 | XSS 漏洞可导致 refresh_token 泄漏；当前为行业 SPA 通用做法，若后续安全要求升级可改为 BFF 代理模式 |
| 审计日志 | 📋 后续迭代 | admin 角色变更、用户绑定等操作的审计日志在后续迭代补充 |

---

## 11. 测试计划

| 测试场景 | 验证方式 |
|---------|---------|
| 未登录访问 | 访问任意页面 → 跳转 /login |
| PKCE 登录 | /login → Keycloak → 回调 → 进入 Dashboard |
| Token 续期 | 等待 access_token 过期 → 自动刷新 → 不中断操作 |
| 权限校验 | user 角色访问 /users → 403 |
| 部门范围 | manager 访问非本部门员工 → 403 |
| 首次登录 | 新用户 Keycloak 登录 → users 表自动创建 |
| 手动绑定 | admin 在用户管理页关联 human_employee |
| 登出 | 点击登出 → 清除 token → Keycloak session 清除 |
| 账号禁用 | admin 禁用某用户 → 该用户下次请求返回 403 |
| Callback 错误 | 用户在 Keycloak 取消登录 → 回调页显示友好错误提示 |
| 并发首次登录 | 同一用户同时发起多个请求 → upsert 不报错，仅创建一条记录 |
| state 校验 | 伪造 callback URL（无 state / state 不匹配）→ 拒绝并提示错误 |
