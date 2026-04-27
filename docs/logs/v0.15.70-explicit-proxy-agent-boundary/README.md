# v0.15.70 Explicit Proxy Agent Boundary

## 迭代完成说明（改了什么）

- `proxy-bootstrap` 不再替换 `http.globalAgent` / `https.globalAgent`，避免同进程插件和第三方 SDK 被全局代理二次接管。
- `proxy-bootstrap` 仅保留 `undici.setGlobalDispatcher(new EnvHttpProxyAgent())`，继续覆盖项目内 `fetch` / `$fetch` / `ofetch` 路径。
- 新增 `server/utils/proxy-agent.ts`，按 `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` 显式解析代理路由，并复用现有 CIDR `NO_PROXY` 能力。
- 人员同步 `http.request` / `https.request` 改为调用点显式传入代理 agent。
- 钉钉 Stream endpoint 获取重新交还给 `dingtalk-stream` SDK 的 `getEndpoint()`；插件只在 SDK `_connect()` 创建 WebSocket 前注入具体直连/代理 agent。

## 测试/验证/验收方式

- `pnpm -C packages/extensions/nextclaw-channel-plugin-dingtalk test`
  - 结果：通过，2 个测试文件、17 个用例全部通过。
- `pnpm -C packages/nextclaw-digital-employee exec vitest run tests/no-proxy.test.ts tests/proxy-agent.test.ts tests/proxy-bootstrap.test.ts`
  - 结果：通过，3 个测试文件、29 个用例全部通过。
- `pnpm -C packages/nextclaw-digital-employee exec vitest run tests/no-proxy.test.ts tests/proxy-agent.test.ts tests/proxy-bootstrap.test.ts tests/user-sync-service.test.ts`
  - 结果：代理相关 29 个用例通过；`user-sync-service.test.ts` 因本地达梦测试库网络通信异常失败，错误为 `[6001] 网络通信异常`，未进入本次代理断言。
- `pnpm -C packages/nextclaw-digital-employee tsc`
  - 结果：通过。
- `pnpm -C packages/nextclaw-digital-employee build`
  - 结果：通过。
- `pnpm -C packages/nextclaw-digital-employee lint`
  - 结果：失败于仓库既有 lint 债务，包括未使用变量、`any`、`max-lines` / `max-lines-per-function` 等；本次改动文件已补充执行聚焦检查：
    - `pnpm -C packages/nextclaw-digital-employee exec eslint server/plugins/00.proxy-bootstrap.ts server/utils/proxy-agent.ts tests/proxy-agent.test.ts tests/proxy-bootstrap.test.ts --max-warnings=0`
    - `pnpm -C packages/nextclaw-digital-employee exec eslint server/services/user-sync-service.ts --quiet`
    - 结果均通过。
- `git diff --check -- <本次改动文件>`
  - 结果：通过。

## 发布/部署方式

- 无数据库变更，migration 不适用。
- 无前端交互改动，前端专项发布不适用；`digital-employee` 需要随服务端重新构建并部署。
- 部署环境继续保留现有 `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` 配置。

## 用户/产品视角的验收步骤

- 启动服务后，日志应显示 `[proxy-bootstrap] fetch proxy=... noProxy=...`，不再表示全局 http/https agent 被 patch。
- 钉钉启动阶段应由 SDK 自己执行 endpoint 获取；日志不再出现插件自定义的 `endpoint resolved`。
- 钉钉 WebSocket 仍应显示 `ws proxy route ... route=direct|proxy`，用于确认 CIDR `NO_PROXY` 对 WebSocket 生效。
- 触发人员同步时，外网目标应走代理，命中 `NO_PROXY` 的内网目标应直连。
