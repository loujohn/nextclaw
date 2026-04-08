# v0.14.25-employee-overview-consistent-refresh

## 迭代完成说明

- 在员工详情页的概览模块中，将切回概览时的刷新策略从单一统计接口扩展为统一刷新链路。
- 现在从“聊天”“定时任务”“运行记录”“配置”等子 tab 返回概览时，会同时刷新员工详情、顶部统计、任务概览，并让“最近运行活动”强制重新取数。
- 目标是避免同一页面内出现顶部数据已更新、列表区域仍停留旧缓存的状态不一致问题。

## 测试/验证/验收方式

- 静态检查：
  - `app/pages/employees/[id].vue` 无编辑器错误。
  - `app/components/employee-overview/RecentActivity.vue` 无编辑器错误。
- Lint：执行 `pnpm -C packages/nextclaw-digital-employee exec eslint "app/pages/employees/[id].vue" "app/components/employee-overview/RecentActivity.vue"`，通过；存在既有 TypeScript 版本兼容 warning，但无本次改动相关错误。
- 类型检查：执行 `pnpm -C packages/nextclaw-digital-employee exec nuxt typecheck`，通过。
- 冒烟验证：启动本地服务后，访问员工详情页，执行“聊天 -> 概览”切换，确认概览页可正常展示，最近运行活动与任务概览区块无报错并按最新请求链路刷新。

## 发布/部署方式

- 本次为前端交互与数据刷新策略调整，无单独部署步骤。
- 合并后按项目既有前端发布流程发布数字员工站点即可。

## 用户/产品视角的验收步骤

1. 打开任一数字员工详情页。
2. 记录概览中的“今日运行”“累计运行”“成功率”“最近运行活动”“定时任务概览”当前内容。
3. 切换到“聊天”或“定时任务”等子 tab。
4. 返回“概览”。
5. 确认页面无闪退、无报错，且概览区块按最新接口结果统一刷新，不出现部分区域仍显示旧数据的情况。