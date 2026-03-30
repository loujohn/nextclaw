# v0.14.10 — 钉钉组织同步：移除 HTTP Self-Call，直接操作数据库

## 迭代完成说明

### 背景

原同步链路存在一次多余的内部 HTTP 自调用：
`sync-trigger` / `org-sync-scheduler` → `runOrgSync` → **HTTP POST `/api/org/sync`** → `sync.post.ts` → DB

这种方式引入了不必要的网络往返、端口硬编码（`PORT ?? "3031"`）和潜在的自调用失败风险。

### 改动内容

| 文件 | 改动 |
|---|---|
| `server/services/org-sync-service.ts` | 新增 `OrgSyncBody`、`OrgSyncResult` 类型；提取 `performOrgSync(db, orgData)` 函数（含完整 DB 事务逻辑）；`runOrgSync` 移除 `syncApiUrl` 参数，拉取钉钉数据后直接调用 `performOrgSync` |
| `server/api/org/sync.post.ts` | 从 220+ 行精简为 15 行，仅解析请求体并调用 `performOrgSync`（HTTP 端点仍保留，供外部直接推送数据） |
| `server/api/org/sync-trigger.post.ts` | 移除 `getRequestURL` 与 `syncApiUrl` 构建；`runOrgSync(ctx.db)` 无需第二参数 |
| `server/plugins/org-sync-scheduler.ts` | 移除端口读取与 `syncApiUrl` 构建；直接 `runOrgSync(ctx.db)` |

### 新同步链路

```
sync-trigger / scheduler
  └─ runOrgSync(db)
       ├─ DingTalkOrgClient.fetchAllOrgData()
       └─ performOrgSync(db, orgData)   ← 直接 DB 事务，无 HTTP
```

`/api/org/sync` HTTP 端点仍保留，但其实现也已同步改为调用 `performOrgSync`，逻辑唯一。

---

## 测试 / 验证 / 验收方式

### 类型检查（已通过）

```bash
cd packages/nextclaw-digital-employee
pnpm tsc --noEmit
```

四个涉及文件均无 TS 错误（IDE `get_errors` 已验证）。

### 冒烟测试步骤

1. 启动平台服务（需配置 `DINGTALK_APP_KEY` / `DINGTALK_APP_SECRET`）
2. 调用触发接口：
   ```bash
   curl -X POST http://localhost:3031/api/org/sync-trigger
   ```
3. 预期返回 `{ "ok": true, "data": { ... } }`，控制台无 HTTP 请求日志
4. 检查数据库 `departments` / `human_employees` 表已正确写入

**验证要点**：控制台不应出现 `fetch http://127.0.0.1:PORT/api/org/sync` 的请求日志。

---

## 发布 / 部署方式

- 纯后端逻辑变更，无 API 契约变更
- 重启 `nextclaw-digital-employee` 服务即生效
- 无需数据库 migration
- 无需前端发布

---

## 用户 / 产品视角的验收步骤

1. 在【系统设置 → 钉钉同步配置】中点击「立即同步」
2. 同步完成后，组织架构树与人员列表正确显示
3. 定时同步任务（`DINGTALK_CRON_EXPR`）按计划自动执行，结果与手动触发一致
4. 无任何功能行为变化（改动仅为内部实现优化）
