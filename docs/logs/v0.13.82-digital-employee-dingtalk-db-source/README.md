# v0.13.82-digital-employee-dingtalk-db-source

## 迭代完成说明

- 将数字员工平台的钉钉账号配置与员工/群路由绑定切换为平台数据库真源，不再依赖 `NEXTCLAW_HOME/config.json`。
- 新增 `IntegrationConnectionRepository`，复用既有 `integration_connections` 表承载钉钉聚合配置。
- `dingtalk-config` 改为基于 DB 的异步读写接口，并保留纯函数路由转换能力。
- `platform-context` 与通用 channel runtime 改为从数据库组装标准 `Config`，继续复用 `core` / OpenClaw 插件主链路，不让插件直接读库。

## 测试/验证/验收方式

- 单测：
  - `pnpm -C packages/nextclaw-digital-employee exec vitest run tests/dingtalk-config-storage.test.ts tests/dingtalk-routing.test.ts tests/runtime-config.test.ts tests/channel-runtime.test.ts tests/database-and-skill-gateway.test.ts tests/skill-import-and-run-service.test.ts`
- 类型检查：
  - `pnpm -C packages/nextclaw-digital-employee tsc`
- 定向 lint：
  - `pnpm -C packages/nextclaw-digital-employee exec eslint tests/dingtalk-config-storage.test.ts tests/runtime-config.test.ts tests/dingtalk-routing.test.ts tests/channel-runtime.test.ts tests/database-and-skill-gateway.test.ts server/repositories/integration-connection-repository.ts server/runtime/dingtalk-config.ts server/runtime/openclaw-runtime.ts server/runtime/platform-context.ts server/api/integrations/index.get.ts server/api/integrations/dingtalk.get.ts server/api/integrations/dingtalk.put.ts server/api/integrations/dingtalk-groups.get.ts 'server/api/employees/[id]/dingtalk-binding.get.ts' 'server/api/employees/[id]/dingtalk-binding.put.ts' --max-warnings=0`
- 构建：
  - `pnpm -C packages/nextclaw-digital-employee build`
- 隔离冒烟：
  - 仅设置 `NEXTCLAW_DIGITAL_EMPLOYEE_HOME` 启动 build 产物，不设置 `NEXTCLAW_HOME`
  - 通过 API 写入钉钉账号、员工、员工绑定
  - 重启进程后再次读取接口，确认账号与绑定仍能从 DB 恢复
  - 结果：`DB_SMOKE_OK`

## 发布/部署方式

- 本次未提交、未发布、未部署。
- 若后续部署数字员工平台，不再要求提前准备共享 `NEXTCLAW_HOME/config.json` 的钉钉配置。
- 真正联调钉钉前，仍需在平台里填写有效的 `AppKey/AppSecret/robotCode`。

## 用户/产品视角的验收步骤

1. 启动数字员工平台，只传 `NEXTCLAW_DIGITAL_EMPLOYEE_HOME`。
2. 在“集成中心”配置一个钉钉机器人账号并保存。
3. 在员工详情页绑定“默认私聊入口”，必要时再绑定群。
4. 关闭并重新启动数字员工平台。
5. 返回平台查看钉钉配置、员工绑定、群绑定，确认数据仍存在且无需依赖外部共享 config 文件。
