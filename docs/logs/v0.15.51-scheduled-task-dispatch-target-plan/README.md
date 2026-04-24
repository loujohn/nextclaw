# v0.15.51-scheduled-task-dispatch-target-plan

## 迭代完成说明（改了什么）

- 新增一份实现计划文档：[Scheduled Task Dispatch Target Implementation Plan](../../superpowers/plans/2026-04-23-scheduled-task-dispatch-target.md)
- 计划覆盖两件事：
  - 定时任务在创建/修改时把自然语言提示词编译为稳定的 `dispatchTarget`
  - `/new` 从布尔判断升级为共享 parser + surface policy
- 本轮只产出方案与计划文档，没有改业务代码，没有变更运行时行为。

## 测试/验证/验收方式

- 文档结构检查：
  - 确认计划文档存在于 `docs/superpowers/plans/2026-04-23-scheduled-task-dispatch-target.md`
  - 确认本 README 使用 Markdown 链接引用计划文档
- 代码类验证不适用：
  - 本轮未触达构建、类型、运行链路，仅新增文档与计划说明，因此 `build / lint / tsc / smoke` 不适用

## 发布/部署方式

- 本轮不涉及发布、部署、migration、远程环境变更
- 后续若按计划实施，再按实际变更范围执行 migration、验证与发布闭环

## 用户/产品视角的验收步骤

1. 打开 [计划文档](../../superpowers/plans/2026-04-23-scheduled-task-dispatch-target.md)。
2. 确认计划已覆盖：
   - “提示词决定返回渠道，但只在创建/修改任务时解析一次”
   - “默认原渠道与显式其他渠道并存”
   - “避免双重发送”
   - “`/new` 统一 parser、按不同 surface 执行”
3. 若计划边界与任务拆分符合预期，即可进入实现阶段。
