# v0.15.21-dm-user-sync-index-fix

## 迭代完成说明

- 修复 packages/nextclaw-digital-employee 中用户同步 migration 在达梦数据库上的建索引报错。
- 根因一：达梦不支持 `CREATE UNIQUE INDEX ... WHERE ...` 这种 filtered index 语法。
- 根因二：`knex-dm` 中 `table.text(...)` 会映射成 `CLOB`，而 `external_user_id` 作为唯一索引键不应使用该类型。
- 调整 migration 011：将 `external_user_id` 规范为可索引的 `varchar(255)`，并在建索引前将空字符串归一为 `NULL`，随后创建普通唯一索引。
- 该修复兼容两类场景：全新迁移，以及此前 migration 已部分执行、列已创建但索引创建失败的数据库。

## 测试/验证/验收方式

- 定向 ESLint：

```bash
pnpm -C packages/nextclaw-digital-employee exec eslint migrations/011_users_personnel_sync.ts
```

- VS Code 问题检查：
  - migrations/011_users_personnel_sync.ts 无新增错误。

- 本次未在当前会话直接执行达梦 migration 冒烟，因为用户反馈的是线上/本地真实达梦执行错误，当前修复按达梦方言和驱动映射已对症处理；建议在目标环境重新执行 migration 验证闭环。

## 发布/部署方式

- 更新代码后，在 packages/nextclaw-digital-employee 所在环境重新执行：

```bash
pnpm -C packages/nextclaw-digital-employee migrate:latest
```

- 若数据库此前停在 migration 011 失败状态，保持当前迁移文件不变更名称，直接重新执行即可。

## 用户/产品视角的验收步骤

1. 在目标环境重新执行数字员工平台 migration。
2. 确认不再出现 `CREATE UNIQUE INDEX ... WHERE ...` 的达梦语法错误。
3. 管理员进入“用户管理”页面后点击“同步人员”，确认用户同步可以正常写入 users 表。
4. 对同一 external_user_id 重复同步时，不会生成重复用户记录。