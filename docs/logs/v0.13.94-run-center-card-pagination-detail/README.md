# v0.13.94 — 运行中心：卡片布局 + 分页查询 + 详情按钮 + 服务端状态过滤

## 迭代完成说明

### 改动范围

- **`packages/nextclaw-digital-employee/server/repositories/run-record-repository.ts`**
  - 新增 `listPaged(params: { page, pageSize, status? }): Promise<{ items, total }>` 方法
  - 支持服务端偏移分页，同时返回总条数（`total`），与原 `list()` 方法共存互不影响
  - `status` 为可选过滤字段，传入时在 SQL 层面 WHERE 过滤，`total` 也反映过滤后总数

- **`packages/nextclaw-digital-employee/server/api/runs/index.get.ts`**
  - 接受 `page`（默认 1）、`pageSize`（默认 10，上限 100）、`status`（枚举白名单：`completed`/`running`/`failed`）查询参数
  - 改用 `listPaged` 实现服务端分页与状态过滤，响应结构新增 `total`、`page`、`pageSize` 字段
  - 移除旧 `limit` 参数与 `raw` 字段；`status` 参数通过白名单校验，非法值忽略

- **`packages/nextclaw-digital-employee/app/pages/runs/index.vue`**
  - **布局**：移除时间线样式，改为 `2 列卡片网格`（sm:grid-cols-2），每张卡片有独立边框色、状态圆点、员工名、状态徽章、触发方式、开始时间、摘要/亮点；
  - **分页**：每页固定 10 条，使用响应式 `useFetch(() => buildApiUrl())` 动态获取；底部分页控件含上一页/下一页按钮 + 动态页码（含省略号）；
  - **详情按钮**：卡片底部新增独立"详情"按钮（含状态图标），点击后打开右侧抽屉详情面板（Slide-over），包含元信息、结果摘要、关键事件、原始结果；
  - **状态筛选（服务端）**：点击"全部 / 已完成 / 执行中 / 失败"按钮时，将状态映射为 `status=completed/running/failed` 参数追加到请求 URL，由服务端完成过滤；切换筛选自动重置到第 1 页；激活筛选按钮旁显示服务端返回的实际 `total`；不再做客户端二次过滤。

## 测试 / 验证 / 验收方式

### 后端验证

```bash
# 在 nextclaw-digital-employee 目录下执行 tsc 检查
pnpm -C packages/nextclaw-digital-employee tsc --noEmit
```

观察点：`RunRecordRepository.listPaged` 类型正确，API handler 无类型报错。

### 前端验证（冒烟）

1. 启动本地 dev server：
   ```bash
   pnpm -C packages/nextclaw-digital-employee dev
   ```
2. 打开浏览器访问运行中心 `/runs`；
3. 验证以下行为：
   - 列表以 2 列卡片形式展示（非时间线）；
   - 每页最多 10 条，底部分页控件可用；
   - 翻页后请求 URL 带有 `?page=2&pageSize=10` 等参数；
   - 点击卡片底部"详情"按钮后右侧抽屉弹出，展示触发方式、状态、事件数、结果摘要、关键事件、原始结果；
   - 点击遮罩或关闭按钮可收起抽屉；
   - 状态筛选按钮（已完成/执行中/失败）在当前页内生效；
   - 顶部状态过滤区显示"共 N 条记录"总数。

## 发布 / 部署方式

本次为纯应用内迭代（包含 Nuxt 前后端），随平台发布流程正常部署即可。

无数据库结构变更（仅新增查询逻辑），无需 migration。

## 用户 / 产品视角的验收步骤

| # | 操作 | 期望结果 |
|---|------|---------|
| 1 | 打开"运行中心" | 显示卡片网格（2 列），无时间线竖线 |
| 2 | 查看页面底部 | 出现分页控件（上一页 / 页码 / 下一页） |
| 3 | 当总记录 > 10 条时点击"下一页" | 加载第 2 页数据，页码高亮更新 |
| 4 | 点击任意卡片底部"详情"按钮 | 右侧抽屉弹出，展示运行详情 |
| 5 | 点击抽屉外遮罩 | 抽屉收起 |
| 6 | 点击"已完成"筛选 | 当前页仅展示已完成卡片 |
| 7 | 翻页后筛选自动重置 | 本页全部数据重新展示 |
