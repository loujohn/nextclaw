# v0.15.64 — 钉钉 WebSocket 真实 open 判定与代理路由诊断

## 一、迭代完成说明（改了什么）

线上仍出现：

```text
[dingtalk] ws proxy injected -> http://172.31.1.95:1080 (...)
[dingtalk] health: account=... restarted successfully
[dingtalk] health: account=... disconnected, monitoring...
```

这说明上一轮已经把 NO_PROXY-aware agent 注入进去，但仍没有证明 WebSocket
真正进入 `open` 状态。继续追踪 `dingtalk-stream` 后确认：

- SDK 的 `connect()` 会在创建 WebSocket 后立即返回；
- `client.connected=true` 只有 WebSocket `open` 事件触发后才会设置；
- 因此旧日志里的 `connected account=...` / `restarted successfully`
  可能是假成功：只是 socket 被创建了，不代表已经连上钉钉。

本次修复：

- `patchClientConnect()` 在 `originalConnect()` 后继续等待 WebSocket `open`。
- 若 30 秒内没有 `open`，抛出明确错误：
  `DingTalk WebSocket did not open within 30s ...`
- 若 open 前发生 `error` / `close`，错误中记录 account、target、code、reason。
- `connected account=...` 现在只会在 WebSocket 真正 open 后出现。
- 新增代理路由诊断日志：
  - `ws connecting account=<id> target=<wss://host/path>`
  - `ws proxy route account=<id> target=<host:port> route=proxy|direct`
  - `ws open account=<id> target=<wss://host/path>`

相关文件：

- [channel.ts](../../../packages/extensions/nextclaw-channel-plugin-dingtalk/src/channel.ts)
- [channel.test.ts](../../../packages/extensions/nextclaw-channel-plugin-dingtalk/src/channel.test.ts)

## 二、测试 / 验证 / 验收方式

- 红灯验证：
  - 新增测试模拟 SDK 创建 socket 但永远不触发 `open`。
  - 修改前测试失败：promise resolved `undefined`，并打印假成功
    `connected account=ops-bot`。
- 通过验证：
  - `pnpm -C packages/extensions/nextclaw-channel-plugin-dingtalk test -- src/channel.test.ts`

## 三、发布 / 部署方式

- 无数据库 migration。
- 无新增环境变量。
- 需要重新构建并发布包含 `@nextclaw/channel-plugin-dingtalk` 的运行产物。
- 部署后无需修改现有 `HTTPS_PROXY` / `NO_PROXY`，但需要观察新增日志判断
  代理是否真正连接到了钉钉目标域名。

## 四、用户 / 产品视角的验收步骤

1. 启动服务并观察每个账号是否出现：
   `ws connecting account=... target=wss://...`。
2. 观察是否出现：
   `ws proxy route account=... target=... route=proxy|direct`。
3. 只有出现 `ws open account=...` 后，才应出现
   `connected account=...`。
4. 如果 30 秒内未 open，应看到明确的 timeout/error/close 日志，而不是
   `restarted successfully` 后继续 health disconnected 循环。
5. 结合代理服务器日志核对 `ws proxy route target` 是否与代理侧 CONNECT
   目标一致。
