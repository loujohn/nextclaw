# v0.15.65 — CIDR 无符号 32 位表示归一

## 一、迭代完成说明（改了什么）

针对“CIDR 解析是否有问题，重复定义 / 两处 parseCidr 实现不一致”的反馈，本次复核结果：

- 源码层面只有一处 CIDR 解析实现：
  [no-proxy.ts](../../../packages/nextclaw-core/src/utils/no-proxy.ts)。
- `packages/nextclaw-digital-employee/server/utils/no-proxy.ts` 只是从
  `@nextclaw/core` 重新导出，不再维护第二套实现。
- `packages/nextclaw-core/dist` 与 `packages/nextclaw-digital-employee/.nuxt/dev`
  中看到的同名函数是构建/开发生成产物，不是独立源码。

但复核中确认 CIDR 内部表示确实存在问题：

- `parseIpv4Cidr()` 中 `address & mask` 会得到 JavaScript 有符号 32 位结果；
- 例如 `172.31.0.0/16` 的 `baseAddress` 会变成 `-1407254528`；
- 匹配时虽然因为同样使用有符号位运算“碰巧相等”，但内部表示不稳定，
  容易引入后续实现差异。

本次修复：

- 新增 `toUnsigned32()`，CIDR `baseAddress` 统一保存为无符号 32 位数；
- 匹配时也统一将 `(address & mask)` 转成无符号 32 位数后比较；
- 新增 core 侧 CIDR 专项测试，锁定 `172.31.0.0/16` 的无符号内部表示。

## 二、测试 / 验证 / 验收方式

- 红灯验证：
  - `pnpm -C packages/nextclaw-core test -- src/utils/no-proxy.test.ts`
  - 修改前失败：`baseAddress` 实际为 `-1407254528`，期望为 `2887712768`。
- 通过验证：
  - `pnpm -C packages/nextclaw-core exec vitest run src/utils/no-proxy.test.ts`
  - `pnpm -C packages/nextclaw-digital-employee test -- tests/no-proxy.test.ts`

## 三、发布 / 部署方式

- 无数据库 migration。
- 无新增环境变量。
- 需要重新构建并发布包含 `@nextclaw/core` 的运行产物；依赖该包的
  digital-employee / 钉钉插件运行镜像需使用最新构建。

## 四、用户 / 产品视角的验收步骤

1. 保持线上 `NO_PROXY` 中的 CIDR 配置，例如 `172.31.0.0/16`。
2. 启动后确认日志中 `noProxy=` 仍显示该 CIDR 规则。
3. 观察钉钉代理路由日志，内网代理地址应稳定命中直连逻辑。
4. 结合代理服务日志，确认不再出现代理自身地址被反复 CONNECT 的自代理环路。
