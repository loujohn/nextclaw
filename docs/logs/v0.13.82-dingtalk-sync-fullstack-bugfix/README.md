# v0.13.82 — 钉钉组织同步：完整闭环（调度器 + 配置 API + UI 只读树 + Bug 修复）

本次迭代涵盖两个连续会话的全部改动：

- **v0.13.81**（上一会话）：后端同步 API + 只读部门树 + 成员图标展示
- **v0.13.82**（本会话）：定时调度器 + 完整配置 API + Bug 修复 + .env 管理

---

## 迭代完成说明

### 后端（v0.13.81 补充）

| 文件 | 说明 |
|------|------|
| `server/api/org/sync-trigger.post.ts` | `POST /api/org/sync-trigger` — 手动触发同步，内部调用 `runOrgSync()` |
| `server/api/org/human-employees.get.ts` | `GET /api/org/human-employees[?departmentId=]` — 查询人类员工列表 |
| `server/api/org/sync-config.get.ts` | `GET /api/org/sync-config` — 获取配置（appSecret 脱敏） |
| `server/api/org/sync-config.patch.ts` | `PATCH /api/org/sync-config` — 修改 appKey/appSecret/cronExpr/enabled |

### 后端（v0.13.82 新增/修复）

#### `server/services/org-sync-service.ts` — 多项修复
1. **关键 bug 修复**：`SCRIPT_PATH` 从 `__dirname` + 相对路径改为 `process.cwd() + scripts/dingtalk-org-sync.py`。原写法在 Nitro 编译/打包后 `__dirname` 指向错误路径，导致脚本找不到而同步失败。
2. **env 补填逻辑**：DB 行已存在但 `app_key`/`app_secret` 为空时，自动从 `DINGTALK_APP_KEY`/`DINGTALK_APP_SECRET` 环境变量补填，解决已运行过的实例无法通过 `.env` 初始化凭证的问题。
3. **env 初始化扩展**：新建默认行时同时读取 `DINGTALK_CRON_EXPR` 和 `DINGTALK_SYNC_ENABLED`。

#### `server/plugins/org-sync-scheduler.ts` — 新建
Nitro 插件，服务启动时：
- 读取 `org_sync_config` 中的 `cronExpr` + `enabled`
- `enabled=false` 或 `cronExpr` 无效时跳过注册
- 使用 `node-cron@^3.0.3` 注册定时任务，到期自动调用 `runOrgSync()`
- 进程退出时 `task.stop()`

#### `node-cron` 版本修复
`node-cron@4.x` 的 ESM 与 Nitro bundler 不兼容，降级为 `node-cron@^3.0.3`（CJS 版本）修复崩溃。

#### `.env` 新增配置项
```
DINGTALK_APP_KEY=dingonhm3er0ygiw69un
DINGTALK_APP_SECRET=VjX7RzKbGoqK_jb3N4dUbu0kc_orrwnNp2VZ3lUAImxkrlcnf5I3ziTKCdY4ApSg
DINGTALK_CRON_EXPR=0 1 * * *
DINGTALK_SYNC_ENABLED=false
```

#### `.gitignore` 变更
根目录 `.gitignore` 中全局 `.env` 规则保留，同时追加：
```
!packages/nextclaw-digital-employee/.env
```
仅取消忽略该包的 `.env`（含钉钉配置），其余包的 `.env` 仍被忽略。

### 前端（v0.13.81）

#### `DepartmentTree.vue` — 全面重构
- 移除全部 CRUD 逻辑（新增/编辑/删除部门弹窗约 200 行）
- 新增"同步"按钮（RefreshCcw 图标）+ 二次确认弹窗 + loading 状态 + Toast 反馈
- 调用 `POST /api/org/sync-trigger`
- 新导出类型 `HumanMemberBrief`、`DigitalMemberBrief`

#### `DepartmentTreeNode.vue` — 全面重构
- 移除三个操作按钮（Plus/Pencil/Trash2）
- 新增：选中节点时在行下展示成员 chips  
  - `Bot` 蓝色图标 = 数字员工  
  - `User` 灰色图标 = 人类员工

#### `employees/index.vue`
- 增加 `GET /api/org/human-employees` 数据拉取
- 新增 `humanMembersMap` / `digitalMembersMap` computed，按部门聚合
- `DepartmentTree` 绑定新 props，`@refresh` 同步刷新人类员工

---

## Bug 修复清单

| Bug | 根因 | 修复方式 |
|-----|------|---------|
| 服务启动 500（`Class extends value [object Module]`） | `node-cron@4.x` ESM 与 Nitro bundler 不兼容 | 降级到 `node-cron@3.x`（CJS） |
| 脚本路径错误（生产环境） | `__dirname` 在 Nitro 编译后指向 `.output/` 虚拟路径 | 改用 `process.cwd()` 指向包根目录 |
| 已有 DB 行无法通过 `.env` 初始化凭证 | `getOrgSyncConfig` 仅在首次创建时读取 env | 追加"空值补填"逻辑 |

---

## 测试/验证

### 冒烟测试日志（`PORT=3031 pnpm exec nuxt dev`）

```bash
# 1. GET sync-config — 凭证从 .env 补填成功
curl http://localhost:3031/api/org/sync-config
# ✅ {"appKey":"dingonhm3er0ygiw69un","appSecretSet":true,"cronExpr":"0 1 * * *","enabled":false,...}

# 2. 手动触发同步 — 完整链路（Python → DingTalk API → /api/org/sync）
curl -X POST http://localhost:3031/api/org/sync-trigger
# ✅ {"ok":true,"data":{"departments":{"created":31,"updated":0,"removed":4},"humanEmployees":{"created":174},"digitalEmployees":{"reassignedToRoot":2}}}

# 3. PATCH — 修改 cronExpr + enabled
curl -X PATCH http://localhost:3031/api/org/sync-config \
  -H "Content-Type: application/json" \
  -d '{"cronExpr":"0 9 * * 1-5","enabled":true}'
# ✅ cronExpr 更新并返回最新配置

# 4. human-employees API — 返回同步后的 174 名员工
curl http://localhost:3031/api/org/human-employees
# ✅ {"ok":true,"data":[...174条...]}
```

### 验证项清单
- [x] `node-cron@4.x` 崩溃已修复（降级到 3.x）
- [x] `SCRIPT_PATH` 路径正确（process.cwd()）
- [x] .env 凭证已补填到 DB
- [x] 手动同步成功（31 部门 / 174 人类员工）
- [x] PATCH API 支持所有字段（appKey/appSecret/cronExpr/enabled）
- [x] human-employees API 返回正确数据
- [x] .gitignore 仅取消忽略该包 .env

---

## 发布方式

```bash
# 1. pnpm install（新增 node-cron@3.x 依赖，锁文件已更新）
pnpm install

# 2. 前端发布（UI 变更）
pnpm /release-frontend

# 3. 后端服务重启（Nitro 插件 + API 路由变更）
# 服务重启后，org-sync-scheduler 会自动从 DB 读取配置
```

---

## 用户/产品验收步骤

1. **配置页确认**：`GET /api/org/sync-config` 返回 `appKey` 不为空、`appSecretSet: true`
2. **手动同步**：点击员工中心左侧"同步"按钮 → 确认 → 成功 toast + 部门树刷新
3. **成员图标**：选中部门后，行下显示蓝色 Bot（数字员工）和灰色 User（人类员工）chips
4. **定时任务**：通过 API 设置 `enabled: true` + 有效 `cronExpr` 后重启服务，检查服务日志是否打印 `[org-sync-scheduler] 已注册定时任务`
5. **配置更新**：`PATCH /api/org/sync-config {"appKey":"xxx","appSecret":"yyy"}` 返回 200
