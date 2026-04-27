# v0.15.63 — 钉钉代理 CIDR 与自代理环路修复

## 一、迭代完成说明（改了什么）

线上日志显示：

```text
[proxy-bootstrap] proxy=http://172.31.1.95:1080 noProxy=...172.31.0.0/16...
TCP_TUNNEL/503 ... CONNECT 172.31.1.95:1080
```

这说明请求没有真正连到钉钉域名，而是在代理侧看到客户端请求
`CONNECT 172.31.1.95:1080`，即代理自身又被当成目标送进代理，形成自代理环路。

本次修复：

- 将 `NO_PROXY` 解析与匹配能力沉淀到 `@nextclaw/core` 的
  `src/utils/no-proxy.ts`，避免 digital-employee 与钉钉插件各自维护一套规则。
- 新增 IPv4 CIDR 支持，例如 `172.31.0.0/16` 可正确命中
  `172.31.1.95`。
- `packages/nextclaw-digital-employee/server/utils/no-proxy.ts` 改为从
  `@nextclaw/core` 复用同一实现。
- 钉钉 WS 代理注入从裸 `HttpsProxyAgent` 改为 `ProxyAwareAgent`：
  按目标 host 判断是否命中 `NO_PROXY`，命中则走直连 `https.Agent`，
  未命中才走代理。
- 移除临时调试日志 `wsproxyUrl`，替换为可核对规则的日志：
  `[dingtalk] ws proxy injected -> <proxy> (noProxy=<rules>)`。

相关文件：

- [no-proxy.ts](../../../packages/nextclaw-core/src/utils/no-proxy.ts)
- [channel.ts](../../../packages/extensions/nextclaw-channel-plugin-dingtalk/src/channel.ts)
- [digital-employee no-proxy re-export](../../../packages/nextclaw-digital-employee/server/utils/no-proxy.ts)

## 二、测试 / 验证 / 验收方式

- 红灯验证：
  - `pnpm -C packages/nextclaw-digital-employee test -- tests/no-proxy.test.ts`
    曾失败于 `172.31.1.95` 未命中 `172.31.0.0/16`。
  - `pnpm -C packages/extensions/nextclaw-channel-plugin-dingtalk test -- src/channel.test.ts`
    曾失败于钉钉 WS 未走直连 agent。
- 通过验证：
  - `pnpm -C packages/nextclaw-digital-employee test -- tests/no-proxy.test.ts`
  - `pnpm -C packages/extensions/nextclaw-channel-plugin-dingtalk test -- src/channel.test.ts`
  - `pnpm -C packages/nextclaw-core tsc`
  - `pnpm -C packages/nextclaw-core build`
  - `pnpm -C packages/nextclaw-core exec eslint src/index.ts src/utils/no-proxy.ts`
  - `pnpm -C packages/nextclaw-digital-employee exec eslint server/plugins/00.proxy-bootstrap.ts server/utils/no-proxy.ts tests/no-proxy.test.ts`
  - `pnpm -C packages/nextclaw-digital-employee exec nuxt typecheck`

说明：`pnpm -C packages/nextclaw-core lint` 当前被既有无关问题阻断：
`src/cron/service.test.ts` 存在未使用的 `beforeEach`，另有既有行数 warning。
本次未混入无关修复，已对本次变更文件执行定向 lint。

## 三、发布 / 部署方式

- 无数据库 migration。
- 无新增环境变量。
- 需要按常规流程重新构建并发布包含以下包的组件：
  - `@nextclaw/core`
  - `@nextclaw/channel-plugin-dingtalk`
  - 依赖二者的 digital-employee 运行镜像 / 部署产物
- 部署环境继续保留当前 `HTTPS_PROXY` / `HTTP_PROXY` 与 `NO_PROXY` 配置。

## 四、用户 / 产品视角的验收步骤

1. 启动线上环境，确认启动日志包含
   `[proxy-bootstrap] proxy=http://172.31.1.95:1080 noProxy=...172.31.0.0/16...`。
2. 确认钉钉日志出现
   `[dingtalk] ws proxy injected -> http://172.31.1.95:1080 (noProxy=...)`。
3. 观察代理服务器日志，不应再持续出现
   `CONNECT 172.31.1.95:1080` 的自代理环路。
4. 观察钉钉账号不再每 120 秒进入
   `disconnected >120s, force restart` 循环。
5. 在钉钉发送一条测试消息，确认能被服务接收并正常响应。
