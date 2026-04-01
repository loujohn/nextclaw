# v0.14.13 — 组织架构 UI 重构

## 迭代完成说明

### 1. 菜单"员工中心"改为"组织架构"
- `app/layouts/default.vue`：`navItems` 中将 `label: "员工中心"` 改为 `label: "组织架构"`，对应侧边栏和移动端底部导航。

### 2. 员工工作台面包屑改为"组织架构 - 部门 - 员工名称"结构
- `app/pages/employees/[id].vue`：
  - 新增 `/api/departments` 请求，查找当前员工所属部门名称（`departmentId` → `deptName`）。
  - 面包屑 items 动态插入部门节点：`组织架构 → [部门（可选，若存在部门则带链接至该部门员工列表）] → 员工名称`。

### 3. "工作空间" Tab 改为"配置" Tab，合并钉钉配置与工作空间内容
- `app/pages/employees/[id].vue`：Tab 名改为 `配置`，路由指向 `/employees/:id/config`。
- 新增 `app/pages/employees/[id]/config.vue`：
  - 上部：钉钉入口配置模块（私聊绑定 + 已接管群展示），`v-if` 仅在钉钉已配置时显示。
  - 下部：工作空间文件浏览器（文件列表 + 预览/编辑/下载），样式与上部统一为卡片式布局。
  - 整体使用 `space-y-8` 分区，自适应宽度。

### 4. "概述"模块移除钉钉配置，优化样式
- `app/pages/employees/[id]/index.vue`：
  - 完全移除钉钉配置相关代码（`useFetch dingtalk`、`dingtalkForm`、`saveDingTalkBinding` 等）。
  - 移除已隐藏的自动化模块（`v-if="false"` 区块）。
  - 角色定义模块调整为卡片式头部 + 内容区分离，系统提示词展示区样式优化（浅色背景 + 标签）。

### 5. "已绑定技能"显示中文名称
- `app/pages/employees/[id].vue`：
  - 新增 `/api/skills` 请求，构建 `skillName → nameZh` 映射表（`skillNameZhMap`）。
  - 技能 badge 展示 `getSkillDisplayName(skill.skillName)`，优先显示中文名，无中文名则 fallback 到原始技能名。

### 6. 定时任务"立即执行"防抖
- `app/pages/employees/[id]/jobs.vue`：
  - 新增 `runDebounceTimers: Map<string, ReturnType<typeof setTimeout>>` 控制每个 job 的防抖锁。
  - `runJobNow(jobId)` 中：若该 job 已有 timer 或正在运行则直接返回；执行后 2 秒内的重复点击被忽略。
  - 按钮 `disabled` 条件更新为 `runningJobId === job.id || runDebounceTimers.has(job.id)`，并添加 `disabled:opacity-40 disabled:cursor-not-allowed` 样式。

## 测试/验证方式

> `build/lint/tsc` 不适用判定依据：涉及纯 Vue 模板 + script 改动，无 server API 路径变更，验证以页面级冒烟为准。可选执行 `pnpm tsc`。

冒烟观察点：
1. 侧边导航第一项显示"**组织架构**"而非"员工中心"。
2. 进入任意员工工作台，面包屑显示：`组织架构 > 部门名称（若有）> 员工名`，点击面包屑可正确返回。
3. Tab 列表中"工作空间"已变更为"**配置**"，点击后进入 `/employees/:id/config`，可看到钉钉配置区（若已配置）和工作空间文件列表。
4. "概览" Tab 内不再出现钉钉相关内容，仅显示职责与人设（描述 + 系统提示词）。
5. 侧边栏"已绑定技能"badge 显示技能中文名（如"每日工时助手"）而非英文 skillName。
6. 定时任务列表中连续快速点击"立即执行"（Play 图标），2 秒内第二次及以后点击无效（按钮灰显），不会重复触发 API。

## 发布/部署方式

纯前端改动，无 migration、无 API 变更：
```bash
pnpm --filter nextclaw-digital-employee build
# 或开发调试：
pnpm --filter nextclaw-digital-employee dev
```

## 用户/产品视角的验收步骤

1. 打开数字员工平台，确认左侧菜单第一项为"**组织架构**"。
2. 点击进入组织架构（员工列表），选择任意部门中的员工。
3. 进入员工工作台，顶部面包屑应显示`组织架构 / [部门名] / 员工名`。
4. 点击 Tab 中的"**配置**"，可看到钉钉配置（如已集成）和工作空间文件编辑器。
5. 点击"**概览**" Tab，页面仅展示职责定义，无钉钉相关信息。
6. 技能侧边栏中已绑定技能显示中文名称。
7. 进入定时任务 Tab，点击某任务的"立即执行"按钮两次，第二次应不触发，按钮在 2 秒内保持禁用状态。
