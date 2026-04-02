# 员工概览页重构设计文档

## 目标

将 `/employees/[id]` 概览 Tab 从"简易健康检查 + 3 条运行记录 + 技能 / 角色定义"升级为信息层次清晰、内容丰富、视觉风格与新 Dashboard 一致的管理页面。

主要使用场景：**日常管理** — 管理员快速查看某个数字员工的运行态势、绑定技能、定时任务状态，然后进入具体 Tab 操作。

## 设计原则

- 与新 Dashboard（工作中心）视觉语言一致：同款卡片圆角、字体层级、进度条、颜色体系
- 复用已有组件/API，最小化新增代码
- 删除"角色定义"区域，减少信息冗余

## 页面结构

### 保留不变的部分

1. **Breadcrumb**：`组织架构 > 部门名 > 员工名`
2. **Hero 区**：员工名 + 描述 + 4 个快速指标（编码、技能数、任务调度数、自动化状态）
3. **Tab 导航**：概览 | 聊天 | 定时任务 | 运行记录 | 配置

### 概览 Tab 新布局（4 层）

#### Layer 1：统计卡片行（3 张卡片）

| 卡片 | 图标 | 数据来源 |
|------|------|----------|
| 今日运行 | ✅ | `/api/dashboard/stats` → `employeeStats[].todayRunCount` |
| 累计运行 | 📊 | `/api/dashboard/stats` → `employeeStats[].totalRunCount` |
| 成功率 | 🎯 | `/api/dashboard/stats` → `employeeStats[].todaySuccessRate` |

复用 `DashboardStatsCard` 组件样式（可直接引用或创建轻量 `EmployeeStatsCard`）。

#### Layer 2：双栏主区域（`320px + 1fr`）

**左栏：员工信息卡**

包含以下模块（从上到下）：

1. **头部**：卡片标题"员工信息" + 状态标签（运行中/空闲）
2. **个人信息**：渐变头像 + 员工名 + 部门 · 调度方式
3. **状态检查**（紧凑版）：
   - ✓ 系统提示词已配置 / ⚠ 待补充
   - ✓ 技能就绪（N 个） / ⚠ 待绑定
   - ✓ 定时任务 · N 个启用 · 正常运行
4. **已绑定技能**：skill tag 列表，每个 tag 显示中文名 + 使用次数
5. **下次运行**：显示最近一个定时任务的下次运行时间

**右栏：最近运行活动**

- 卡片标题"最近运行活动" + "实时更新"标签
- 5 条运行记录，每条显示：状态圆点 + 技能名 + 摘要（2 行截断）+ 相对时间
- 分页控件（`‹ 1/N ›`）
- 复用 `DashboardOutputFeed` 组件或同等样式

#### Layer 3：定时任务概览条

- 卡片标题"定时任务概览" + "N 个任务"标签
- 水平网格（`auto-fill, minmax(240px, 1fr)`）
- 每张小卡片：图标 + 任务名 + 运行中/已停用标签 + 调度说明 + 下次运行时间
- 点击跳转到"定时任务"Tab

#### ~~Layer 4：角色定义~~（已删除）

## 数据源

| 数据 | API | 备注 |
|------|-----|------|
| 员工基础信息 + 技能 + 健康 + 最近运行 | `GET /api/employees/[id]` | 现有 |
| 运行统计（今日/累计/成功率） | `GET /api/dashboard/stats` | 现有，按 employeeId 筛选 |
| 技能中文名 | `GET /api/skills` | 现有 |
| 部门名称 | `GET /api/departments` | 现有 |
| 定时任务列表 | `GET /api/employees/[id]/jobs` | 现有 |
| 技能使用次数 | 需要新增：按 employeeId + skillName 统计 runRecord | **新增** |

### 新增接口/方法

**`RunRecordRepository.getSkillUsageCounts(employeeId: string)`**
- 返回 `Array<{ skillName: string; count: number }>`
- SQL: `SELECT skill_name, COUNT(*) as count FROM run_records WHERE employee_id = ? GROUP BY skill_name`

在 `GET /api/employees/[id]` 响应中新增 `skillUsageCounts` 字段（或通过已有 `recentRuns` 在前端计算近似值）。

> 优先方案：直接在 `/api/employees/[id]` handler 中查询并返回，避免额外 API 调用。

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `server/repositories/run-record-repository.ts` | 修改 | 新增 `getSkillUsageCountsByEmployee()` |
| `server/api/employees/[id].get.ts` | 修改 | 返回 `skillUsageCounts` |
| `app/composables/useEmployeeDetail.ts` | 修改 | 类型增加 `skillUsageCounts` |
| `app/pages/employees/[id].vue` | 修改 | 概览 Tab 区域完全重写 |
| `app/components/employee-overview/StatsRow.vue` | 新增 | 3 张统计卡片 |
| `app/components/employee-overview/ProfileCard.vue` | 新增 | 左栏员工信息卡 |
| `app/components/employee-overview/RecentActivity.vue` | 新增 | 右栏运行活动 |
| `app/components/employee-overview/JobsStrip.vue` | 新增 | 定时任务概览条 |

## 视觉规范

- 卡片圆角：`rounded-2xl`（16px）
- 内边距：`px-5 py-[18px]`（统计卡片），`p-[18px]`（section body）
- 字体层级：标题 14px bold → 标签 11px uppercase tracking → 数值 32px extrabold
- 颜色：primary `#6366f1`、success `#10b981`、blue `#3b82f6`、warning `#f59e0b`
- 进度条高度：3px
- 渐变头像与 Dashboard EmployeeCard 一致
- hover 效果：`shadow-[0_6px_20px_rgba(0,0,0,0.05)]` + `translateY(-1px)`

## 不做的事情

- 不修改其他 Tab（聊天/定时任务/运行记录/配置）
- 不新增独立 API 路由（复用现有 API）
- 不做暗色模式适配
- 不做角色定义/systemPrompt 展示
- 不做图表/折线图（保持简洁）

## Mockup

参考 `.superpowers/brainstorm/employee-overview-mockup.html`（去除 Layer 4 角色定义区域后即为最终设计）。
