# v0.13.68 employee-chat-ui-layout-fix

## 迭代完成说明（改了什么）

### 1. 聊天 Tab 布局精简
- 移除 `[id]/chat.vue` 右侧"最近运行"（Recent Runs）面板，聊天 Tab 右侧 aside 仅保留"结果（本次结果卡片）"与"快捷操作"两个模块。
- 同步移除了对 `runs` 数据的绑定（`const { data: runs, refresh }`），避免冗余请求。

### 2. 运行记录 Tab 布局精简
- 在父布局文件 `[id].vue` 中新增 `isOverviewTab` computed，仅在概览（`/employees/:id`）路由下渲染左侧边栏（状态检查、已绑定技能、最近运行）。
- 聊天 Tab（`/chat`）和运行记录 Tab（`/runs`）进入时，左侧边栏自动隐藏，页面变为全宽，`NuxtPage` 内容独占整屏宽度。

### 3. 修复用户消息即时显示
- 重构 `sendMessage` 执行顺序：**发起 API 请求之前**先将用户消息乐观（optimistic）追加到 `messages.value`，同时清空输入框并重置 textarea 高度。
- API 成功后以服务端返回的完整消息列表覆盖本地状态（兜底一致性）。
- API 失败时自动回滚：过滤掉刚追加的乐观消息，防止残留幽灵消息。

### 改动文件
| 文件 | 改动说明 |
|---|---|
| `packages/nextclaw-digital-employee/app/pages/employees/[id].vue` | 新增 `isOverviewTab`；外层 grid 条件化；侧边栏加 `v-if="isOverviewTab"` |
| `packages/nextclaw-digital-employee/app/pages/employees/[id]/chat.vue` | 移除最近运行面板及 runs 请求；修复 sendMessage 乐观更新顺序 |

---

## 测试/验证/验收方式

因改动仅涉及 UI 布局与前端交互逻辑，不触达构建/类型/运行后端链路，`build`/`lint`/`tsc` 不适用（判定依据：纯 Vue 模板与脚本层调整，无新增导入或类型变更）。

**冒烟验证步骤：**
1. 打开任意员工详情页 `/employees/:id`，确认左侧边栏正常显示（状态检查、技能、最近运行）。
2. 切换到「聊天」Tab，确认：
   - 左侧边栏消失，聊天区域全宽展示；
   - 右侧 aside 仅包含"结果"与"快捷操作"，无"最近运行"；
   - 在输入框输入内容后按 Enter，用户消息**立即**出现在聊天气泡中（不需等待 AI 回复）。
3. 切换到「运行记录」Tab，确认左侧边栏消失，历史记录模块全宽展示。
4. 返回「概览」Tab，确认左侧边栏重新出现。

---

## 发布/部署方式

纯前端 UI 改动，无后端/数据库变更。

- **本地开发**：`pnpm dev`（或 `pnpm digital:dev`）热重载即生效，无需额外操作。
- **生产部署**：执行标准前端发布流程（`/release-frontend`）重新构建并部署 `apps/platform-console` 或对应平台前端即可。
- Migration：不适用（无数据库变更）。

---

## 用户/产品视角的验收步骤

1. **概览 Tab**：进入员工详情，「概览」页面布局不变，左侧边栏正常。
2. **聊天 Tab 布局**：切换「聊天」后，不再显示左侧边栏，页面空间更宽敞、聚焦。
3. **聊天 Tab 消息即时感**：输入任意问题按 Enter 后，用户消息**即刻**出现在对话流中，体验流畅无延迟感。
4. **聊天 Tab 右侧面板**：右侧 aside 仅有「结果」和「快捷操作」，无多余的"最近运行"噪声。
5. **运行记录 Tab**：切换「运行记录」后，不再显示左侧边栏，「历史记录」模块独占全宽，列表清晰。
