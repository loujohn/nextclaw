# 迭代完成说明

- 数字员工聊天模块新增可配置权限 `chat-session:view-all`，默认仅 `admin` 角色开启，`manager` 与 `user` 默认关闭。
- 员工聊天会话列表、按 `sessionKey` 读取历史、继续既有会话发送消息三条后端链路统一接入访问范围校验：具备该权限的角色可查看全部会话，其他角色仅可访问自己的会话。
- “安全中心 -> 权限管理” 从前端 mock 切换到真实后端配置，支持直接对系统角色切换该权限。
- 新增 `role_permissions` 持久化表与安全配置接口，用于后续继续扩展细粒度角色权限。

# 测试/验证/验收方式

- 已执行：`pnpm -C packages/nextclaw-digital-employee gen:migrations`
- 已执行：`pnpm -C packages/nextclaw-digital-employee exec eslint shared/role-permissions.ts server/repositories/role-permission-repository.ts server/utils/chat-session-access.ts server/utils/role-permission-payload.ts server/db/schema.ts server/repositories/user-repository.ts server/repositories/chat-session-repository.ts server/services/employee-run-service.ts server/runtime/platform-context.ts server/api/employees/[id]/sessions.get.ts server/api/employees/[id]/sessions/[key]/messages.get.ts server/api/employees/[id]/chat/history.get.ts server/api/employees/[id]/chat.post.ts server/api/security/permissions.get.ts server/api/security/permissions.patch.ts app/components/security/PermissionDetail.vue app/pages/security/index.vue tests/chat-session-access-control.test.ts migrations/20260427170000_role_permissions.ts`
- 已执行：VS Code Problems / `get_errors` 针对受影响文件检查，无新增语法或类型错误。
- 受环境限制未完成：`pnpm -C packages/nextclaw-digital-employee exec vitest run tests/chat-session-access-control.test.ts`。当前环境达梦测试库 `DIGITAL_EMPLOYEE_TEST` 连接失败，报错 `[6001] 网络通信异常`，属于数据库环境问题，不是本次逻辑回归。

# 发布/部署方式

- 数据库：发布前执行数字员工包的 migration，使 `role_permissions` 表落库。
- 服务：发布或重启 `packages/nextclaw-digital-employee` 对应服务实例，使新的安全权限接口与聊天访问控制生效。
- 配置：如需让非管理员角色查看全部会话，进入安全中心权限管理，为对应角色开启 `查看全部聊天会话`。

# 用户/产品视角的验收步骤

1. 使用管理员账号进入任意数字员工聊天页，确认会话列表可看到多名用户创建的会话。
2. 进入“安全中心 -> 权限管理”，选择“部门管理员”或“普通成员”，确认存在“查看全部聊天会话”开关。
3. 保持该开关关闭，用非管理员账号进入同一数字员工聊天页，确认只能看到自己创建的会话，直接访问他人会话历史也无法成功。
4. 在安全中心为该角色开启“查看全部聊天会话”，刷新后再次进入聊天页，确认该角色可看到全部会话并能正常打开历史。