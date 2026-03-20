# v0.13.91-dingtalk-route-rename-and-reload-rollback

## 迭代完成说明

- 修复 DingTalk 集成页中修改 `accountId` 会导致既有私聊默认绑定和群绑定静默丢失的问题；保存前会按 `sourceAccountId -> accountId` 自动迁移 routing 引用。
- 在服务端补齐同样的账号重写逻辑，确保即使调用方仍提交旧 `accountId` 的 routing 结构，持久化时也会统一迁移到新账号。
- 将 DingTalk 配置更新改为“先快照、写库、reload，失败则回滚旧配置并恢复旧 runtime”的闭环，避免出现“数据库已写坏配置、旧通道已停掉”的半失败状态。
- 为上述行为补充回归测试，覆盖账号改名路由跟随、reload 失败回滚、现有路由保持不丢失。

## 测试 / 验证 / 验收方式

- 定向测试：
  - `pnpm -C packages/nextclaw-digital-employee exec vitest run tests/dingtalk-editor-model.test.ts tests/dingtalk-config-storage.test.ts tests/dingtalk-routing.test.ts tests/channel-runtime.test.ts`
- 静态检查：
  - `pnpm -C packages/nextclaw-digital-employee exec eslint app/pages/integrations/index.vue server/api/integrations/dingtalk.put.ts server/runtime/dingtalk-config.ts shared/dingtalk-editor-model.ts tests/dingtalk-editor-model.test.ts tests/dingtalk-config-storage.test.ts tests/dingtalk-routing.test.ts tests/channel-runtime.test.ts`
  - 结果：无 error；测试文件保留既有 `max-lines-per-function` warning
  - `pnpm -C packages/nextclaw-digital-employee tsc`
  - `pnpm -C packages/nextclaw-digital-employee build`
- 冒烟测试：
  - 在 `/tmp` 隔离目录启动构建产物
  - 通过真实 API 先写入 `ops-bot` 配置，再将账号改名为 `ops-renamed`
  - 验证 `defaultByAccount` 与群绑定都跟随迁移
  - 观察点：输出 `DINGTALK_RENAME_ROUTE_SMOKE_OK`

## 发布 / 部署方式

- 本次未执行提交、发布或部署。
- 若后续上线，直接按当前数字员工服务发布流程部署即可，无需额外 migration。
- 发布后建议用同一组 API 再做一次线上冒烟，重点确认账号改名不会丢失绑定，且错误配置不会让运行态停在半失败状态。

## 用户 / 产品视角的验收步骤

1. 在数字员工“集成中心”创建一个 DingTalk 账号，并为某个员工配置默认私聊入口和至少一个群绑定。
2. 回到 DingTalk 集成页，将该账号的 `accountId` 改成新值并保存。
3. 刷新页面，确认员工私聊入口和群绑定仍然存在，且已经指向新账号。
4. 故意提交一份会触发 runtime reload 失败的无效配置，确认接口报错后，刷新页面仍能看到旧配置，原运行入口不被清空。
