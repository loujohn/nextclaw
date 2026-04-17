# 用户管理人员同步 — 设计文档

**日期**: 2026-04-16
**状态**: Approved
**适用范围**: `packages/nextclaw-digital-employee`

---

## 设计决策摘要

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 同步入口 | 用户管理页新增“同步”按钮 + 二次确认 | 与现有管理动作一致，降低误触风险 |
| 同步编排 | 用户同步独立执行 | 本期不再和组织架构同步耦合 |
| 同步主键 | `userId` | 用户唯一标识最稳定，避免误合并 |
| 来源字段 | 新增 `user_source` | 和 `auth_provider` 解耦，避免语义混乱 |
| 登录方式 | 同步用户继续走 `keycloak` | 满足“按现有 SSO/Keycloak 用户处理” |
| 外部角色 | 仅保存 `roleName` 资料，不覆盖平台 `role` | 平台权限必须独立控制 |
| 删除策略 | 不删除本系统已有但外部未返回的用户 | 满足增量同步诉求，避免误删 |
| human employee 关联 | 本期不做 | 用户同步只负责 `users` 域，边界更清晰 |

---

## 1. 背景与范围

当前 `packages/nextclaw-digital-employee` 已具备：

- 用户管理页面：`app/pages/users/index.vue`
- 用户表与仓储：`users` / `server/repositories/user-repository.ts`
- 组织架构同步：`server/services/org-sync-service.ts`
- 人类员工表：`human_employees`

本次需求是在用户管理模块增加“人员同步”能力，将外部接口返回的人员信息增量同步到 `users` 表。

### 1.1 本期目标

1. 在用户管理页新增“同步”按钮，点击后需要二次确认
2. 调用外部接口拉取人员列表
3. 基于 `userId` 对 `users` 表执行增量 upsert
4. 清晰区分“系统创建用户”和“外部同步用户”
5. 保持现有本地/SSO 登录与用户管理能力可用

### 1.2 本期不做

1. 不对 `human_employees` 做新增、更新、删除、关联
2. 不要求同步前先做组织架构同步
3. 不按 `dingTalkId`、邮箱、姓名做用户合并
4. 不让外部 `roleName` 覆盖平台权限角色

---

## 2. 外部接口定义

### 2.1 当前接口地址

当前对接地址记录在实现文档中：

`https://shangji.cqdcg.com:10000/api/admin/project/workHour/listAllUsers`

### 2.2 配置方式

设计上不建议在代码中硬编码该地址。建议通过环境变量读取：

- `PERSONNEL_SYNC_API_URL`
- 如后续有鉴权，再补充：
  - `PERSONNEL_SYNC_API_TOKEN`
  - 或同类认证配置项

### 2.3 响应字段

需求确认后，外部接口字段按以下结构处理：

| 外部字段 | 本期含义 | 落库字段 |
|----------|----------|----------|
| `userId` | 外部用户唯一标识 | `external_user_id` |
| `userName` | 外部用户名 | `external_user_name` |
| `name` | 显示姓名 | `external_name`，并作为 `display_name` 候选来源 |
| `postName` | 岗位名称 | `external_post_name` |
| `roleName` | 外部角色名称 | `external_role_name` |
| `dingTalkId` | 钉钉标识 | `external_dingtalk_id` |
| `phone` | 电话 | `external_phone` |
| `userType` | 用户类型 | `external_user_type` |

---

## 3. 数据模型设计

### 3.1 核心原则：登录方式与用户来源分层

当前系统已有 `auth_provider` 字段，表示登录方式（如 `local` / `keycloak`）。

本次新增的“同步来源”不应复用 `auth_provider`，否则会造成：

- `auth_provider` 既表示认证方式，又表示数据来源
- 本地用户 / SSO 用户 / 同步用户语义混杂
- 后续权限与展示逻辑容易失真

因此本次新增独立字段 `user_source`。

### 3.2 users 表新增字段

建议在 `users` 表新增：

```sql
ALTER TABLE users ADD COLUMN user_source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE users ADD COLUMN sync_provider TEXT NULL;
ALTER TABLE users ADD COLUMN external_user_id TEXT NULL;
ALTER TABLE users ADD COLUMN external_user_name TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN external_name TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN external_post_name TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN external_role_name TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN external_dingtalk_id TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN external_phone TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN external_user_type TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN last_synced_at TEXT NULL;
```

并新增唯一索引：

```sql
CREATE UNIQUE INDEX idx_users_external_user_id
ON users(external_user_id)
WHERE external_user_id IS NOT NULL AND external_user_id != '';
```

### 3.3 字段语义

| 字段 | 语义 |
|------|------|
| `auth_provider` | 登录方式，继续表示 `local` / `keycloak` |
| `user_source` | 用户来源，建议 `manual` / `sync` |
| `external_user_id` | 外部同步唯一键，对应 `userId` |
| `sync_provider` | 同步来源标识，本期固定 `personnel-api` |
| `external_*` | 外部资料快照，仅用于展示和检索 |
| `last_synced_at` | 最近一次同步写入时间 |

### 3.4 新增用户的默认值策略

同步新建用户时建议：

- `user_source = 'sync'`
- `auth_provider = 'keycloak'`
- `sync_provider = 'personnel-api'`
- `role = 'user'`（平台默认角色）
- `is_active = 1`
- `display_name` 优先取 `name`，为空时回退 `userName`

---

## 4. 同步流程设计

### 4.1 前端流程

在 `app/pages/users/index.vue` 顶部新增“同步”按钮：

1. 点击“同步”
2. 弹出二次确认
3. 用户确认后调用 `POST /api/users/sync-trigger`
4. 前端展示 loading、成功提示、失败提示
5. 成功后刷新用户列表

确认弹窗需明确说明：

- 将从外部接口同步人员到用户表
- 已存在用户会更新资料
- 不存在用户会新增
- 系统已有但外部未返回的用户不会被删除

### 4.2 后端编排

新增接口：

`POST /api/users/sync-trigger`

后端执行顺序：

1. 校验管理员权限
2. 调用外部接口获取人员列表
3. 对响应进行字段标准化
4. 在事务中执行批量 upsert
5. 返回同步摘要

### 4.3 批量 upsert 规则

对每一条外部人员记录：

1. `userId` 为空 → 记为 `skipped`
2. 按 `external_user_id = userId` 查询
3. 若存在：
   - 更新外部资料字段
   - 更新 `display_name`（按约定）
   - 更新 `last_synced_at`
4. 若不存在：
   - 新增 `users` 记录
   - 标记 `user_source = sync`
   - 标记 `auth_provider = keycloak`
   - 标记 `sync_provider = personnel-api`
5. 不对未出现在本次列表中的已有用户做删除或禁用

### 4.4 严格禁止的合并规则

本期明确禁止以下行为：

1. 不按 `dingTalkId` 合并
2. 不按邮箱合并
3. 不按姓名合并
4. 不按 `human_employee_id` 做同步关联

**唯一 upsert 键只有 `userId`。**

---

## 5. API 与代码结构设计

### 5.1 API 变更

#### 新增

- `POST /api/users/sync-trigger`

#### 增强

- `GET /api/users`
  - 返回来源字段
  - 返回同步资料字段

### 5.2 共享类型

在 `shared/auth-types.ts` 中扩展 `UserView`：

```ts
type UserSource = "manual" | "sync";

type UserView = {
  id: string;
  username: string;
  email: string;
  displayName: string;
  avatarUrl: string;
  role: UserRole;
  isActive: boolean;
  authProvider: AuthProvider;
  userSource: UserSource;
  syncProvider: string | null;
  externalUserId: string | null;
  externalUserName: string;
  externalName: string;
  externalPostName: string;
  externalRoleName: string;
  externalDingTalkId: string;
  externalPhone: string;
  externalUserType: string;
  lastLoginAt: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
```

### 5.3 服务拆分

建议新增两个聚焦模块：

#### `server/integrations/personnel-sync-client.ts`

职责：

- 调用 `listAllUsers` 接口
- 处理鉴权/请求头
- 处理超时与错误透传
- 将响应转成标准结构

#### `server/services/user-sync-service.ts`

职责：

- 校验同步数据
- 基于 `userId` 执行 upsert
- 汇总 `created / updated / skipped / failed`

### 5.4 仓储层补充

`server/repositories/user-repository.ts` 增加：

- `findByExternalUserId(userId: string)`
- `createSyncedUser(input)`
- `updateSyncedUser(id, input)`
- 如有必要，增加 `listAllWithSyncFields()`

---

## 6. 页面展示设计

### 6.1 用户管理页

建议在现有表格中新增或调整以下展示：

| 列/信息 | 设计 |
|--------|------|
| 来源 | `系统创建` / `外部同步` |
| 外部 ID | 展示 `userId` |
| 岗位 | 展示 `postName` |
| 外部角色 | 展示 `roleName` |
| 用户类型 | 展示 `userType` |
| 钉钉标识 | 展示 `dingTalkId` |

### 6.2 编辑边界

对 `user_source = sync` 的用户：

- 允许修改平台角色
- 允许启用/禁用
- 不建议手工编辑 `external_*` 字段

原因是这些字段下一次同步会被覆盖，应保持“外部资料只由同步写入”。

---

## 7. 错误处理与可观测性

### 7.1 错误处理

| 场景 | 行为 |
|------|------|
| 外部接口请求失败 | 整次同步失败，返回错误摘要 |
| 外部接口返回非预期结构 | 整次同步失败，返回结构校验错误 |
| 单条记录无 `userId` | 跳过，计入 `skipped` |
| 数据库事务失败 | 整批用户同步回滚 |

### 7.2 返回示例

```json
{
  "ok": true,
  "data": {
    "total": 120,
    "created": 18,
    "updated": 96,
    "skipped": 6,
    "failed": 0,
    "summary": "用户同步完成"
  }
}
```

### 7.3 日志建议

建议记录：

- 外部接口请求开始/结束
- 返回总条数
- created / updated / skipped / failed 统计
- 失败明细（不打印敏感鉴权信息）

---

## 8. 验收标准

### 8.1 功能验收

1. 用户管理页可见“同步”按钮
2. 点击后出现二次确认
3. 确认后成功调用外部接口并完成同步
4. 相同 `userId` 二次同步只更新，不重复新增
5. 外部未返回的系统用户不会被删除
6. 页面可区分“系统创建 / 外部同步”
7. `roleName` 不会覆盖平台 `role`

### 8.2 回归关注点

1. 本地用户创建不受影响
2. 现有 Keycloak 登录不受影响
3. 用户编辑、启停、重置密码不受影响
4. 组织架构同步与人类员工展示逻辑不受影响

---

## 9. 关键逻辑修正

本次方案明确修正以下不合适逻辑：

1. **来源不再复用 `auth_provider`**
   - `auth_provider` 只表示认证方式
   - `user_source` 只表示数据来源

2. **用户同步不再耦合 `human_employees`**
   - 本期不做组织人员关联
   - 避免跨域职责扩大

3. **同步唯一键只认 `userId`**
   - 禁止按 `dingTalkId`、邮箱、姓名做自动合并

4. **外部 `roleName` 不覆盖平台权限**
   - 平台权限仍以本地 `role` 为准

---

## 10. 实施建议

建议按以下顺序实现：

1. 数据库迁移：补充 `users` 同步字段与索引
2. 类型扩展：更新 `shared/auth-types.ts`
3. 仓储层：补充同步查询与 upsert 方法
4. 集成层：实现 `personnel-sync-client.ts`
5. 服务层：实现 `user-sync-service.ts`
6. API：新增 `POST /api/users/sync-trigger`
7. 前端：用户页增加“同步”按钮、确认弹窗与结果刷新

本期完成后，用户同步将成为一条独立、稳定、低耦合的用户域能力。
