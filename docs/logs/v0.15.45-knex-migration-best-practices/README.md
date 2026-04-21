# v0.15.45 — Knex.js Migration 最佳实践改进

## 迭代完成说明

### 背景问题

4 人团队共享远程达梦数据库开发环境，存在以下问题：

1. **Migration 文件冲突**：顺序编号（001、002...）导致多人同时开发时编号撞车；`migration-source.ts` 手动维护 static import 是合并冲突热点
2. **共享 DB 启动失败**：应用启动时自动执行 `migrate.latest()`，当 A 新增了 migration 并启动（自动执行），B 的代码中没有该 migration 文件导致启动报错
3. **数据安全**：测试代码可能误操作开发数据库，导致 users 表被清空

### 改动清单

| # | 文件 | 改动内容 |
|---|------|----------|
| 1 | `server/runtime/platform-context.ts` | 开发环境：启动时自动释放 migration 锁 + 跳过缺失 migration 校验 |
| 2 | `knexfile.ts` | 新建 migration 改用时间戳命名（`YYYYMMDDHHMMSS_name.ts`） |
| 3 | `scripts/gen-migration-source.ts` | 新建：自动扫描 migrations/ 生成 migration-source.ts |
| 4 | `server/db/migration-source.ts` | 改为自动生成文件，加入 .gitignore |
| 5 | `package.json` | 新增 `gen:migrations`，串联 dev/build/migrate:make |
| 6 | `.gitignore` | 添加 migration-source.ts |
| 7 | `migrations/007_seed_default_admin.ts` | Seed 逻辑移出，保留为空壳 no-op |
| 8 | `server/plugins/seed-default-admin.ts` | 新建：默认管理员 seed 逻辑（Nitro plugin） |
| 9 | `tests/test-db.ts` | 测试 schema 硬编码为 `DIGITAL_EMPLOYEE_TEST`，防止误操作开发库 |
| 10 | `AGENTS.md` | 新增 Database Migration 工作流章节 |

### 技术方案对照

| Knex.js 最佳实践 | 实现方式 |
|---|---|
| 时间戳命名避免编号冲突 | `getNewMigrationName` 生成 `YYYYMMDDHHMMSS_name.ts` |
| Migration 幂等性 | 所有 migration 使用 `hasTable()`/`hasColumn()` 检查 |
| Seed 与 Migration 分离 | Seed 逻辑移到 `server/plugins/seed-*.ts` |
| `disableMigrationsListValidation` | 仅开发环境启用，生产保持严格 |
| 共享 DB 锁故障恢复 | 开发环境启动时 `forceFreeMigrationsLock` |
| 测试环境隔离 | 测试 schema 硬编码 `DIGITAL_EMPLOYEE_TEST` |
| 自动化减少人工操作 | `gen:migrations` 自动串联 dev/build/migrate:make |

## 测试/验证/验收方式

1. `pnpm dev` 正常启动，无报错
2. `pnpm migrate:make test_new_migration` 生成时间戳命名文件
3. `pnpm gen:migrations` 正确扫描所有 migration 并生成 migration-source.ts
4. 删除 migration-source.ts 后 `pnpm dev` 自动重新生成
5. 测试代码运行时自动使用 `DIGITAL_EMPLOYEE_TEST` schema，不操作开发库

## 发布/部署方式

无需特殊部署。代码合入主分支后：
- 生产环境不受影响（`disableMigrationsListValidation`、自动解锁仅在开发环境生效）
- 生产构建时 `pnpm build` 会自动 `gen:migrations`

## 用户/产品视角的验收步骤

1. 开发者 A 新建 migration 并启动 → 开发者 B 无需拉取 A 的代码也能正常启动
2. 两人同时创建 migration → 文件名不冲突（时间戳不同）
3. 合并代码时 → migration-source.ts 不产生冲突（已 gitignore）
4. 运行测试 → 不影响开发数据库（使用独立 schema）
