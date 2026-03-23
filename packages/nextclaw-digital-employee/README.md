# nextclaw-digital-employee 组织人员定时同步说明

## 1. 启动服务（定时任务依附于服务进程）

在项目根目录执行：

```bash
cd packages/nextclaw-digital-employee
PORT=3031 pnpm dev
```

说明：
- 定时同步由 `server/plugins/org-sync-scheduler.ts` 在服务启动时注册。
- 修改定时配置后，需要重启服务才会生效。

## 2. 启用定时同步（开启）

```bash
curl -X PATCH "http://127.0.0.1:3031/api/org/sync-config" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "cronExpr": "0 1 * * *"
  }'
```

可选：同时更新钉钉凭据

```bash
curl -X PATCH "http://127.0.0.1:3031/api/org/sync-config" \
  -H "Content-Type: application/json" \
  -d '{
    "appKey": "你的AppKey",
    "appSecret": "你的AppSecret",
    "enabled": true,
    "cronExpr": "0 1 * * *"
  }'
```

然后重启服务让定时任务按新配置注册：

```bash
# 当前终端按 Ctrl+C 停止后，再执行
PORT=3031 pnpm dev
```

## 3. 关闭定时同步（禁用）

```bash
curl -X PATCH "http://127.0.0.1:3031/api/org/sync-config" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": false
  }'
```

然后重启服务使禁用配置生效：

```bash
# 当前终端按 Ctrl+C 停止后，再执行
PORT=3031 pnpm dev
```

## 4. 停止服务进程

- 前台启动时：在运行 `pnpm dev` 的终端按 `Ctrl+C`
- 需要命令行停止时（谨慎使用）：

```bash
pkill -f "nuxt dev"
```

## 5. 相关接口

- 查看当前配置：`GET /api/org/sync-config`
- 更新配置（开关/cron/appKey/appSecret）：`PATCH /api/org/sync-config`
- 立即手动同步一次：`POST /api/org/sync-trigger`
