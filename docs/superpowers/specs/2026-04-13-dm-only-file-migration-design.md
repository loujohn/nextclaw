# 设计文档：去除 SQLite 支持 + 切换到 file-based migration

## 1. 背景与动机

### 当前问题

`server/db/knex.ts` 存在两个架构债务：

1. **双数据库兼容**：同时支持 SQLite 和达梦（DM），导致大量 `isSqlite()` 分支、DDL 差异处理、时间戳格式化差异。
2. **非标准迁移模式**：使用 `hasTable`/`hasColumn` 幂等检查 + `ensurePlatformDatabase()` 串行调用，而非标准 knex migration 框架。虽然底部定义了 `InlineMigrationSource`，但与 `ensurePlatformDatabase()` 重复共存。

### 决策

- 去除 SQLite 支持，仅保留达梦（DM）
- 切换到 knex file-based migration（标准方案）
- 删除所有 `isSqlite()` / `hasTable()` / `hasColumn()` 幂等逻辑

## 2. 架构变更

### 2.1 `server/db/knex.ts` 简化

**删除：**
- `DbClientType` 类型及 `"sqlite"` 分支
- `isSqlite()`、`isDm()` 函数
- `_dbClient` 全局状态
- `formatTimestamp()` 中的 SQLite 分支（ISO 8601 路径）
- 所有 `createXxxTable()` 幂等建表函数（20+ 个）
- 所有 `migrateXxx()` 幂等迁移函数
- `ensurePlatformDatabase()` 函数
- `InlineMigrationSource` 类及 `platformMigrations` 数组
- `platformMigrationSource` 导出
- SQLite 的 `ensureParentDir()` 函数
- `better-sqlite3` 相关的连接创建逻辑

**保留/简化：**
- `createPlatformKnex()` — 仅保留 DM 连接创建逻辑
- `ensureDmSchema()` — 保留
- `dbNow()` / `formatTimestamp()` — 移除 SQLite 分支，仅保留 DM 格式（`YYYY-MM-DD HH:mm:ss`）
- `resolveDbConfigFromEnv()` — 简化为仅返回 DM 配置

### 2.2 `migrations/` 目录

已有 3 个 file-based migration 文件：
- `001_baseline.ts` — 全量建表（已有，需去除 SQLite 分支）
- `002_enums_constraints_indexes.ts` — 索引（已有，需去除 SQLite 分支）
- `003_legacy_schedule_migration.ts` — 旧调度数据迁移（已有，需去除 SQLite 分支）

**新增：**
- `004_users_table.ts` — users 表 + 索引
- `005_users_local_auth.ts` — auth_provider、password_hash 列
- `006_users_username.ts` — username 列 + 索引
- `007_seed_default_admin.ts` — 默认管理员 seed

### 2.3 `server/runtime/platform-context.ts`

**变更：**
- 移除 `ensurePlatformDatabase(db)` 调用
- 移除 `platformMigrationSource` 导入
- 保留 `db.migrate.latest()` 调用，改用 file-based migration directory 配置
- 移除 SQLite 路径相关逻辑
- 移除 `dbConfig.client === "sqlite"` 分支

### 2.4 `knexfile.ts`

- 删除 `buildSqliteConfig()` 函数
- 仅保留 `buildDmConfig()`
- 删除 `dbClient` 环境变量判断

### 2.5 受影响的其他文件

| 文件 | 变更 |
|------|------|
| `server/repositories/run-record-repository.ts` | 删除 `isSqlite()` 导入和条件分支 |
| `server/services/automation-service.ts` | `formatTimestamp()` 行为不变（DM 格式） |
| `migrations/002_enums_constraints_indexes.ts` | 删除 `IS_DM` / SQLite 分支 |
| `migrations/003_legacy_schedule_migration.ts` | 删除 `IS_DM` / SQLite 分支 |
| `package.json` | 移除 `better-sqlite3` 依赖 |
| `.env` / `.env.example` / `.env.docker` | 移除 `DB_CLIENT=sqlite` 相关说明 |
| `Dockerfile` / `docker-compose.yml` | 移除 SQLite 相关配置 |
| `docker-entrypoint.sh` | 移除 SQLite 相关逻辑 |
| `tests/*.test.ts` | 保留 SQLite 用于测试，但 `ensurePlatformDatabase` 需替换为 `db.migrate.latest()` 或保留一份测试专用幂等函数 |
| `server/errors/platform-errors.ts` | 包含 `sqlite_constraint` 错误检测，保留（不影响功能，作为兼容性字符串匹配） |

### 2.6 `server/db/schema.ts`

无变更 — 纯类型定义，不依赖数据库引擎。

## 3. 平滑过渡策略

### 已有 DM 数据库（升级场景）

1. 应用启动时 `db.migrate.latest()` 会读取 `knex_migrations` 表
2. 如果是首次使用 file-based migration（`knex_migrations` 表不存在），knex 自动创建
3. `001_baseline.ts` 内部仍使用 `hasTable` 检查，已有表不会重复创建
4. 后续 migration（004-007）会增量执行

### 全新 DM 数据库

1. `db.migrate.latest()` 从 001 开始顺序执行所有 migration
2. 007 seed 默认管理员

## 4. 验收标准

1. `server/db/knex.ts` 中不再出现 `sqlite`、`isSqlite`、`better-sqlite3` 相关代码
2. `pnpm build` 通过
3. `pnpm lint` 通过
4. `knex migrate:latest` 在 DM 上可成功执行
5. 所有 `migrations/*.ts` 文件中无 SQLite 条件分支
6. `package.json` 中不再包含 `better-sqlite3`

## 5. 澄清说明

### `hasTable` 检查的保留范围

`knex.ts` 运行时代码中的幂等函数（`createXxxTable`/`migrateXxx`/`ensurePlatformDatabase`）全部删除。
但 `migrations/001_baseline.ts` 中的 `hasTable` 检查**保留** — 这是 baseline migration 的标准模式，用于已有数据库首次启用 migration 框架时的平滑过渡。一旦 baseline 执行完毕，后续 migration 不再需要 `hasTable` 检查。

### 测试策略

测试文件中的 SQLite 使用**暂时保留** — `better-sqlite3` 保留为 `devDependencies`，仅用于测试环境的内存数据库。主代码不再依赖它。

测试中大量使用 `ensurePlatformDatabase(db)` 做建表（约 50+ 处），策略是：
- **保留 `ensurePlatformDatabase` 函数仅供测试使用**，但从主代码入口（`platform-context.ts`）中移除
- 或者提供一个轻量的 `ensureTestDatabase(db)` 替代函数专门用于测试

### 错误处理兼容

`server/errors/platform-errors.ts` 中包含 `sqlite_constraint` 字符串检测，保留不删除 — 不影响功能，作为错误分类的兼容性匹配。

## 6. 风险与注意事项

- **Docker 构建**：需验证 Dockerfile 中是否有 SQLite native 编译相关步骤，去除后可减小镜像体积
- **回滚路径**：切换后无法回退到 SQLite，需在上线前充分验证 DM 环境
- **`PlatformDbConfig` 类型简化**：移除 `{ client: "sqlite"; sqlitePath: string }` 分支，仅保留 DM 配置
