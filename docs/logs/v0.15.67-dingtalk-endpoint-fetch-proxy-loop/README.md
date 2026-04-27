# v0.15.67 DingTalk Endpoint Fetch Proxy Loop

## 迭代完成说明

- 修复钉钉 stream endpoint 获取继续通过 `dingtalk-stream` SDK 内部 Axios 发起请求，导致与运行时全局代理引导叠加后出现代理循环的问题。
- endpoint 获取改为通道层直接使用 `undici fetch` 调用 `https://api.dingtalk.com/v1.0/gateway/connections/open`，并在存在代理环境变量时显式挂载 `EnvHttpProxyAgent` dispatcher，避免插件与服务端使用不同 undici 实例时代理配置失效。
- endpoint 响应成功后由通道层写回 SDK 客户端的 `config.endpoint` 与 `dw_url`，后续仍复用已注入代理的 `_connect()` 建立 WebSocket。
- endpoint HTTP/网络失败时抛出脱敏后的通道层错误，不再输出 Axios 完整 request config，避免日志泄露 `clientSecret`。
- 新增回归测试覆盖：
  - endpoint 请求必须走 `undici fetch`，不能走 SDK Axios `getEndpoint()`；
  - endpoint HTTP 503 必须在等待 WebSocket socket 前暴露真实 endpoint 错误；
  - 配置代理时 endpoint fetch 必须显式带 `EnvHttpProxyAgent` dispatcher。

## 测试/验证/验收方式

- `pnpm -C packages/extensions/nextclaw-channel-plugin-dingtalk exec vitest run src/channel.test.ts --testNamePattern "undici fetch|endpoint HTTP|EnvHttpProxyAgent"`：3 个测试通过。
- `pnpm -C packages/extensions/nextclaw-channel-plugin-dingtalk test`：2 个测试文件、16 个测试通过。
- `git diff --check`：通过。
- `tsc` 不适用：该插件包当前没有 `tsc` 脚本，且工作区未提供可直接执行的 `tsc` 命令。
- `lint` 不适用：该插件包当前没有 ESLint 配置，直接执行 ESLint 会报找不到配置文件。

## 发布/部署方式

- 需要重新打包并部署包含 `packages/extensions/nextclaw-channel-plugin-dingtalk/src/channel.ts` 的钉钉插件运行时。
- 不涉及数据库 migration。
- 不涉及前端静态资源发布。

## 用户/产品视角的验收步骤

1. 使用线上相同代理环境启动 digital-employee 服务。
2. 观察钉钉启动日志：endpoint 阶段不应再出现 AxiosError 完整 request config，也不应再出现 Squid 尝试 CONNECT `172.31.1.95:1080` 自身的代理循环。
3. 若代理仍返回 503，应看到 `DingTalk endpoint request failed account=... status=503 body=...` 这类脱敏错误。
4. 若 endpoint 成功，应继续看到 `endpoint resolved`、`ws connecting`、`ws proxy route`、`ws open`，最终账号进入 connected。
