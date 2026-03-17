# v0.13.75 · run-result-i18n-and-time-format

## 迭代完成说明

### 背景

数字员工平台各页面的运行结果字段（`summary`、`highlight`）直接展示 AI Agent 写入数据库的原始英文字符串，用户可见 `HEARTBEAT_OK`、`Error: Connection error` 等内容，体验不佳。

### 改动范围

#### 1. 新增翻译工具函数（`shared/ui-models.ts`）

新增并导出 `translateRunText(text: string): string`，统一替换运行摘要中的常见英文字符串：

| 原始字符串 | 中文 |
|---|---|
| `HEARTBEAT_OK` | 心跳正常 |
| `Error: Connection error` | 错误：连接失败 |
| `Connection error` | 连接失败 |
| `Network error` | 网络错误 |
| `Connection timeout` | 连接超时 |
| `Request timeout` | 请求超时 |
| `Failed to fetch` / `Fetch failed` | 请求失败 |

#### 2. 应用翻译至通用数据层（`shared/ui-models.ts`）

在 `buildRunListEntries()` 中：
- `highlight`：`readFirstCardContent(run.result) || run.summary` → 经 `translateRunText` 处理后输出
- `summary`：`run.summary || "尚未生成摘要"` → 经 `translateRunText` 处理后输出

覆盖路径：运行列表（`runs/index.vue`）、仪表盘"最新产出与结果"（`index.vue`）。

#### 3. 修复运行详情 API（`server/api/runs/[id].get.ts`）

导入并应用 `translateRunText`，在返回 `summary` 字段前翻译。  
覆盖路径：运行中心"结果摘要"抽屉、员工"历史记录"详情面板。

#### 4. 修复员工概览"产出"区域（`app/pages/employees/[id]/index.vue` 及 `[id].vue`）

- 导入 `formatDateTime` 与 `translateRunText`
- 模板从 `{{ run.summary || run.startedAt }}` 改为 `{{ translateRunText(run.summary) || formatDateTime(run.startedAt) }}`  
  → 摘要存在时显示翻译后中文；无摘要时显示标准格式时间（如 `2026-03-17 10:30`），不再显示原始 ISO 字符串

#### 5. 修复员工"历史记录"列表摘要（`app/pages/employees/[id]/runs.vue`）

- 导入 `translateRunText`
- 列表渲染从 `renderMarkdown(run.summary || '等待结果摘要')` 改为 `renderMarkdown(translateRunText(run.summary) || '等待结果摘要')`

#### 6. 已有修改（上一阶段，UI 包）

- `packages/nextclaw-ui/src/lib/i18n.ts`：新增 `heartbeatOk`、`cronLastStatus*`、`cronError*` 翻译键
- `packages/nextclaw-ui/src/components/config/CronConfig.tsx`：Cron 任务卡片末次状态/错误翻译
- `packages/nextclaw-ui/src/components/config/SessionsConfig.tsx`：会话消息气泡 `HEARTBEAT_OK` 翻译

---

## 测试 / 验证 / 验收

### 影响面判定

改动涉及 Nuxt 3 前端页面与服务端 API，属代码路径改动。

### 验证步骤

```bash
# 在 nextclaw-digital-employee 包目录执行 TypeScript 类型检查
cd packages/nextclaw-digital-employee
pnpm tsc --noEmit

# 在 nextclaw-ui 包目录执行 lint 和类型检查
cd packages/nextclaw-ui
pnpm lint
pnpm tsc --noEmit
```

### 冒烟测试观察点

1. **运行中心 → 选中任意运行 → 结果摘要**：不应出现 `HEARTBEAT_OK` 或 `Error: Connection error`，应显示对应中文
2. **仪表盘 → 最新产出与结果**：运行卡片摘要显示中文
3. **员工详情 → 产出区**：有摘要时显示中文；无摘要时显示 `YYYY-MM-DD HH:mm` 格式时间，不显示 ISO 字符串
4. **员工详情 → 历史记录**：列表中各运行摘要显示中文

---

## 发布 / 部署方式

本迭代为纯前端/服务端渲染变更，部署方式：

```bash
# 重新构建并部署 nextclaw-digital-employee
pnpm --filter nextclaw-digital-employee build
# 按平台发布流程部署服务
```

`build`、`lint`、`tsc` 均适用并需在发布前验证通过。

---

## 用户 / 产品视角的验收步骤

1. 打开数字员工平台
2. 在**运行中心**查看任意运行记录的"结果摘要"——应显示中文（如"心跳正常"、"错误：连接失败"），不出现英文原文
3. 在**仪表盘**查看"最新产出与结果"列表——运行摘要显示中文
4. 进入任意**员工详情页**：
   - "产出"卡片列表：有结果的行显示中文摘要；没有结果的行显示标准时间格式（如 `2026-03-17 18:00`）
   - "历史记录"标签页：每条运行摘要显示中文，不出现英文
5. 在**会话消息气泡**中，心跳消息显示"心跳正常"而非 `HEARTBEAT_OK`
