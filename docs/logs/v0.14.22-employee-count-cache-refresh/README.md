# v0.14.22-employee-count-cache-refresh

## 迭代完成说明

- 修复 nextclaw-digital-employee 中创建、编辑、删除数字员工后的跨页面统计刷新问题。
- 在 employees CRUD 成功后，统一触发员工列表与工作中心相关 Nuxt data key 的刷新：store-employees、/api/dashboard、/api/dashboard/stats。
- 解决此前从组织架构页执行员工变更后，再切回“总览”或“工作中心”仍可能看到旧数字员工数量的问题。

## 测试/验证/验收方式

- 执行 ESLint：pnpm -C packages/nextclaw-digital-employee exec eslint app/composables/useEmployeeCrud.ts
- 执行类型检查：pnpm -C packages/nextclaw-digital-employee exec nuxi typecheck
- 实际 UI 冒烟结果：
  - 创建临时数字员工后，组织架构总览从 4 刷新到 5，工作中心“数字员工”卡片同步刷新到 5。
  - 删除临时数字员工后，组织架构总览回落到 4，工作中心“数字员工”卡片同步回落到 4。
  - 冒烟结束后已清理全部临时员工，当前环境最终恢复为 3 名数字员工。
- 手工冒烟：
  - 在组织架构页创建一个数字员工，确认总览中的数字员工总数立即增加。
  - 跳转到工作中心，确认“数字员工”统计卡片同步增加。
  - 删除该数字员工后，确认组织架构总览与工作中心统计同时回退。

## 发布/部署方式

- 本次为前端缓存刷新修复，无数据库 schema 变更，无 migration。
- 按常规前端发布流程重新构建并发布 nextclaw-digital-employee 所在应用即可。

## 用户/产品视角的验收步骤

1. 进入组织架构页面，记录当前总览中的数字员工数量。
2. 创建一个新的数字员工并完成保存。
3. 观察组织架构总览中的数字员工数量是否立即加 1。
4. 切换到工作中心，观察“数字员工”统计卡片是否与总览一致。
5. 返回组织架构删除刚创建的数字员工。
6. 再次检查组织架构总览和工作中心，确认两处统计都立即减 1 且保持一致。
