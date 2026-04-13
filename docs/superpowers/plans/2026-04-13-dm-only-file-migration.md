# 实施计划：去除 SQLite + 切换 file-based migration

**对应设计文档**：[`docs/superpowers/specs/2026-04-13-dm-only-file-migration-design.md`](../specs/2026-04-13-dm-only-file-migration-design.md)

## 阶段 1：简化 `server/db/knex.ts`

### Step 1.1 — 移除 SQLite 连接逻辑
- 删除 `PlatformDbConfig` 中的 `{ client: "sqlite"; sqlitePath: string }` 分支
- 删除 `DbClientType` 类型（不再需要区分）
- 删除 `_dbClient` 全局变量及 `getDbClient()` 函数
- 删除 `isSqlite()` 函数
- 删除 `isDm()` 函数（不再需要区分，永远是 DM）
- 删除 `ensureParentDir()` 函数
- 简化 `createPlatformKnex()` — 仅保留 DM 路径
- 简化 `resolveDbConfigFromEnv()` — 仅返回 DM 配置
- 简化 `formatTimestamp()` — 去掉 `isSqlite()` 分支

### Step 1.2 — 删除幂等建表/迁移函数
- 删除所有 `createXxxTable()` 函数（约 12 个）
- 删除所有 `migrateXxx()` 函数（约 5 个）
- 删除 `seedDefaultAdmin()` 函数
- 删除 `ensurePlatformDatabase()` 函数
- 删除 `InlineMigrationSource` 类
- 删除 `platformMigrations` 数组
- 删除 `platformMigrationSource` 导出
- 保留 `hasIndex()` 和 `createIndexIfNotExists()` 作为工具函数（migration 可能需要）

**验收**：`knex.ts` 大幅缩小（从 ~727 行降到 ~150 行），无 SQLite 相关代码。

## 阶段 2：更新 migration 文件

### Step 2.1 — 清理现有 migration 中的 SQLite 分支
- `migrations/002_enums_constraints_indexes.ts`：删除 `IS_DM` 变量和 SQLite 分支
- `migrations/003_legacy_schedule_migration.ts`：删除 `IS_DM` 变量和 SQLite 分支

### Step 2.2 — 新增 users 相关 migration
- `004_users_table.ts` — 建 users 表 + 索引（纯 DM DDL）
- `005_users_local_auth.ts` — 添加 auth_provider、password_hash 列
- `006_users_username.ts` — 添加 username 列 + 索引
- `007_seed_default_admin.ts` — seed 默认管理员

**验收**：所有 migration 文件中无 `sqlite` / `IS_DM` 相关代码。

## 阶段 3：更新启动入口和配置

### Step 3.1 — `server/runtime/platform-context.ts`
- 移除 `ensurePlatformDatabase` 和 `platformMigrationSource` 导入
- 移除 `ensurePlatformDatabase(db)` 调用
- 将 `db.migrate.latest({ migrationSource: platformMigrationSource })` 改为 `db.migrate.latest()`（使用 knexfile 中配置的 migration directory）
- 移除 `dbConfig.client === "sqlite"` 分支

### Step 3.2 — `knexfile.ts`
- 删除 `buildSqliteConfig()` 函数
- 删除 `dbClient` 环境变量判断
- 仅保留 `buildDmConfig()`

### Step 3.3 — 环境变量文件
- `.env`：移除 `DB_CLIENT=sqlite` 相关注释
- `.env.example`：移除 SQLite 选项说明
- `.env.docker`：确认仅 DM 配置

**验收**：启动时通过 `db.migrate.latest()` 执行 file-based migration。

## 阶段 4：清理受影响的 repository / service 文件

### Step 4.1 — `server/repositories/run-record-repository.ts`
- 删除 `isSqlite` 导入
- 将 `isSqlite()` 条件分支替换为仅 DM 逻辑

### Step 4.2 — 其他导入 `formatTimestamp`/`dbNow` 的文件
- 确认无需变更（函数签名不变，只是内部去掉了 SQLite 分支）

### Step 4.3 — `package.json`
- 将 `better-sqlite3` 从 `dependencies` 移至 `devDependencies`（测试用）

**验收**：`pnpm build` 通过，无 `isSqlite` 引用残留。

## 阶段 5：验证

### Step 5.1 — 构建验证
- `pnpm build`
- `pnpm lint`（如果有）

### Step 5.2 — 测试文件评估
- 确认测试文件中的 `ensurePlatformDatabase` 导入不报错（函数仍导出但仅测试用，或提供替代）

**验收标准**：
1. `server/db/knex.ts` 中无 `sqlite`/`isSqlite`/`better-sqlite3` 相关代码
2. `pnpm build` 通过
3. 所有 `migrations/*.ts` 文件中无 SQLite 条件分支
4. `package.json` 的 `dependencies` 中不包含 `better-sqlite3`
