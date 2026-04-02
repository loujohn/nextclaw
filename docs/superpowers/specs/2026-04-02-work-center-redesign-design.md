# 工作中心重写设计文档

> **日期**: 2026-04-02
> **状态**: 已批准
> **目标**: 重写工作中心（dashboard.vue），从后台管理表格风格升级为指挥中心风格的看板，兼顾领导演示和日常使用

---

## 一、背景与目标

### 现状问题
- 当前工作中心（`dashboard.vue`）以运行记录表格为主体，信息密度高但视觉冲击力弱
- 不适合向领导演示——缺少"一眼看懂"的核心指标和团队概览
- 运行记录表格功能与"运行中心"（`/runs`）高度重复

### 设计目标
1. **演示友好**：大字体、高对比度、核心数据一眼可见
2. **日常实用**：保留全局导航，提供实时数据和快速跳转
3. **体现核心能力**：展示数字员工团队、执行成果、技能版图、系统集成四大维度

---

## 二、页面结构（4 层）

### 第 1 层：Hero 标题区
- "工作中心" 标签（badge）
- "平台运行全景" 标题
- 一行副标题说明

### 第 2 层：4 张核心指标卡片（横向等宽网格）
| 卡片 | 数据来源 | 说明 |
|------|----------|------|
| 数字员工数 | `/api/employees` count | 当前在岗数字员工总数 |
| 今日任务数 | 新 API：今日运行总次数 | 今日已执行的任务次数 |
| 执行成功率 | 新 API：今日成功/总数 | 百分比 + 进度条 |
| 平台技能数 | `/api/skills` total count | 全量技能总数（不区分启用状态） |

每张卡片结构：图标 → 标签 → 大数字 + 单位 → 底部进度条

### 第 3 层：双栏主体（左 320px + 右自适应）

**左栏：数字员工列表**
- 每个员工一张卡片，包含：
  - 渐变色头像（首字）+ 名称 + 部门 + 调度频率
  - 实时状态指示灯（running/idle/error）
  - 已绑定技能标签
  - 4 格 Meta 区：今日运行数 / 累计运行数 / 自定义指标 / 成功率
- 列表末尾：虚线"创建新数字员工"入口
- 员工多时垂直滚动

**右栏：最新工作成果流**
- Timeline 风格，最新在上
- 每条记录：状态圆点（成功✓/运行中↻/异常!）+ 员工名·任务名 + 结果摘要（2行截断）+ 时间
- 点击跳转至运行详情（`/runs?runId=xxx`）
- 默认显示最近 10 条，可加载更多

### 第 4 层：技能能力版图 + 集成条

**技能能力版图**
- 独立卡片区域，标题"技能能力版图"
- 6 列等宽网格，每列一个技能分类：
  - 分类图标 + 分类名称 + 该分类下的技能数量（大字）
- 右上角显示总计 "共 N 个技能 · 6 大分类"
- 点击分类跳转至技能中心对应分类页

**集成条**
- 紧凑的一行，标签"已连接系统"
- 芯片式展示各集成状态（绿点+名称）
- 点击跳转集成中心

---

## 三、数据源

### 现有 API
- `GET /api/dashboard` — summary, alerts, quickActions, upcomingEmployees
- `GET /api/employees` — 员工列表（含 latestRun 状态）
- `GET /api/runs?page=1&pageSize=10` — 运行记录
- `GET /api/skills` — 技能列表（含 categoryLabel, enabled）
- `GET /api/integrations` — 集成状态

### 新增 API
需要新增一个聚合接口 `GET /api/dashboard/stats`，返回：

```typescript
{
  todayRunCount: number;        // 今日运行总次数
  todaySuccessRate: number;     // 今日成功率 (0-100)
  totalRunCount: number;        // 历史总运行次数
  employeeStats: Array<{
    employeeId: string;
    todayRunCount: number;      // 该员工今日运行次数
    totalRunCount: number;      // 该员工累计运行次数
    todaySuccessRate: number;   // 该员工今日成功率
  }>;
  skillCategoryCounts: Array<{
    category: string;           // 分类 slug
    categoryLabel: string;      // 分类显示名
    count: number;              // 该分类下技能数量
  }>;
}
```

---

## 四、交互设计

| 操作 | 行为 |
|------|------|
| 点击员工卡片 | 跳转 `/employees/{id}` 员工工作台 |
| 点击成果流条目 | 跳转 `/runs?runId={id}` 查看详情 |
| 点击"创建新员工" | 跳转员工中心并打开创建面板 |
| 点击技能分类 | 跳转 `/skills/{category}` |
| 点击集成芯片 | 跳转 `/integrations` |
| 页面自动刷新 | 每 30 秒自动刷新数据 |

---

## 五、视觉规范

- **背景**：亮色（与现有 UI 统一），`#f8f9fb`
- **保留全局导航**：顶部 + 侧边导航正常显示
- **卡片**：白底 + 1px border + 16px 圆角
- **动效**：
  - Hover 轻微抬起（translateY -1~2px）+ 阴影
  - 状态指示灯脉冲动画（running 状态）
  - 数字变化时的过渡动画（可选）
- **字体层级**：
  - 核心数字：32px+ bold
  - 标题：14-15px semibold
  - 正文：12-13px
  - 标签：10-11px uppercase tracking

---

## 六、文件结构

```
app/pages/dashboard.vue            ← 重写此文件
app/components/dashboard/          ← 新增目录
  DashboardStatsCard.vue           ← 统计卡片组件
  DashboardEmployeeCard.vue        ← 员工状态卡片
  DashboardOutputFeed.vue          ← 成果流组件
  DashboardSkillsMap.vue           ← 技能版图组件
  DashboardIntegrationStrip.vue    ← 集成条组件
server/api/dashboard/stats.get.ts  ← 新增聚合 API
```

---

## 七、不做什么

- **不做**深色/大屏专用模式（保持亮色统一风格）
- **不做**运行记录表格（已有 `/runs` 页面）
- **不做**组织架构树（已有员工中心 overview）
- **不做**预警/待处理区块（简化首屏，alerts 可通过顶部 toast 或员工卡片状态体现）

---

## 八、验收标准

1. 页面加载后 1 秒内呈现核心数据
2. 4 张指标卡片数据准确，来源于 API
3. 员工列表动态渲染，状态灯实时反映运行状态
4. 成果流展示最近 10 条运行结果摘要
5. 6 大技能分类数量正确，从 API 动态计算
6. 所有跳转链接正确
7. 30s 自动刷新生效
8. 在 1440px+ 宽屏和 1024px 屏幕上布局正常
