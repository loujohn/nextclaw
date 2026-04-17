# v0.15.25-user-management-server-pagination

## 迭代完成说明

- 用户管理列表接口改为后端分页，固定每页 10 条，接口返回 `data + total + page + pageSize`，避免前端一次性拉取全部用户。
- 用户管理搜索从前端本地过滤改为后端查询，保持分页后仍可按姓名、用户名、邮箱、外部信息等字段检索。
- 用户管理页接入新的分页接口，新增上一页/下一页分页栏。
- “同步资料”列改为点击“查看详情”弹窗展示，缩短表格行宽，提升列表可读性。
- 关联员工弹窗的候选列表改为后端排除已绑定员工，避免分页后只依据当前页用户造成误选。
- 抽离用户同步详情弹窗、同步结果弹窗、分页底栏为独立组件，降低页面耦合。

## 测试/验证/验收方式

- 已执行：`pnpm -C packages/nextclaw-digital-employee exec eslint app/pages/users/index.vue app/components/users/SyncProfileDialog.vue app/components/users/SyncResultDialog.vue app/components/users/ListPagination.vue shared/auth-types.ts server/repositories/user-repository.ts server/api/users/index.get.ts server/api/org/human-employees.get.ts`
- 结果：通过。
- `build / tsc`：本次未执行，当前改动聚焦用户管理页与对应 API，已先做最小充分 lint 验证。
- UI 冒烟：本次未执行。原因是当前会话未启动可登录的平台运行环境，且用户管理页需要管理员鉴权与真实数据源支持。

## 发布/部署方式

- 本次为应用内页面与 API 代码改动，无独立发布动作。
- 按常规数字员工平台流程合入后，随应用下一次部署一起生效。

## 用户/产品视角的验收步骤

1. 以管理员身份进入用户管理页，确认列表初始只展示 10 条用户数据。
2. 点击“下一页”与“上一页”，确认用户列表按页切换，且不会一次性加载全部数据。
3. 在搜索框输入姓名、用户名、邮箱或外部 ID，确认列表回到第一页并返回匹配结果。
4. 在“同步资料”列点击“查看详情”，确认通过弹窗查看外部资料，列表行高保持紧凑。
5. 打开“手动关联”弹窗，确认候选员工列表不会包含已经被其它用户绑定的员工。
