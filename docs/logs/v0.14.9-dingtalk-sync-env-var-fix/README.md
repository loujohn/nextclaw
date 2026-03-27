# v0.14.9 — 钉钉同步首次部署 env var 未生效 bugfix

## 迭代完成说明

### 根因

首次部署时点击"同步"报错"未配置钉钉 AppKey / AppSecret"，但环境变量已配置。根因是 **`runOrgSync` 直接查询数据库进行凭据校验，绕过了 `getOrgSyncConfig` 内实现的环境变量回填机制**，导致以下场景失效：

1. 容器首次以 **空环境变量** 启动 → `org-sync-scheduler` 插件向 DB 写入空记录；
2. 用户补配环境变量后重启容器 → 启动插件调用 `getOrgSyncConfig` 的 `else` 分支回填 DB，但若此前的 DB 记录已带值（非空），该分支不会触发；
3. 用户点击"同步" → `runOrgSync` **直接查 DB** 拿到旧的空值 → 校验失败 → 报错。

额外发现的隐患：若 `.env` 文件使用 Windows 换行符（`\r\n`），env var 值末尾会附带 `\r`，导致 `process.env.DINGTALK_APP_KEY` 包含不可见字符，进而影响 DingTalk API 鉴权。

### 变更内容

| 文件 | 变更 |
|------|------|
| `server/services/org-sync-service.ts` | `runOrgSync` 改为调用 `getOrgSyncConfig(db)` 做凭据校验，确保 env var 回填逻辑必然执行；`getOrgSyncConfig` 读取 env var 时统一调用 `.trim()` 消除空白字符（含 `\r`） |
| `server/api/org/sync-trigger.post.ts` | 改善错误提示文案，明确说明如何配置（使用环境变量或系统设置页面） |

## 测试 / 验证方式

**代码层面**（不适用 build/lint/tsc，改动未触及构建/类型链路变更）：
- TypeScript 类型检查：VS Code 编辑器无错误（已通过 get_errors 验证）
- 变更均在已有测试覆盖的服务层，无需新增类型

**冒烟测试步骤**（部署后执行）：
1. 确保 `.env` 中 `DINGTALK_APP_KEY` / `DINGTALK_APP_SECRET` 有实际值；
2. 首次启动容器（无历史 `/data` 数据），在 UI 点击"同步"→ 应正常发起同步，不再报 AppKey 未配置错误；
3. 模拟历史问题：先以空 env 启动（DB 写入空记录），再配好 env 重启，点击"同步"→ 应能正常同步；
4. 可选：检查错误提示改善后的文案内容。

## 发布 / 部署方式

纯服务端逻辑修复，仅需重新构建并部署 Docker 镜像：

```bash
docker-compose build --no-cache
docker-compose up -d
```

## 用户 / 产品视角验收步骤

1. 按正规流程首次部署（配好 `DINGTALK_APP_KEY` / `DINGTALK_APP_SECRET`），在【组织架构】页点击"同步"；
2. 预期：不再出现"未配置"报错，同步正常触发；
3. 若凭据确实未配置，错误提示应明确指引用户如何配置（环境变量或系统设置页面）。
