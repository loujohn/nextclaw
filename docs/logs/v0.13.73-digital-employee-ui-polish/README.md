# v0.13.73 · digital-employee UI polish

## 迭代完成说明

针对 `packages/nextclaw-digital-employee` 前端进行了一轮 UI 打磨，涉及以下改动：

### 1. 运行状态中文化

- 在 `shared/ui-models.ts` 新增并导出 `formatRunStatusLabel(status)` 工具函数：
  - `"completed"` → `"已完成"`
  - `"failed"` → `"执行失败"`
  - `"running"` → `"执行中"`
  - 其他 → `"等待中"`
- 所有涉及运行状态展示的页面统一改用该函数：
  - `app/pages/runs/index.vue`（运行中心）
  - `app/pages/employees/[id].vue`（员工详情侧边栏"最近运行"）
  - `app/pages/employees/[id]/index.vue`（员工概览"产出"分区）
  - `app/pages/employees/[id]/runs.vue`（运行历史 Tab）

### 2. Markdown 渲染

- 在 `app/lib/utils.ts` 新增 `renderMarkdown(raw)` 工具函数，将代码块 / 内联代码 / 加粗 / 列表 / 换行转换为安全 HTML。
- 在 `app/assets/css/tailwind.css` 新增 `.result-card-md` 与 `.run-detail-md` 全局样式（代码块背景、列表缩进、加粗等）。
- 以下区域改用 `v-html="renderMarkdown(...)"` 渲染：
  - `app/components/ResultCard.vue`（聊天结果卡片）
  - `app/pages/runs/index.vue`（运行中心列表摘要 & 详情面板）
  - `app/pages/employees/[id]/runs.vue`（运行历史列表摘要 & 详情面板）
  - `app/pages/employees/[id]/index.vue`（职责与人设 / 角色定义）

### 3. 布局修复

- 状态标签加 `shrink-0 whitespace-nowrap`，防止多词状态换行。
- 相邻文本加 `min-w-0 truncate`，确保 flex 容器内正确截断。
- 长内容区域（systemPrompt / 运行摘要）加 `max-h-* overflow-y-auto` 限高可滚动。
- 技能中心 `skills/index.vue` Tag 列表加 `shrink-0 whitespace-nowrap`，防止标签撑破行宽。

### 4. 运行历史内联详情面板

- 将 `app/pages/employees/[id]/runs.vue` 列表项由 `<NuxtLink>` 改为 `<button>`，点击后在当前页面弹出侧边详情面板（`<Teleport to="body">`），不再跳转。
- 详情面板包含完整运行摘要（支持 Markdown 渲染 + 滚动）。

### 5. 时间格式化

- 运行历史列表中 `run.startedAt` 原本显示原始 ISO 时间戳，改为复用已有的 `formatDateTime` 函数格式化为标准可读时间（中国时区 `Asia/Shanghai`，如 `2026/03/17 18:30`）。

---

## 测试 / 验证方式

验证为纯 UI 改动（无后端 / 数据库 / 构建链路变更），不适用 `build / lint / tsc` 全量验证。

**冒烟步骤（开发服务器）：**

```bash
# 在项目根目录启动平台开发服务
pnpm dev:platform
```

逐项检查：
1. 进入"运行中心"，状态列应显示"已完成 / 执行失败 / 执行中 / 等待中"（中文）。
2. 运行摘要中的代码块 / 加粗 / 列表是否正确渲染为富文本（Markdown）。
3. 点击运行列表项，确认右侧滑出详情面板（而非跳转新页面）。
4. 详情面板摘要文本超长时可纵向滚动。
5. 进入任意员工"运行历史" Tab，时间列应显示格式化时间（非 ISO 字符串）。
6. 技能中心标签不换行、不撑破行宽。

---

## 发布 / 部署方式

纯前端 UI 变更，无 API / 数据库 / NPM 包变更，不适用独立发布流程。集成到下一次前端常规发布（`/release-frontend`）时自动覆盖。

---

## 用户 / 产品视角验收步骤

| # | 验收项 | 预期结果 |
|---|--------|---------|
| 1 | 打开"运行中心"查看状态列 | 所有状态显示中文（已完成 / 执行失败 / 执行中 / 等待中） |
| 2 | 查看含 Markdown 内容的运行摘要 | 代码块、加粗、列表正确富文本渲染 |
| 3 | 点击"运行记录"条目 | 就地弹出详情面板，不跳转新页面 |
| 4 | 员工详情"运行历史" Tab 时间列 | 显示可读时间如 `2026/03/17 18:30`，非 ISO 字符串 |
| 5 | 员工详情"产出"区状态 | 中文状态，不换行 |
| 6 | 技能中心标签行 | 标签不换行、不溢出 |
