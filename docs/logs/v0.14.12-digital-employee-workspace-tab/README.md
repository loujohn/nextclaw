# v0.14.12 — 数字员工工作空间 Tab

## 迭代完成说明

本次迭代在数字员工工作台（`packages/nextclaw-digital-employee`）中新增了**工作空间**功能模块，参考 CoPaw 客户端的文件管理界面设计，实现对员工自身 MD 文件的浏览、预览、编辑与下载。

### 改动清单

| 文件 | 类型 | 说明 |
|---|---|---|
| `server/api/employees/[id]/workspace/index.get.ts` | **新增** | 获取员工工作区文件列表 API（含 exists、sizeBytes、writable 元信息） |
| `app/pages/employees/[id].vue` | **修改** | 在员工工作台 Tabs 末尾新增"工作空间"Tab |
| `app/pages/employees/[id]/workspace.vue` | **新增** | 工作空间页面，包含文件列表侧边栏 + 内容预览/编辑/下载面板 |

### 功能特性

- **文件列表**：左侧固定宽度侧边栏展示 8 个核心 MD 文件（AGENTS.md、TOOLS.md、USER.md、BOOT.md、HEARTBEAT.md、MEMORY.md、SOUL.md、IDENTITY.md），显示文件大小，锁图标标注只读文件
- **预览模式**：点击文件后默认进入预览，使用 `renderMarkdown()` 渲染富文本（与聊天模块一致）
- **编辑模式**：对可写文件（前 6 个）可切换到编辑模式，使用等宽字体 textarea；只读文件（SOUL.md、IDENTITY.md）编辑按钮禁用
- **保存**：PUT `/api/employees/:id/workspace/:filename`，保存成功后刷新文件列表和内容，2.5 秒后恢复按钮状态
- **下载**：客户端 Blob 下载，文件名即为 MD 文件名，无需后端参与
- **样式**：复用项目 `section-label`、`card-elevated`、`bg-card`、`border-border`、`primary/secondary` 等设计 token，与全站保持一致

### 安全特性

- 服务端双重白名单保护：GET 接口 8 个允许文件、PUT 接口只允许 6 个可写文件
- 非法文件名直接 400 拒绝，防止路径穿越

---

## 测试 / 验证 / 验收

### 自动化验证（构建 + 路由）

```bash
# 1. 构建通过，无编译错误
pnpm nuxt build   # ✅ Build complete

# 2. lint 新增文件无错误（存量错误来自测试文件，与本次改动无关）
pnpm lint         # 新增文件：0 errors

# 3. workspace 路由正确注册（nitro.mjs 中已确认）
# { route: '/api/employees/:id/workspace', method: "get" }           ✅
# { route: '/api/employees/:id/workspace/:filename', method: "get" } ✅
# { route: '/api/employees/:id/workspace/:filename', method: "put" } ✅
```

### 冒烟测试（真实 API）

```bash
# 启动编译后服务
node dist/server/index.mjs

# 员工 ID: acea1aa2-395e-4cfa-bb34-cf3cf91d4fc6（员工小A）

# ✅ 文件列表 API
curl http://localhost:3000/api/employees/acea1aa2.../workspace
# → {"ok":true,"data":{"files":[{"filename":"AGENTS.md","exists":true,"sizeBytes":6535,"writable":true}, ...]}}

# ✅ 单文件读取
curl http://localhost:3000/api/employees/acea1aa2.../workspace/SOUL.md
# → {"ok":true,"data":{"filename":"SOUL.md","content":"# SOUL.md - 助手小A\n\n风格可爱\n"}}

# ✅ 文件写入（可写文件）
curl -X PUT .../workspace/MEMORY.md -d '{"content":"测试"}' → {"ok":true,...}

# ✅ 只读文件写入被拒绝
curl -X PUT .../workspace/SOUL.md -d '{"content":"hacked"}' 
# → 400 "File not writable: SOUL.md"
```

---

## 发布 / 部署方式

- 本次改动仅影响 `packages/nextclaw-digital-employee`（Nuxt 全栈应用）
- 重新构建并重启服务即可：`pnpm build && node dist/server/index.mjs`
- 数据库无变更，无需 migration
- 无任何依赖升级

---

## 用户 / 产品视角验收

1. 进入员工详情页（`/employees/:id`），顶部 Tab 栏末尾出现"**工作空间**"Tab
2. 点击"工作空间"Tab，左侧显示 8 个 MD 文件列表，每项显示文件名 + 大小，只读文件有🔒图标
3. 点击文件后，右侧面板以 Markdown 富文本形式**预览**文件内容
4. 对可写文件（如 AGENTS.md），点击"**编辑**"切换到等宽字体文本编辑区，修改后点击"**保存**"
5. 保存成功：按钮短暂显示"已保存"，侧边栏文件大小刷新
6. 对只读文件（SOUL.md、IDENTITY.md），"编辑"按钮为禁用灰色，无法切换编辑模式
7. 任意文件选中后，顶栏"**下载**"按钮可将当前内容下载为同名 `.md` 文件
8. 整体样式（颜色、圆角、间距、字体）与工作台其他页面（聊天、定时任务等）保持一致
