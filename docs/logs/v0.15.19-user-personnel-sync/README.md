# v0.15.19-user-personnel-sync

## 迭代完成说明

- 在 packages/nextclaw-digital-employee 为 users 表新增用户同步所需字段、唯一索引与迁移注册，区分 user_source 与 auth_provider。
- 新增用户同步后端链路：管理员可调用 POST /api/users/sync-trigger，从 PERSONNEL_SYNC_API_URL 拉取外部人员列表后直接执行数据库事务 upsert。
- 同步规则按设计落地：仅以 userId 对应 external_user_id 作为唯一键；缺少 userId 的记录跳过；外部 roleName 仅保存为资料，不覆盖平台 role；外部未返回的已有用户不删除。
- 扩展用户列表返回字段与用户管理页展示，新增“同步人员”按钮、二次确认、同步结果提示，以及来源/外部资料展示。
- 补充定向测试文件，覆盖新增、更新、跳过以及“不同步覆盖平台角色”的关键规则。

相关设计文档：
[用户管理人员同步设计文档](../../superpowers/specs/2026-04-16-user-personnel-sync-design.md)

## 测试/验证/验收方式

- 定向 ESLint：

```bash
pnpm -C packages/nextclaw-digital-employee exec eslint \
  shared/auth-types.ts \
  server/db/schema.ts \
  server/repositories/user-repository.ts \
  server/services/user-sync-service.ts \
  server/api/users/sync-trigger.post.ts \
  app/pages/users/index.vue \
  tests/user-sync-service.test.ts \
  migrations/011_users_personnel_sync.ts \
  server/db/migration-source.ts
```

- VS Code 问题检查：以上改动文件无新增错误。
- 定向 Vitest：

```bash
pnpm -C packages/nextclaw-digital-employee test -- tests/user-sync-service.test.ts
```

- 当前结果：测试文件已写入，但本地验证环境无法连接达梦测试库，报错为“无法切换到达梦 Schema / 网络通信异常”，因此该条测试未能在当前环境完成执行。

## 发布/部署方式

- 为 packages/nextclaw-digital-employee 配置人员同步环境变量：

```bash
PERSONNEL_SYNC_API_URL=https://shangji.cqdcg.com:10000/api/admin/project/workHour/listAllUsers
# PERSONNEL_SYNC_API_TOKEN=your_api_token
```

- 启动或部署服务前执行该包 migration，使 users 表新增同步字段与索引：

```bash
pnpm -C packages/nextclaw-digital-employee migrate:latest
```

- 常规启动或部署数字员工平台，无额外发布组件。

## 用户/产品视角的验收步骤

1. 以管理员身份进入“用户管理”页面，确认顶部出现“同步人员”按钮。
2. 点击“同步人员”，确认弹窗文案明确说明“更新已有、创建新增、不删除未返回用户”。
3. 确认同步后，页面出现成功提示，并展示新增/更新/跳过数量。
4. 刷新后的用户列表中，外部人员显示“外部同步”来源，并可看到外部 ID、岗位、外部角色、用户类型、钉钉标识、最近同步时间。
5. 对同一个外部 userId 再次同步，只更新资料，不出现重复用户。
6. 事先存在的系统创建用户在同步后仍然保留，且平台角色不被外部 roleName 覆盖。