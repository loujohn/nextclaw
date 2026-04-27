# v0.15.62 — 钉钉 channel 插件对齐 NO_PROXY 语义

## 一、迭代完成说明（改了什么）

### 背景

v0.15.60 完成了 digital-employee 侧的代理引导改造，fetch / $fetch /
http.request / https.request 四条出站路径都能正确识别 NO_PROXY。但
钉钉 channel 插件（`@nextclaw/channel-plugin-dingtalk`）自己额外实现
了一层代理覆盖，把这层"按 NO_PROXY 分流"的语义完全旁路掉了。

### 根因

`packages/extensions/nextclaw-channel-plugin-dingtalk/src/channel.ts`
原实现有三处硬编码：

1. **`injectWsProxy(client)`**：
   - 直接 `new HttpsProxyAgent(proxyUrl)` 注入进 `client.sslopts.agent`
   - 这导致 ws 库握手时 `options.agent` 不再是 undefined，
     不会回退到 `https.globalAgent`，digital-employee 在 bootstrap
     中替换的 `ProxyAwareAgent` 完全无效
   - 效果：钉钉 WS 流量无条件走代理

2. **`buildDispatcher()`**：
   - 有代理时返回 `new ProxyAgent(proxyUrl)` — undici 的"强制代理"
     dispatcher
   - 通过 `fetch(url, { dispatcher: buildDispatcher() })` 显式覆盖
     `setGlobalDispatcher` 设置的 `EnvHttpProxyAgent`
   - 效果：`send()` 和 `getAccessToken()` 的 HTTP 调用无条件走代理

3. 这一层代理覆盖在 digital-employee / desktop / openclaw-compat
   三个入口都生效，任一环境里只要 `HTTPS_PROXY` 有值，钉钉流量就会
   被拖进代理，即使 NO_PROXY 里明确排除了钉钉域名也不例外。

### 本次改动（仅 channel.ts）

仍然保留 `injectWsProxy` 函数（因为 desktop / openclaw-compat 入口
没有 digital-employee 的全局代理 bootstrap，必须由插件自身承担 ws
代理职责），但把注入的 agent 从裸 `HttpsProxyAgent` 升级为
"NO_PROXY-aware" 的 `ProxyAwareAgent`：

- 读取 `NO_PROXY` / `no_proxy`，按与 digital-employee 完全一致的
  规则解析（支持 `*`、`foo.com`、`.foo.com`、`*.foo.com`、
  `foo.com:port`，大小写不敏感，未识别项丢弃）。
- 在 `addRequest(req, options)` 时按目标 host 在 `HttpsProxyAgent`
  与本地直连 `https.Agent` 之间动态路由。
- ws 库 8.x 握手仍走 `options.agent`，不再"旁路" NO_PROXY。

`buildDispatcher()`：
- 有代理时返回 `new EnvHttpProxyAgent()`（undici 原生支持 NO_PROXY）
  代替 `new ProxyAgent(proxyUrl)`。
- 无代理时保持 `new Agent()` 直连不变。

### 未做（接下来可选的工作）

- 本次选择在插件内**就地复制**一份 NO_PROXY 解析逻辑，与
  `packages/nextclaw-digital-employee/server/utils/no-proxy.ts`
  存在轻微重复（~50 行）。短期内代价可控。后续如果有第 3 个出站
  位置需要同类逻辑，建议抽到 `@nextclaw/core` 统一导出。
- `desktop / openclaw-compat` 入口没有 digital-employee 那样的全局
  代理 bootstrap，本次通过"在钉钉插件内自带 NO_PROXY 支持"解决了
  钉钉场景；其它未来新增的出站需求要自行决定是重用本插件逻辑还是
  引入全局 bootstrap。

## 二、测试 / 验证 / 验收方式

### 静态验证

- `pnpm -C packages/extensions/nextclaw-channel-plugin-dingtalk test`
  10 个用例全部通过（6 个 `DingTalkChannel` 集成 + 4 个
  `config-schema` + 1 个 package shape）。
- `pnpm -C packages/nextclaw-digital-employee exec nuxt typecheck`
  通过（确认未引入跨包类型问题）。

### 运行时冒烟

前置：部署环境 `HTTPS_PROXY` 已设、`NO_PROXY` 含钉钉域名或其它期望
直连的 host。

1. 启动 digital-employee（或 desktop、openclaw-compat）。
2. 观察日志：
   - `[dingtalk] using http proxy: <proxyUrl> (noProxy=<原始 NO_PROXY>)`
   - `[dingtalk] ws proxy injected → <proxyUrl> (noProxy rules=N)`
3. 钉钉 stream 应正常连接；发一条测试消息验证 `send()` 路径。
4. 如果 NO_PROXY 里写了公网钉钉域名的子域（一般不会），该域名的
   钉钉 WS 会直连；其余场景维持原行为。

### 回归

- 钉钉 channel 插件 10/10 单测全绿。
- digital-employee 侧代理 bootstrap 行为不变（本次不动它）。

## 三、发布 / 部署方式

- 无新增依赖、无数据库迁移、无环境变量变更。
- 按常规流程构建三类入口（digital-employee / desktop /
  openclaw-compat）。

## 四、用户 / 产品视角验收步骤

1. 在已有代理环境中升级到新版本。
2. 确认钉钉连接/发送/接收与改动前一致。
3. 如需让钉钉某特定域名直连，在 `NO_PROXY` 添加该域名（推荐写
   `foo.com` 或 `.foo.com`，避免 `*.foo.com`：axios 内置的
   `proxy-from-env` 不识别后者，会造成 HTTP 通道仍走代理、WS 通道
   直连的割裂）。

---

## 相关文件

- [channel.ts](../../../packages/extensions/nextclaw-channel-plugin-dingtalk/src/channel.ts)
- [v0.15.60 代理 bootstrap 迭代](../v0.15.60-proxy-noproxy-and-fetch-coverage/README.md)
