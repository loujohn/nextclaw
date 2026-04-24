# v0.15.60 — 代理能力补齐：覆盖 fetch 路径并原生支持 NO_PROXY

## 一、迭代完成说明（改了什么）

### 背景与根因

原 `server/plugins/00.proxy-bootstrap.ts` 通过替换 `http.globalAgent` /
`https.globalAgent` 启用代理，存在两个根本性缺陷：

1. **仅覆盖了 `http.request` / `https.request` 一条路径**。项目里的钉钉
   组织同步（`server/integrations/dingtalk-org-client.ts`）、Keycloak token
   交换（`server/api/auth/token.post.ts`）、以及 workspace 内
   `@nextclaw/core`、`@nextclaw/channel-runtime`、
   `@nextclaw/channel-plugin-dingtalk` 的所有出站请求均使用原生 `fetch`
   （底层 undici），**完全不读取 `http.globalAgent`**，所以根本没走代理。
2. **`HttpsProxyAgent` 不识别 `NO_PROXY`**，导致人员同步（走
   `http.request` / `https.request`）这种面向**内网域名**的调用
   反而被强制拖进代理通道。

这两个缺陷共同导致：

- 该走代理的外网请求（钉钉、LLM、第三方 IM 通道）没走；
- 不该走代理的内网请求（Keycloak、人员同步）可能因代理拖累或路由错误
  而失败。

### 本次改动（仅限代码，不动 `.env.*`）

仅改动 `packages/nextclaw-digital-employee/server/plugins/00.proxy-bootstrap.ts`
以及配套依赖声明：

- 引入 `undici.EnvHttpProxyAgent` + `setGlobalDispatcher`，一次性让
  `fetch` / `$fetch` / `ofetch` 以及所有 workspace 内部包的 fetch 调用
  全部走代理，并**原生读取 `NO_PROXY`**。
- 定义 `ProxyAwareAgent extends http.Agent`，基于 `NO_PROXY` 规则按
  目标 host 在“走 `HttpsProxyAgent`”与“走本地直连 Agent”之间动态路由，
  一次性替换 `http.globalAgent` / `https.globalAgent`，让原生
  `http.request` / `https.request` 路径也正确尊重 `NO_PROXY`。
- 在 `package.json` 声明 `undici: ^6.21.0` 为直接依赖（消除原本透过
  Nitro hoist 间接拿到 `EnvHttpProxyAgent` 的隐式耦合）。

### NO_PROXY 解析规则（集中在 `parseNoProxyRule`）

- **未配置**：视为规则集为空，所有请求经代理出站，与 curl/Go/Python
  requests 默认行为一致；不需要在 `.env` 里显式写。
- **`*`**：全通配，所有 host 均绕过代理。
- **`foo.com`**：匹配 `foo.com` 自身以及 `*.foo.com` 所有子域。
- **`.foo.com`** / **`*.foo.com`**：同 `foo.com`，统一宽松语义（匹配
  自身 + 所有子域），对运维更直觉。
- **`foo.com:8080`**：解析时剥离端口，按 host 规则匹配（与 curl 行为
  一致）。
- **未识别项**：自动丢弃，不影响其它规则生效。
- **大小写**：全部转小写后比较，`FOO.COM` 与 `foo.com` 等价。

启动日志会原样回显解析后规则（含原始前缀 `.`），便于运维侧对照配置。

### 设计原则对齐

- `best-solution-over-cost`：使用 Node 内置的 undici 能力，无新引入
  第三方代理库；代码量 ≈ 90 行，零业务侵入。
- `root-cause-fix-over-band-aid`：从“为什么 fetch 路径没走代理”与
  “为什么没有 NO_PROXY”两条根因统一修复，而不是逐个调用点打补丁。
- `env_only`：`NO_PROXY` 完全由部署环境决定，代码不内置默认规则，
  避免“开发机默认 + 生产部署”两套策略错位；同时 `.env.*` 示例文件
  不再由本次迭代改写，避免把运维配置耦合进代码仓。

## 二、测试 / 验证 / 验收方式

### 静态验证

- `pnpm -C packages/nextclaw-digital-employee lint`
- `pnpm -C packages/nextclaw-digital-employee tsc`

### 运行时冒烟（推荐在部署环境执行）

前置：环境变量设置 `HTTPS_PROXY`、`HTTP_PROXY`；`NO_PROXY` 按需配置
（不配也能跑）。

1. **代理引导日志**：进程启动日志应包含
   `[proxy-bootstrap] proxy=<proxyUrl> noProxy=<rules>`；若没有这行
   日志，代表未读到任何 `*_PROXY`，代理未启用。
2. **fetch 路径验证**（钉钉 / LLM 外网）：
   - 在管理台手动触发一次“钉钉组织同步”，观察请求能到达
     `oapi.dingtalk.com`；
   - 在员工对话页发起一次 LLM 对话，观察能访问
     `dashscope.aliyuncs.com`。
3. **NO_PROXY 路径验证**（内网，仅当配置了 NO_PROXY 时）：
   - Keycloak 登录：走 `/api/auth/token` 交换 token，应能直连
     `keyc.cqdcg.com`；
   - 人员同步：手动触发一次同步，`shangji.cqdcg.com` 应直连。
4. **NO_PROXY 全通配验证**（可选）：
   - 设置 `NO_PROXY=*`，所有出站应直连而不走代理，
     启动日志显示 `noProxy=*`。

### 可观察性回归

- 人员同步错误提示文案（`user-sync-service.ts` 内）已有 `HTTPS_PROXY`
  与 `NO_PROXY` 提示，本次不改动文案；如需进一步优化请另起迭代。

## 三、发布 / 部署方式

### 代码层

- 本次已在 `@nextclaw/digital-employee` 的 `package.json` 中追加
  `undici: ^6.21.0` 直接依赖；拉取代码后执行常规安装即可：

  ```bash
  pnpm install
  ```

- 常规构建：`pnpm -C packages/nextclaw-digital-employee build`（或容器
  构建流程）。

### 环境变量层

本迭代**不修改** `.env.example` / `.env.docker`。部署环境按需配置
以下变量（与旧版本完全兼容）：

- `HTTP_PROXY` / `HTTPS_PROXY`：需要经代理出网时配置任意一个即可。
- `NO_PROXY`（可选）：不配默认所有请求经代理；需要内网域名直连时
  按上方“NO_PROXY 解析规则”配置即可。

### 迁移注意

- 原代码中 `console.log("[proxy-bootstrap] global agent patched → ...")`
  日志格式已变更为 `proxy=... noProxy=...`，告警/看板匹配脚本如
  依赖该日志需同步调整。
- 升级后 **fetch 路径会首次开始走代理**：如果旧环境里 `HTTP_PROXY`
  已经配置但没意识到 fetch 路径之前没吃到代理，请事先评估钉钉/LLM
  等流量突然切换到代理后，出口带宽与代理稳定性是否承压。

## 四、用户 / 产品视角验收步骤

> 面向部署运维与产品方的最小验证路径。

1. 使用新版本重新发布 `@nextclaw/digital-employee`。
2. 在目标环境按需配置：
   - 需要经代理访问外网：`HTTP_PROXY` / `HTTPS_PROXY`。
   - 存在内网域名要直连：`NO_PROXY`（支持 `*`、`foo.com`、`.foo.com`、
     `*.foo.com`、`foo.com:port` 多种写法）。
3. 启动服务，观察日志存在 `[proxy-bootstrap] proxy=... noProxy=...`。
4. 登录平台，分别触发：
   - Keycloak 登录（如在 NO_PROXY 内则直连内网）；
   - 钉钉组织同步（走代理出网）；
   - 与数字员工对话（LLM 调用走代理出网）；
   - 人员同步（如在 NO_PROXY 内则直连内网）。
5. 若任一环节失败，先确认启动日志中实际被解析的 `noProxy=` 值是否
   符合预期，再排查代理服务与内网 DNS。

---

## 相关文件

- [00.proxy-bootstrap.ts](../../../packages/nextclaw-digital-employee/server/plugins/00.proxy-bootstrap.ts)
