# 用户系统 + Keycloak 对接 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为数字员工管理平台添加基于 Keycloak 的用户认证系统，包含 OIDC PKCE 登录、JWT 验证中间件、角色权限控制和用户管理界面。

**Architecture:** 服务端使用全局 Nitro middleware 解析 JWT 并注入 `event.context.user`，配合 guard 函数实现细粒度权限控制。前端使用 `useAuth` composable 管理认证状态，通过全局路由守卫保护页面。Keycloak 处理所有认证逻辑（OIDC PKCE），应用层只做 JWT 验证和本地用户管理。

**Tech Stack:** Nuxt 4 (Vue 3 + Nitro), Knex (SQLite/DM), Keycloak OIDC, jose (JWT/JWKS), Pinia, TailwindCSS, lucide-vue-next

**Design Spec:** [`docs/superpowers/specs/2026-04-13-user-auth-system-design.md`](../specs/2026-04-13-user-auth-system-design.md)

---

## File Structure

### 新增文件

| 文件 | 职责 |
|------|------|
| `server/middleware/auth.ts` | 全局 JWT 解析 + 用户上下文注入 |
| `server/utils/auth-guards.ts` | `requireAuth`/`requireRole`/`requireDepartmentAccess` |
| `server/utils/jwks-cache.ts` | Keycloak JWKS 公钥缓存管理 |
| `server/repositories/user-repository.ts` | users 表 CRUD + upsert |
| `server/api/auth/me.get.ts` | 获取当前用户信息 |
| `server/api/users/index.get.ts` | 用户列表（admin） |
| `server/api/users/[id].patch.ts` | 更新用户角色/绑定（admin） |
| `app/composables/useAuth.ts` | 前端认证状态 + token 管理 |
| `app/middleware/auth.global.ts` | 前端路由守卫 |
| `app/pages/login.vue` | 登录落地页 |
| `app/pages/auth/callback.vue` | OIDC 回调页 |
| `app/pages/users/index.vue` | 用户管理页（admin） |
| `shared/auth-types.ts` | 认证相关共享类型 |

### 改造文件

| 文件 | 改造内容 |
|------|---------|
| `server/db/schema.ts` | 添加 `users` 表类型、表名常量 |
| `server/db/knex.ts` | 添加 `createUsersTable` 和 migration entry |
| `nuxt.config.ts` | 添加 `runtimeConfig.public` Keycloak 配置 |
| `app/layouts/default.vue` | 导航栏增加用户头像/下拉菜单，菜单按角色过滤 |
| `package.json` | 添加 `jose` 依赖 |

---

## Task 1: 安装依赖 + Nuxt 配置

**Files:**
- Modify: `packages/nextclaw-digital-employee/package.json`
- Modify: `packages/nextclaw-digital-employee/nuxt.config.ts`

- [ ] **Step 1: 安装 jose 依赖**

```bash
cd packages/nextclaw-digital-employee
pnpm add jose
```

- [ ] **Step 2: 更新 nuxt.config.ts 添加 runtimeConfig**

在 `nuxt.config.ts` 的 `defineNuxtConfig` 中添加 `runtimeConfig`：

```typescript
export default defineNuxtConfig({
  // ... existing config ...
  runtimeConfig: {
    keycloakUrl: process.env.KEYCLOAK_URL ?? "",
    keycloakRealm: process.env.KEYCLOAK_REALM ?? "",
    keycloakClientSecret: process.env.KEYCLOAK_CLIENT_SECRET ?? "",
    public: {
      keycloakUrl: process.env.KEYCLOAK_URL ?? "",
      keycloakRealm: process.env.KEYCLOAK_REALM ?? "",
      keycloakClientId: process.env.KEYCLOAK_CLIENT_ID ?? "de-platform",
    },
  },
  // ... rest of config ...
});
```

- [ ] **Step 3: 验证配置加载**

```bash
cd packages/nextclaw-digital-employee
npx nuxi typecheck
```

Expected: 无类型错误

- [ ] **Step 4: Commit**

```bash
git add packages/nextclaw-digital-employee/package.json packages/nextclaw-digital-employee/nuxt.config.ts pnpm-lock.yaml
git commit -m "feat(auth): add jose dependency and keycloak runtime config"
```

---

## Task 2: 共享类型定义

**Files:**
- Create: `packages/nextclaw-digital-employee/shared/auth-types.ts`

- [ ] **Step 1: 创建认证类型文件**

创建 `shared/auth-types.ts`：

```typescript
export type UserRole = "admin" | "manager" | "user";

export type UserView = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string;
  role: UserRole;
  isActive: boolean;
  departmentId: string | null;
  humanEmployeeId: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UserContext = {
  id: string;
  keycloakSub: string;
  email: string;
  displayName: string;
  avatarUrl: string;
  role: UserRole;
  isActive: boolean;
  departmentId: string | null;
  humanEmployeeId: string | null;
};

export type UserListPayload = { ok: boolean; data: UserView[] };
export type UserPayload = { ok: boolean; data: UserView };
export type AuthMePayload = { ok: boolean; data: UserView };

export type UpdateUserInput = {
  role?: UserRole;
  isActive?: boolean;
  humanEmployeeId?: string | null;
  departmentId?: string | null;
};
```

- [ ] **Step 2: Commit**

```bash
git add packages/nextclaw-digital-employee/shared/auth-types.ts
git commit -m "feat(auth): add shared auth type definitions"
```

---

## Task 3: 数据库 — users 表 Schema + Migration

**Files:**
- Modify: `packages/nextclaw-digital-employee/server/db/schema.ts`
- Modify: `packages/nextclaw-digital-employee/server/db/knex.ts`

- [ ] **Step 1: 在 schema.ts 中添加 users 表类型和表名**

在 `PLATFORM_TABLES` 对象中添加 `users: "users"`：

```typescript
export const PLATFORM_TABLES = {
  // ... existing tables ...
  users: "users",
} as const;
```

在文件末尾添加 `UserRecord` 类型：

```typescript
export type UserRecord = {
  id: string;
  keycloak_sub: string;
  email: string;
  display_name: string;
  avatar_url: string;
  role: string;
  is_active: number;
  department_id: string | null;
  human_employee_id: string | null;
  preferences: string;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};
```

- [ ] **Step 2: 在 knex.ts 中添加 createUsersTable 函数**

在 `createSecretsTable` 函数之后添加：

```typescript
async function createUsersTable(db: Knex): Promise<void> {
  if (await db.schema.hasTable(PLATFORM_TABLES.users)) return;
  await db.schema.createTable(PLATFORM_TABLES.users, (table) => {
    table.text("id").primary();
    table.text("keycloak_sub").notNullable();
    table.text("email").notNullable();
    table.text("display_name").notNullable().defaultTo("");
    table.text("avatar_url").notNullable().defaultTo("");
    table.text("role").notNullable().defaultTo("user");
    table.integer("is_active").notNullable().defaultTo(1);
    table.text("department_id").nullable()
      .references("id").inTable(PLATFORM_TABLES.departments).onDelete("SET NULL");
    table.text("human_employee_id").nullable()
      .references("id").inTable(PLATFORM_TABLES.humanEmployees).onDelete("SET NULL");
    table.text("preferences").notNullable().defaultTo("{}");
    table.text("last_login_at").nullable();
    table.text("created_at").notNullable();
    table.text("updated_at").notNullable();
  });
  
  await createIndexIfNotExists(db, "idx_users_keycloak_sub",
    `CREATE UNIQUE INDEX "idx_users_keycloak_sub" ON "users" ("keycloak_sub")`);
  await createIndexIfNotExists(db, "idx_users_email",
    `CREATE UNIQUE INDEX "idx_users_email" ON "users" ("email")`);
  await createIndexIfNotExists(db, "idx_users_is_active",
    `CREATE INDEX "idx_users_is_active" ON "users" ("is_active")`);
}
```

- [ ] **Step 3: 在 ensurePlatformDatabase 中调用 createUsersTable**

在 `createSecretsTable(db)` 之后添加：

```typescript
await createUsersTable(db);
```

- [ ] **Step 4: 添加 migration entry**

在 `platformMigrations` 数组末尾追加：

```typescript
{
  name: "004_users_table.ts",
  async up(knex) {
    await createUsersTable(knex);
  },
  async down(knex) {
    await knex.schema.dropTableIfExists(PLATFORM_TABLES.users);
  },
},
```

- [ ] **Step 5: 验证类型**

```bash
cd packages/nextclaw-digital-employee
npx nuxi typecheck
```

Expected: 无类型错误

- [ ] **Step 6: Commit**

```bash
git add packages/nextclaw-digital-employee/server/db/schema.ts packages/nextclaw-digital-employee/server/db/knex.ts
git commit -m "feat(auth): add users table schema and migration"
```

---

## Task 4: User Repository

**Files:**
- Create: `packages/nextclaw-digital-employee/server/repositories/user-repository.ts`

- [ ] **Step 1: 创建 user-repository.ts**

```typescript
import { randomUUID } from "node:crypto";
import type { Knex } from "knex";
import { PLATFORM_TABLES, type UserRecord } from "../db/schema";
import { dbNow } from "../db/knex";
import type { UserView, UserContext, UserRole, UpdateUserInput } from "../../shared/auth-types";

export type UpsertUserFromTokenInput = {
  keycloakSub: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
};

function toUserView(record: UserRecord): UserView {
  return {
    id: record.id,
    email: record.email,
    displayName: record.display_name,
    avatarUrl: record.avatar_url,
    role: record.role as UserRole,
    isActive: record.is_active === 1,
    departmentId: record.department_id,
    humanEmployeeId: record.human_employee_id,
    lastLoginAt: record.last_login_at,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

function toUserContext(record: UserRecord): UserContext {
  return {
    id: record.id,
    keycloakSub: record.keycloak_sub,
    email: record.email,
    displayName: record.display_name,
    avatarUrl: record.avatar_url,
    role: record.role as UserRole,
    isActive: record.is_active === 1,
    departmentId: record.department_id,
    humanEmployeeId: record.human_employee_id,
  };
}

export class UserRepository {
  constructor(private db: Knex) {}

  async upsertFromToken(input: UpsertUserFromTokenInput): Promise<UserContext> {
    const now = dbNow();
    const existing = await this.db(PLATFORM_TABLES.users)
      .where({ keycloak_sub: input.keycloakSub })
      .first<UserRecord | undefined>();

    if (existing) {
      await this.db(PLATFORM_TABLES.users)
        .where({ id: existing.id })
        .update({
          email: input.email,
          display_name: input.displayName,
          avatar_url: input.avatarUrl ?? existing.avatar_url,
          last_login_at: now,
          updated_at: now,
        });
      return toUserContext({
        ...existing,
        email: input.email,
        display_name: input.displayName,
        avatar_url: input.avatarUrl ?? existing.avatar_url,
        last_login_at: now,
        updated_at: now,
      });
    }

    const id = randomUUID();
    const record: UserRecord = {
      id,
      keycloak_sub: input.keycloakSub,
      email: input.email,
      display_name: input.displayName,
      avatar_url: input.avatarUrl ?? "",
      role: "user",
      is_active: 1,
      department_id: null,
      human_employee_id: null,
      preferences: "{}",
      last_login_at: now,
      created_at: now,
      updated_at: now,
    };

    try {
      await this.db(PLATFORM_TABLES.users).insert(record);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("UNIQUE") || msg.includes("unique") || msg.includes("duplicate")) {
        const retried = await this.db(PLATFORM_TABLES.users)
          .where({ keycloak_sub: input.keycloakSub })
          .first<UserRecord>();
        if (retried) return toUserContext(retried);
      }
      throw err;
    }

    return toUserContext(record);
  }

  async findByKeycloakSub(sub: string): Promise<UserContext | null> {
    const record = await this.db(PLATFORM_TABLES.users)
      .where({ keycloak_sub: sub })
      .first<UserRecord | undefined>();
    return record ? toUserContext(record) : null;
  }

  async findById(id: string): Promise<UserView | null> {
    const record = await this.db(PLATFORM_TABLES.users)
      .where({ id })
      .first<UserRecord | undefined>();
    return record ? toUserView(record) : null;
  }

  async listAll(): Promise<UserView[]> {
    const records = await this.db(PLATFORM_TABLES.users)
      .orderBy("created_at", "desc")
      .select<UserRecord[]>("*");
    return records.map(toUserView);
  }

  async updateUser(id: string, input: UpdateUserInput): Promise<UserView | null> {
    const now = dbNow();
    const updates: Partial<UserRecord> = { updated_at: now };

    if (input.role !== undefined) updates.role = input.role;
    if (input.isActive !== undefined) updates.is_active = input.isActive ? 1 : 0;
    if (input.humanEmployeeId !== undefined) updates.human_employee_id = input.humanEmployeeId;
    if (input.departmentId !== undefined) updates.department_id = input.departmentId;

    const count = await this.db(PLATFORM_TABLES.users).where({ id }).update(updates);
    if (count === 0) return null;

    return this.findById(id);
  }
}
```

- [ ] **Step 2: 验证类型**

```bash
cd packages/nextclaw-digital-employee
npx nuxi typecheck
```

Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add packages/nextclaw-digital-employee/server/repositories/user-repository.ts
git commit -m "feat(auth): add UserRepository with upsert and CRUD"
```

---

## Task 5: JWKS 缓存管理

**Files:**
- Create: `packages/nextclaw-digital-employee/server/utils/jwks-cache.ts`

- [ ] **Step 1: 创建 jwks-cache.ts**

```typescript
import { createRemoteJWKSet, type JWTVerifyResult, jwtVerify } from "jose";

type JwksCacheConfig = {
  keycloakUrl: string;
  realm: string;
  clientId: string;
};

let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let _config: JwksCacheConfig | null = null;

function getJwksUri(config: JwksCacheConfig): URL {
  return new URL(
    `${config.keycloakUrl}/realms/${config.realm}/protocol/openid-connect/certs`
  );
}

function getIssuer(config: JwksCacheConfig): string {
  return `${config.keycloakUrl}/realms/${config.realm}`;
}

export function initJwks(config: JwksCacheConfig): void {
  _config = config;
  _jwks = createRemoteJWKSet(getJwksUri(config), {
    cooldownDuration: 30_000,
    cacheMaxAge: 300_000,
  });
}

export function resetJwks(): void {
  _config = null;
  _jwks = null;
}

export async function verifyAccessToken(
  token: string
): Promise<JWTVerifyResult | null> {
  if (!_jwks || !_config) return null;

  try {
    const result = await jwtVerify(token, _jwks, {
      issuer: getIssuer(_config),
      audience: _config.clientId,
    });
    return result;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ERR_JWKS") || msg.includes("JWKS")) {
      _jwks = createRemoteJWKSet(getJwksUri(_config), {
        cooldownDuration: 30_000,
        cacheMaxAge: 300_000,
      });
      try {
        return await jwtVerify(token, _jwks, {
          issuer: getIssuer(_config),
          audience: _config.clientId,
        });
      } catch {
        return null;
      }
    }
    return null;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/nextclaw-digital-employee/server/utils/jwks-cache.ts
git commit -m "feat(auth): add JWKS cache with auto-refresh on key rotation"
```

---

## Task 6: 服务端认证中间件

**Files:**
- Create: `packages/nextclaw-digital-employee/server/middleware/auth.ts`

- [ ] **Step 1: 创建 auth.ts 中间件**

```typescript
import { defineEventHandler, getHeader, createError } from "h3";
import { verifyAccessToken, initJwks } from "../utils/jwks-cache";
import { UserRepository } from "../repositories/user-repository";
import { useRuntimeConfig } from "#imports";

const PUBLIC_PATHS = [
  "/api/health",
  "/_nuxt/",
  "/__nuxt_error",
  "/favicon.ico",
];

const PUBLIC_PAGE_PATHS = [
  "/login",
  "/auth/callback",
];

let _initialized = false;

export default defineEventHandler(async (event) => {
  const path = event.path ?? "";

  if (PUBLIC_PAGE_PATHS.some((p) => path === p || path.startsWith(p + "?"))) {
    return;
  }
  if (PUBLIC_PATHS.some((p) => path.startsWith(p))) {
    return;
  }

  if (!path.startsWith("/api/")) {
    return;
  }

  if (!_initialized) {
    const config = useRuntimeConfig();
    if (config.keycloakUrl && config.keycloakRealm) {
      initJwks({
        keycloakUrl: config.keycloakUrl as string,
        realm: config.keycloakRealm as string,
        clientId: (config.public as Record<string, string>).keycloakClientId ?? "de-platform",
      });
    }
    _initialized = true;
  }

  const authHeader = getHeader(event, "authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw createError({ statusCode: 401, statusMessage: "Missing or invalid Authorization header" });
  }

  const token = authHeader.slice(7);
  const result = await verifyAccessToken(token);
  if (!result) {
    throw createError({ statusCode: 401, statusMessage: "Invalid or expired token" });
  }

  const payload = result.payload as Record<string, unknown>;
  const sub = payload.sub as string;
  const email = (payload.email as string) ?? "";
  const name = (payload.name as string) ?? (payload.preferred_username as string) ?? "";

  const { db } = event.context as { db: import("knex").Knex };
  const userRepo = new UserRepository(db);
  const user = await userRepo.upsertFromToken({
    keycloakSub: sub,
    email,
    displayName: name,
  });

  if (!user.isActive) {
    throw createError({ statusCode: 403, statusMessage: "Account disabled" });
  }

  event.context.user = user;
});
```

> **注意**：`event.context.db` 需要由现有的数据库初始化插件注入。如果当前没有在 context 上注入 db，需要在 Task 6 的 Step 2 中调整获取 db 的方式。

- [ ] **Step 2: 确认 db 注入方式**

检查 `server/plugins/00.proxy-bootstrap.ts` 了解 db 实例如何获取。如果 db 不在 `event.context` 上，改为通过模块级单例获取：

```typescript
// 替代方案：如果 db 不在 event.context 上
import { getPlatformDb } from "../plugins/00.proxy-bootstrap";
// 在中间件中使用：
const db = getPlatformDb();
const userRepo = new UserRepository(db);
```

实现时需根据 `00.proxy-bootstrap.ts` 的实际导出调整。

- [ ] **Step 3: 验证中间件注册**

Nuxt 自动注册 `server/middleware/` 下的文件。运行：

```bash
cd packages/nextclaw-digital-employee
npx nuxi typecheck
```

Expected: 无类型错误

- [ ] **Step 4: Commit**

```bash
git add packages/nextclaw-digital-employee/server/middleware/auth.ts
git commit -m "feat(auth): add server middleware for JWT verification and user injection"
```

---

## Task 7: 权限 Guard 函数

**Files:**
- Create: `packages/nextclaw-digital-employee/server/utils/auth-guards.ts`

- [ ] **Step 1: 创建 auth-guards.ts**

```typescript
import { createError, type H3Event } from "h3";
import type { UserContext, UserRole } from "../../shared/auth-types";

export function requireAuth(event: H3Event): UserContext {
  const user = event.context.user as UserContext | undefined;
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: "Authentication required" });
  }
  return user;
}

export function requireRole(event: H3Event, ...roles: UserRole[]): UserContext {
  const user = requireAuth(event);
  if (!roles.includes(user.role)) {
    throw createError({ statusCode: 403, statusMessage: "Insufficient permissions" });
  }
  return user;
}

export function requireDepartmentAccess(event: H3Event, departmentId: string): UserContext {
  const user = requireAuth(event);
  if (user.role === "admin") return user;
  if (user.role === "manager" && user.departmentId === departmentId) return user;
  throw createError({ statusCode: 403, statusMessage: "No access to this department" });
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/nextclaw-digital-employee/server/utils/auth-guards.ts
git commit -m "feat(auth): add requireAuth, requireRole, requireDepartmentAccess guards"
```

---

## Task 8: 认证 API 端点

**Files:**
- Create: `packages/nextclaw-digital-employee/server/api/auth/me.get.ts`
- Create: `packages/nextclaw-digital-employee/server/api/auth/logout.post.ts`
- Create: `packages/nextclaw-digital-employee/server/api/users/index.get.ts`
- Create: `packages/nextclaw-digital-employee/server/api/users/[id].patch.ts`

- [ ] **Step 1: 创建 /api/auth/me**

创建 `server/api/auth/me.get.ts`：

```typescript
import { defineEventHandler, createError } from "h3";
import { requireAuth } from "../../utils/auth-guards";
import { UserRepository } from "../../repositories/user-repository";

export default defineEventHandler(async (event) => {
  const userCtx = requireAuth(event);
  const { db } = event.context as { db: import("knex").Knex };
  const userRepo = new UserRepository(db);
  const user = await userRepo.findById(userCtx.id);

  if (!user) {
    throw createError({ statusCode: 404, statusMessage: "User not found" });
  }

  return { ok: true, data: user };
});
```

- [ ] **Step 1.5: 创建 /api/auth/logout**

创建 `server/api/auth/logout.post.ts`（用于未来服务端 token revocation 扩展）：

```typescript
import { defineEventHandler } from "h3";
import { requireAuth } from "../../utils/auth-guards";

export default defineEventHandler(async (event) => {
  requireAuth(event);
  return { ok: true };
});
```

- [ ] **Step 2: 创建 /api/users (admin list)**

创建 `server/api/users/index.get.ts`：

```typescript
import { defineEventHandler } from "h3";
import { requireRole } from "../../utils/auth-guards";
import { UserRepository } from "../../repositories/user-repository";

export default defineEventHandler(async (event) => {
  requireRole(event, "admin");
  const { db } = event.context as { db: import("knex").Knex };
  const userRepo = new UserRepository(db);
  const users = await userRepo.listAll();
  return { ok: true, data: users };
});
```

- [ ] **Step 3: 创建 /api/users/[id] (admin update)**

创建 `server/api/users/[id].patch.ts`：

```typescript
import { defineEventHandler, readBody } from "h3";
import { requireRole } from "../../utils/auth-guards";
import { UserRepository } from "../../repositories/user-repository";
import type { UpdateUserInput } from "../../../shared/auth-types";

export default defineEventHandler(async (event) => {
  requireRole(event, "admin");
  const id = event.context.params?.id;
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Missing user id" });
  }

  const body = await readBody<UpdateUserInput>(event);
  const { db } = event.context as { db: import("knex").Knex };
  const userRepo = new UserRepository(db);
  const updated = await userRepo.updateUser(id, body);

  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: "User not found" });
  }

  return { ok: true, data: updated };
});
```

- [ ] **Step 4: 验证类型**

```bash
cd packages/nextclaw-digital-employee
npx nuxi typecheck
```

Expected: 无类型错误

- [ ] **Step 5: Commit**

```bash
git add packages/nextclaw-digital-employee/server/api/auth/me.get.ts \
  packages/nextclaw-digital-employee/server/api/users/index.get.ts \
  packages/nextclaw-digital-employee/server/api/users/\[id\].patch.ts
git commit -m "feat(auth): add /api/auth/me, /api/users endpoints"
```

---

## Task 9: 前端 useAuth Composable

**Files:**
- Create: `packages/nextclaw-digital-employee/app/composables/useAuth.ts`

- [ ] **Step 1: 创建 useAuth.ts**

```typescript
import type { UserView, UserRole } from "../../shared/auth-types";

type AuthState = {
  user: UserView | null;
  loading: boolean;
  accessToken: string | null;
};

const REFRESH_TOKEN_KEY = "de_refresh_token";
const CODE_VERIFIER_KEY = "de_code_verifier";
const OAUTH_STATE_KEY = "de_oauth_state";

let _refreshPromise: Promise<boolean> | null = null;
let _readyResolve: (() => void) | null = null;
const _readyPromise = new Promise<void>((resolve) => {
  _readyResolve = resolve;
});
let _initStarted = false;
let _refreshTimer: ReturnType<typeof setTimeout> | null = null;

function generateRandomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("").slice(0, length);
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  return crypto.subtle.digest("SHA-256", encoder.encode(plain));
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function useAuth() {
  const state = useState<AuthState>("auth", () => ({
    user: null,
    loading: true,
    accessToken: null,
  }));

  const config = useRuntimeConfig();
  const keycloakUrl = config.public.keycloakUrl as string;
  const realm = config.public.keycloakRealm as string;
  const clientId = config.public.keycloakClientId as string;

  const isAuthenticated = computed(() => !!state.value.user && !!state.value.accessToken);
  const isAdmin = computed(() => state.value.user?.role === "admin");
  const isManager = computed(() => state.value.user?.role === "manager");
  const loading = computed(() => state.value.loading);
  const user = computed(() => state.value.user);

  function getTokenEndpoint(): string {
    return `${keycloakUrl}/realms/${realm}/protocol/openid-connect/token`;
  }

  function getAuthEndpoint(): string {
    return `${keycloakUrl}/realms/${realm}/protocol/openid-connect/auth`;
  }

  function getLogoutEndpoint(): string {
    return `${keycloakUrl}/realms/${realm}/protocol/openid-connect/logout`;
  }

  async function login(): Promise<void> {
    const codeVerifier = generateRandomString(64);
    const challengeBuffer = await sha256(codeVerifier);
    const codeChallenge = base64UrlEncode(challengeBuffer);
    const oauthState = generateRandomString(32);

    sessionStorage.setItem(CODE_VERIFIER_KEY, codeVerifier);
    sessionStorage.setItem(OAUTH_STATE_KEY, oauthState);

    const redirectUri = `${window.location.origin}/auth/callback`;
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      scope: "openid profile email",
      state: oauthState,
    });

    window.location.href = `${getAuthEndpoint()}?${params}`;
  }

  async function handleCallback(code: string, returnedState: string): Promise<boolean> {
    const savedState = sessionStorage.getItem(OAUTH_STATE_KEY);
    if (returnedState !== savedState) {
      console.error("OAuth state mismatch");
      return false;
    }

    const codeVerifier = sessionStorage.getItem(CODE_VERIFIER_KEY);
    if (!codeVerifier) {
      console.error("Missing code verifier");
      return false;
    }

    sessionStorage.removeItem(CODE_VERIFIER_KEY);
    sessionStorage.removeItem(OAUTH_STATE_KEY);

    const redirectUri = `${window.location.origin}/auth/callback`;
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    });

    try {
      const res = await fetch(getTokenEndpoint(), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      if (!res.ok) return false;

      const data = await res.json();
      state.value.accessToken = data.access_token;
      if (data.refresh_token) {
        localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
      }

      await fetchMe();
      scheduleTokenRefresh(data.expires_in ?? 300);
      return true;
    } catch {
      return false;
    }
  }

  async function refreshToken(): Promise<boolean> {
    if (_refreshPromise) return _refreshPromise;

    _refreshPromise = (async () => {
      const rt = localStorage.getItem(REFRESH_TOKEN_KEY);
      if (!rt) return false;

      try {
        const body = new URLSearchParams({
          grant_type: "refresh_token",
          client_id: clientId,
          refresh_token: rt,
        });

        const res = await fetch(getTokenEndpoint(), {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
        });

        if (!res.ok) {
          clearTokens();
          return false;
        }

        const data = await res.json();
        state.value.accessToken = data.access_token;
        if (data.refresh_token) {
          localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
        }

        scheduleTokenRefresh(data.expires_in ?? 300);
        return true;
      } catch {
        clearTokens();
        return false;
      } finally {
        _refreshPromise = null;
      }
    })();

    return _refreshPromise;
  }

  async function fetchMe(): Promise<void> {
    if (!state.value.accessToken) return;
    try {
      const res = await $fetch<{ ok: boolean; data: UserView }>("/api/auth/me", {
        headers: { Authorization: `Bearer ${state.value.accessToken}` },
      });
      if (res.ok) {
        state.value.user = res.data;
      }
    } catch {
      state.value.user = null;
    }
  }

  function scheduleTokenRefresh(expiresInSeconds: number): void {
    if (_refreshTimer) clearTimeout(_refreshTimer);
    const refreshInMs = Math.max((expiresInSeconds - 30) * 1000, 10_000);
    _refreshTimer = setTimeout(() => refreshToken(), refreshInMs);
  }

  function clearTokens(): void {
    state.value.accessToken = null;
    state.value.user = null;
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    if (_refreshTimer) {
      clearTimeout(_refreshTimer);
      _refreshTimer = null;
    }
  }

  async function logout(): Promise<void> {
    const redirectUri = `${window.location.origin}/login`;
    clearTokens();
    window.location.href = `${getLogoutEndpoint()}?post_logout_redirect_uri=${encodeURIComponent(redirectUri)}`;
  }

  function getAccessToken(): string | null {
    return state.value.accessToken;
  }

  function hasRole(...roles: UserRole[]): boolean {
    return !!state.value.user && roles.includes(state.value.user.role);
  }

  function canManageDepartment(deptId: string): boolean {
    if (!state.value.user) return false;
    if (state.value.user.role === "admin") return true;
    if (state.value.user.role === "manager" && state.value.user.departmentId === deptId) return true;
    return false;
  }

  async function waitUntilReady(): Promise<void> {
    return _readyPromise;
  }

  async function initialize(): Promise<void> {
    if (!import.meta.client) return;
    if (_initStarted) return;
    _initStarted = true;
    state.value.loading = true;

    const hasRefreshToken = !!localStorage.getItem(REFRESH_TOKEN_KEY);
    if (hasRefreshToken) {
      const success = await refreshToken();
      if (success) {
        await fetchMe();
      }
    }

    state.value.loading = false;
    _readyResolve?.();
  }

  if (import.meta.client) {
    initialize();
  }

  return {
    user,
    isAuthenticated,
    isAdmin,
    isManager,
    loading,
    login,
    logout,
    handleCallback,
    refreshToken,
    waitUntilReady,
    getAccessToken,
    hasRole,
    canManageDepartment,
  };
}
```

- [ ] **Step 2: 验证类型**

```bash
cd packages/nextclaw-digital-employee
npx nuxi typecheck
```

Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add packages/nextclaw-digital-employee/app/composables/useAuth.ts
git commit -m "feat(auth): add useAuth composable with PKCE, token refresh, state guard"
```

---

## Task 10: 前端路由守卫

**Files:**
- Create: `packages/nextclaw-digital-employee/app/middleware/auth.global.ts`

- [ ] **Step 1: 创建前端路由守卫**

```typescript
const PUBLIC_ROUTES = ["/login", "/auth/callback"];

export default defineNuxtRouteMiddleware(async (to) => {
  if (!import.meta.client) return;

  if (PUBLIC_ROUTES.includes(to.path)) return;

  const { isAuthenticated, loading, waitUntilReady } = useAuth();

  if (loading.value) {
    await waitUntilReady();
  }

  if (!isAuthenticated.value) {
    return navigateTo("/login");
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add packages/nextclaw-digital-employee/app/middleware/auth.global.ts
git commit -m "feat(auth): add global frontend route guard"
```

---

## Task 11: 登录页

**Files:**
- Create: `packages/nextclaw-digital-employee/app/pages/login.vue`

- [ ] **Step 1: 创建 login.vue**

```vue
<script setup lang="ts">
import { Zap, ArrowRight } from "lucide-vue-next";

definePageMeta({ layout: false });

const { login, isAuthenticated } = useAuth();
const router = useRouter();

if (isAuthenticated.value) {
  router.replace("/dashboard");
}

const features = [
  { title: "智能执行", desc: "7×24 自动处理日常工作" },
  { title: "多渠道协同", desc: "钉钉、邮件等统一接入" },
  { title: "技能扩展", desc: "可编排的工作技能体系" },
];
</script>

<template>
  <div class="flex min-h-screen">
    <div class="hidden w-1/2 flex-col justify-between bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-12 text-white lg:flex">
      <div>
        <div class="flex items-center gap-3">
          <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-emerald-400 shadow-lg">
            <Zap class="h-5 w-5 text-white" :stroke-width="2.2" fill="currentColor" />
          </span>
          <span class="text-xl font-semibold tracking-tight">元工（MetaWorker）</span>
        </div>
        <p class="mt-2 text-sm text-gray-400">智能协作 · 自动执行</p>
      </div>

      <div class="space-y-8">
        <h2 class="text-3xl font-bold leading-tight">
          让数字员工<br />成为你的超级队友
        </h2>
        <div class="space-y-4">
          <div
            v-for="feat in features"
            :key="feat.title"
            class="rounded-lg border border-white/10 bg-white/5 p-4 backdrop-blur"
          >
            <p class="font-medium">{{ feat.title }}</p>
            <p class="mt-1 text-sm text-gray-400">{{ feat.desc }}</p>
          </div>
        </div>
      </div>

      <p class="text-xs text-gray-500">© {{ new Date().getFullYear() }} MetaWorker. All rights reserved.</p>
    </div>

    <div class="flex flex-1 items-center justify-center bg-background p-8">
      <div class="w-full max-w-sm space-y-8 text-center">
        <div class="lg:hidden flex items-center justify-center gap-3 mb-4">
          <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-emerald-400 shadow-lg">
            <Zap class="h-5 w-5 text-white" :stroke-width="2.2" fill="currentColor" />
          </span>
          <span class="text-xl font-semibold">元工</span>
        </div>

        <div>
          <h1 class="text-2xl font-bold text-foreground">欢迎回来</h1>
          <p class="mt-2 text-sm text-muted-foreground">使用企业统一身份登录</p>
        </div>

        <button
          class="group flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/30"
          @click="login"
        >
          统一身份登录
          <ArrowRight class="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </button>

        <p class="text-xs text-muted-foreground">
          点击登录即表示你同意我们的使用条款
        </p>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add packages/nextclaw-digital-employee/app/pages/login.vue
git commit -m "feat(auth): add split-layout login page"
```

---

## Task 12: OIDC 回调页

**Files:**
- Create: `packages/nextclaw-digital-employee/app/pages/auth/callback.vue`

- [ ] **Step 1: 创建 callback.vue**

```vue
<script setup lang="ts">
import { Loader2 } from "lucide-vue-next";

definePageMeta({ layout: false });

const route = useRoute();
const router = useRouter();
const { handleCallback } = useAuth();

const error = ref<string | null>(null);

onMounted(async () => {
  const errorParam = route.query.error as string | undefined;
  if (errorParam) {
    const desc = (route.query.error_description as string) ?? errorParam;
    error.value = `认证失败：${desc}`;
    return;
  }

  const code = route.query.code as string | undefined;
  const state = route.query.state as string | undefined;

  if (!code || !state) {
    error.value = "缺少认证参数，请重新登录";
    return;
  }

  const success = await handleCallback(code, state);
  if (success) {
    router.replace("/dashboard");
  } else {
    error.value = "登录处理失败，请重试";
  }
});
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-background">
    <div v-if="error" class="text-center space-y-4">
      <p class="text-destructive text-sm">{{ error }}</p>
      <NuxtLink
        to="/login"
        class="inline-block rounded-lg bg-primary px-4 py-2 text-sm text-white hover:bg-primary/90"
      >
        返回登录
      </NuxtLink>
    </div>
    <div v-else class="flex flex-col items-center gap-3 text-muted-foreground">
      <Loader2 class="h-8 w-8 animate-spin" />
      <p class="text-sm">正在处理登录...</p>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add packages/nextclaw-digital-employee/app/pages/auth/callback.vue
git commit -m "feat(auth): add OIDC callback page with error handling"
```

---

## Task 13: 改造 Layout — 导航栏用户区域 + 角色菜单过滤

**Files:**
- Modify: `packages/nextclaw-digital-employee/app/layouts/default.vue`

- [ ] **Step 1: 改造 default.vue**

在 `<script setup>` 中添加 `useAuth` 并定义角色可见菜单。在侧边栏底部和导航栏添加用户头像下拉菜单。

具体改造点：

1. 导入 `useAuth` 和 `LogOut`, `User`, `ChevronDown` 图标
2. 从 `useAuth()` 获取 `user`、`isAdmin`、`isManager`、`logout`、`hasRole`
3. 根据角色过滤 `navItems`（给每个 item 添加 `roles` 字段）
4. 在侧边栏底部添加用户头像 + 名字 + 登出按钮
5. admin 角色显示"用户管理"菜单项

改造后的 `navItems` 定义：

```typescript
import { LogOut, User, ChevronDown, UserCog } from "lucide-vue-next";

const { user, isAdmin, isManager, logout, hasRole } = useAuth();

type NavItem = { label: string; to: string; icon: Component; roles?: string[] };

const allNavItems: NavItem[] = [
  { label: "组织架构", to: "/employees", icon: Users },
  { label: "工作中心", to: "/dashboard", icon: Home },
  { label: "技能中心", to: "/skills", icon: Blocks },
  { label: "集成中心", to: "/integrations", icon: Plug, roles: ["admin", "manager"] },
  { label: "安全中心", to: "/security", icon: ShieldCheck, roles: ["admin"] },
  { label: "用户管理", to: "/users", icon: UserCog, roles: ["admin"] },
];

const navItems = computed(() =>
  allNavItems.filter((item) => !item.roles || item.roles.some((r) => hasRole(r as any)))
);
```

在侧边栏底部（`mt-auto` 区域内，设置按钮之前）添加用户信息：

```html
<div v-if="user" class="flex items-center gap-3 rounded-lg px-3 py-2" :class="collapsed && 'justify-center px-0'">
  <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
    {{ user.displayName?.charAt(0) ?? '?' }}
  </div>
  <div v-if="!collapsed" class="min-w-0 flex-1">
    <p class="truncate text-sm font-medium text-sidebar-foreground">{{ user.displayName }}</p>
    <p class="truncate text-[11px] text-sidebar-muted">{{ user.role }}</p>
  </div>
</div>
```

在侧边栏底部添加登出按钮：

```html
<button
  class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] text-sidebar-muted transition-all duration-150 hover:bg-sidebar-accent hover:text-sidebar-foreground"
  :class="collapsed && 'justify-center px-0'"
  @click="logout"
>
  <LogOut class="h-[18px] w-[18px] shrink-0" :stroke-width="1.8" />
  <span v-if="!collapsed">退出登录</span>
</button>
```

- [ ] **Step 2: 验证类型**

```bash
cd packages/nextclaw-digital-employee
npx nuxi typecheck
```

- [ ] **Step 3: Commit**

```bash
git add packages/nextclaw-digital-employee/app/layouts/default.vue
git commit -m "feat(auth): add user avatar, role-based menu, logout to layout"
```

---

## Task 14: 用户管理页（Admin）

**Files:**
- Create: `packages/nextclaw-digital-employee/app/pages/users/index.vue`

- [ ] **Step 1: 创建 users/index.vue**

```vue
<script setup lang="ts">
import { Search, Shield, UserCog, Link2, Unlink } from "lucide-vue-next";
import type { UserView, UserRole, UpdateUserInput } from "../../../shared/auth-types";

const { isAdmin } = useAuth();
const toast = useToast();
const { loading, execute } = useApiCall({ toast: { composable: toast, prefix: "操作失败" } });

const users = ref<UserView[]>([]);
const search = ref("");

const filteredUsers = computed(() => {
  if (!search.value) return users.value;
  const q = search.value.toLowerCase();
  return users.value.filter(
    (u) => u.displayName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
  );
});

async function loadUsers() {
  const res = await execute(() => $fetch<{ ok: boolean; data: UserView[] }>("/api/users"));
  if (res?.ok) users.value = res.data;
}

async function updateUser(id: string, input: UpdateUserInput) {
  const res = await execute(() =>
    $fetch<{ ok: boolean; data: UserView }>(`/api/users/${id}`, {
      method: "PATCH",
      body: input,
    })
  );
  if (res?.ok) {
    const idx = users.value.findIndex((u) => u.id === id);
    if (idx !== -1) users.value[idx] = res.data;
    toast.showToast("success", "已更新");
  }
}

const roleOptions: { value: UserRole; label: string }[] = [
  { value: "admin", label: "管理员" },
  { value: "manager", label: "部门管理员" },
  { value: "user", label: "普通成员" },
];

const roleBadgeColor: Record<UserRole, string> = {
  admin: "bg-red-100 text-red-700",
  manager: "bg-amber-100 text-amber-700",
  user: "bg-blue-100 text-blue-700",
};

const bindDialogOpen = ref(false);
const bindTargetUser = ref<UserView | null>(null);
const humanEmployees = ref<Array<{ id: string; name: string; title: string }>>([]);
const selectedHumanEmployeeId = ref<string>("");

function openBindDialog(u: UserView) {
  bindTargetUser.value = u;
  selectedHumanEmployeeId.value = "";
  bindDialogOpen.value = true;
  loadHumanEmployees();
}

async function loadHumanEmployees() {
  const res = await execute(() => $fetch<{ ok: boolean; data: any[] }>("/api/org/human-employees"));
  if (res?.ok) humanEmployees.value = res.data;
}

async function confirmBind() {
  if (!bindTargetUser.value || !selectedHumanEmployeeId.value) return;
  await updateUser(bindTargetUser.value.id, { humanEmployeeId: selectedHumanEmployeeId.value });
  bindDialogOpen.value = false;
}

onMounted(loadUsers);
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6 p-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold text-foreground">用户管理</h1>
        <p class="text-sm text-muted-foreground">管理平台用户角色与权限</p>
      </div>
    </div>

    <div class="relative">
      <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        v-model="search"
        class="w-full rounded-lg border border-border bg-background py-2 pl-10 pr-4 text-sm outline-none transition focus:border-primary focus:ring-1 focus:ring-primary/20"
        placeholder="搜索用户名或邮箱..."
      />
    </div>

    <div class="rounded-lg border border-border">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-border bg-muted/50">
            <th class="px-4 py-3 text-left font-medium text-muted-foreground">用户</th>
            <th class="px-4 py-3 text-left font-medium text-muted-foreground">邮箱</th>
            <th class="px-4 py-3 text-left font-medium text-muted-foreground">角色</th>
            <th class="px-4 py-3 text-left font-medium text-muted-foreground">状态</th>
            <th class="px-4 py-3 text-left font-medium text-muted-foreground">关联员工</th>
            <th class="px-4 py-3 text-right font-medium text-muted-foreground">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="u in filteredUsers"
            :key="u.id"
            class="border-b border-border last:border-0 hover:bg-muted/30 transition"
          >
            <td class="px-4 py-3">
              <div class="flex items-center gap-2">
                <div class="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                  {{ u.displayName?.charAt(0) ?? "?" }}
                </div>
                <span class="font-medium">{{ u.displayName }}</span>
              </div>
            </td>
            <td class="px-4 py-3 text-muted-foreground">{{ u.email }}</td>
            <td class="px-4 py-3">
              <select
                :value="u.role"
                class="rounded border border-border bg-background px-2 py-1 text-xs outline-none"
                @change="updateUser(u.id, { role: ($event.target as HTMLSelectElement).value as UserRole })"
              >
                <option v-for="opt in roleOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </td>
            <td class="px-4 py-3">
              <button
                class="rounded px-2 py-0.5 text-xs font-medium"
                :class="u.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'"
                @click="updateUser(u.id, { isActive: !u.isActive })"
              >
                {{ u.isActive ? "启用" : "禁用" }}
              </button>
            </td>
            <td class="px-4 py-3">
              <span v-if="u.humanEmployeeId" class="inline-flex items-center gap-1 text-xs text-emerald-700">
                <Link2 class="h-3 w-3" /> 已关联
                <button
                  class="ml-1 text-muted-foreground hover:text-destructive"
                  title="解除关联"
                  @click="updateUser(u.id, { humanEmployeeId: null })"
                >
                  <Unlink class="h-3 w-3" />
                </button>
              </span>
              <button
                v-else
                class="text-xs text-primary hover:underline"
                @click="openBindDialog(u)"
              >
                手动关联
              </button>
            </td>
            <td class="px-4 py-3 text-right">
              <span class="text-xs text-muted-foreground">
                {{ u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "未登录" }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>

    <div v-if="filteredUsers.length === 0" class="py-12 text-center text-sm text-muted-foreground">
      {{ search ? "未找到匹配用户" : "暂无用户" }}
    </div>
    </div>

    <!-- 关联对话框 -->
    <Teleport to="body">
      <div v-if="bindDialogOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div class="w-full max-w-md rounded-lg bg-background p-6 shadow-xl">
          <h3 class="text-lg font-semibold">关联真实员工</h3>
          <p class="mt-1 text-sm text-muted-foreground">
            将 {{ bindTargetUser?.displayName }} 关联到真实员工
          </p>
          <select
            v-model="selectedHumanEmployeeId"
            class="mt-4 w-full rounded border border-border bg-background px-3 py-2 text-sm outline-none"
          >
            <option value="" disabled>选择员工...</option>
            <option v-for="he in humanEmployees" :key="he.id" :value="he.id">
              {{ he.name }} ({{ he.title || '无职位' }})
            </option>
          </select>
          <div class="mt-4 flex justify-end gap-2">
            <button
              class="rounded px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
              @click="bindDialogOpen = false"
            >
              取消
            </button>
            <button
              class="rounded bg-primary px-4 py-2 text-sm text-white hover:bg-primary/90 disabled:opacity-50"
              :disabled="!selectedHumanEmployeeId"
              @click="confirmBind"
            >
              确认关联
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add packages/nextclaw-digital-employee/app/pages/users/index.vue
git commit -m "feat(auth): add admin user management page"
```

---

## Task 15: 为现有 API 添加权限 Guard

**Files:**
- Modify: 需要精细权限的 API handler（按设计文档的 API Guard 表逐一添加）

- [ ] **Step 1: 给 /api/users 路由添加 guard（已在 Task 8 完成）**

确认 Task 8 中的 `users/index.get.ts` 和 `users/[id].patch.ts` 已有 `requireRole("admin")`。

- [ ] **Step 2: 给 /api/secrets 路由添加 guard (admin only)**

在以下文件的 handler 开头添加 `requireRole(event, "admin")`：

- `server/api/secrets/index.get.ts`
- `server/api/secrets/index.post.ts`
- `server/api/secrets/[key].patch.ts`
- `server/api/secrets/[key].delete.ts`
- `server/api/secrets/bulk.post.ts`

每个文件中添加：

```typescript
import { requireRole } from "../../utils/auth-guards";
// 在 handler 函数体第一行添加：
requireRole(event, "admin");
```

- [ ] **Step 3: 给 /api/integrations 写入路由添加 guard (admin only)**

在 `server/api/integrations/dingtalk.put.ts` 开头添加：

```typescript
import { requireRole } from "../../utils/auth-guards";
requireRole(event, "admin");
```

- [ ] **Step 4: 给 /api/employees 写入路由添加 guard (admin + manager)**

在以下文件的 handler 开头添加 guard：

- `server/api/employees/index.post.ts`
- `server/api/employees/[id].patch.ts`
- `server/api/employees/[id].delete.ts`

```typescript
import { requireRole } from "../../utils/auth-guards";
// 在 handler 函数体第一行添加：
requireRole(event, "admin", "manager");
```

- [ ] **Step 5: 给 /api/skills 写入路由添加 guard (admin only)**

在 `server/api/skills/[name]/state.patch.ts` 和 `server/api/skills/upload.post.ts` 开头添加：

```typescript
import { requireRole } from "../../utils/auth-guards";
requireRole(event, "admin");
```

- [ ] **Step 6: 验证编译**

```bash
cd packages/nextclaw-digital-employee
npx nuxi typecheck
```

Expected: 无类型错误

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(auth): add role guards to secrets, integrations, employees, skills APIs"
```

---

## Task 16: 集成测试验证

- [ ] **Step 1: 启动开发服务器**

```bash
cd packages/nextclaw-digital-employee
KEYCLOAK_URL=https://your-keycloak.example.com \
KEYCLOAK_REALM=digital-employee \
KEYCLOAK_CLIENT_ID=de-platform \
pnpm dev
```

- [ ] **Step 2: 验证未登录访问**

打开浏览器访问 `http://localhost:3000/dashboard`。
Expected: 自动跳转到 `/login`

- [ ] **Step 3: 验证登录流程**

点击"统一身份登录"按钮。
Expected: 跳转到 Keycloak 登录页 → 登录后回调 → 进入 Dashboard

- [ ] **Step 4: 验证 /api/auth/me**

在浏览器控制台执行：
```javascript
fetch('/api/auth/me', { headers: { Authorization: `Bearer ${useAuth().getAccessToken()}` } }).then(r => r.json()).then(console.log)
```
Expected: 返回当前用户信息

- [ ] **Step 5: 验证权限控制**

以普通用户身份访问 `/users`。
Expected: 侧边栏不显示"用户管理"菜单项

- [ ] **Step 6: 验证登出**

点击侧边栏"退出登录"。
Expected: 清除 token → 重定向到 Keycloak 登出 → 返回 `/login`

---

## Self-Review Checklist

1. **Spec coverage**: 所有设计文档中的章节均有对应 Task
   - 数据模型 → Task 2, 3
   - 认证流程 → Task 5, 6, 9
   - 服务端架构 → Task 6, 7, 8 (含 logout.post.ts)
   - 前端架构 → Task 9, 10, 11, 12, 13
   - 权限矩阵 → Task 7, 15 (覆盖 secrets/integrations/employees/skills)
   - 环境变量 → Task 1
   - JWKS 缓存 → Task 5
   - 错误处理 → Task 6, 12
   - 用户管理 + 手动绑定 → Task 14 (含绑定对话框)
   - 安全备忘 → 内嵌于各 Task
   - 测试计划 → Task 16

2. **Placeholder scan**: 无 TBD/TODO/"implement later" 占位符

3. **Type consistency**:
   - `UserView`/`UserContext`/`UserRole`/`UpdateUserInput` — 在 `shared/auth-types.ts` 定义，被 repository、API handler、composable 统一引用
   - `UserRecord` — 在 `server/db/schema.ts` 定义，仅在 repository 层使用
   - `requireAuth`/`requireRole`/`requireDepartmentAccess` — 在 `server/utils/auth-guards.ts` 定义，被 API handler 引用

4. **Review fixes applied**:
   - P1: 添加 `logout.post.ts` (Task 8 Step 1.5)
   - P2: 修复 `me.get.ts` 的 `createError` 导入
   - P3: `initialize()` 添加 `_initStarted` 模块级 guard，`_refreshTimer` 提升到模块级
   - P4: 用户管理页添加手动关联/解绑 UI + 对话框
   - B4: 移除未使用的 `isSqlite` 导入
   - B5: 避免 keycloak_sub/email 的重复唯一约束
   - B7: Task 15 扩展覆盖 employees 和 skills 写入路由
