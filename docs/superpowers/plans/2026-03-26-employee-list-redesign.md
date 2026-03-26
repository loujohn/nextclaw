# 员工管理界面重设计 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将员工列表从大卡片网格改为温暖卡片列表风格，让数字员工更像真实团队成员。

**Architecture:** 单文件重构，在 `index.vue` 中更新类型定义、添加辅助函数、重构卡片模板、更新样式。

**Tech Stack:** Vue 3 + TypeScript + Nuxt 3 + Tailwind CSS (内联样式)

**Spec:** `docs/superpowers/specs/2026-03-26-employee-list-redesign.md`

---

## 文件结构

| 文件 | 操作 | 说明 |
|------|------|------|
| `app/pages/employees/index.vue` | 修改 | 主要改动文件，重构员工卡片 |

---

## Task 1: 更新类型定义

**Files:**
- Modify: `packages/nextclaw-digital-employee/app/pages/employees/index.vue:17`

- [ ] **Step 1: 更新 EmployeeResponse 类型中的 latestRun 字段**

在 `<script setup>` 部分，找到 `EmployeeResponse` 类型定义（约第6-25行），修改 `latestRun` 字段：

```typescript
type EmployeeResponse = {
  id: string;
  name: string;
  code: string;
  description: string;
  systemPrompt: string;
  model: string;
  status: string;
  departmentId: string | null;
  skills: Array<{ skillName: string }>;
  schedule?: { scheduleKind: string; nextRunAt?: string | null } | null;
  latestRun?: { status: string; summary: string; finishedAt: string | null } | null;
  jobsCount: number;
  enabledJobsCount: number;
  health: {
    hasSkills: boolean;
    hasSchedule: boolean;
    lastStatus: string;
  };
};
```

- [ ] **Step 2: 验证类型无误**

运行: `cd packages/nextclaw-digital-employee && npx vue-tsc --noEmit 2>&1 | head -20`

预期: 无新增类型错误（可能存在已有的无关错误）

- [ ] **Step 3: 提交**

```bash
git add packages/nextclaw-digital-employee/app/pages/employees/index.vue
git commit -m "refactor: 更新 EmployeeResponse 类型添加 finishedAt 字段

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 2: 添加部门颜色映射函数

**Files:**
- Modify: `packages/nextclaw-digital-employee/app/pages/employees/index.vue`

- [ ] **Step 1: 添加部门颜色映射函数**

在 `resolveHealth` 函数之后（约第587行后）添加：

```typescript
// 部门标签颜色映射
const DEPT_TAG_COLORS: Record<string, { bg: string; text: string }> = {
  "产品部": { bg: "#eef2ff", text: "#6366f1" },
  "运营部": { bg: "#fff7ed", text: "#ea580c" },
  "技术部": { bg: "#f0fdfa", text: "#0d9488" },
  "市场部": { bg: "#fdf2f8", text: "#db2777" },
};

const DEPT_TAG_COLOR_POOL = [
  { bg: "#eef2ff", text: "#6366f1" },
  { bg: "#fff7ed", text: "#ea580c" },
  { bg: "#f0fdfa", text: "#0d9488" },
  { bg: "#fdf2f8", text: "#db2777" },
  { bg: "#fef3c7", text: "#d97706" },
  { bg: "#ecfdf5", text: "#059669" },
];

function getDeptTagColor(deptName: string): { bg: string; text: string } {
  if (DEPT_TAG_COLORS[deptName]) return DEPT_TAG_COLORS[deptName];
  // 哈希取色
  let hash = 0;
  for (let i = 0; i < deptName.length; i++) {
    hash = (hash + deptName.charCodeAt(i)) % DEPT_TAG_COLOR_POOL.length;
  }
  return DEPT_TAG_COLOR_POOL[hash]!;
}
```

- [ ] **Step 2: 添加获取部门名称的辅助函数**

紧接上文添加：

```typescript
function getDeptName(deptId: string | null): string | null {
  if (!deptId) return null;
  return departments.value.find(d => d.id === deptId)?.name ?? null;
}
```

- [ ] **Step 3: 提交**

```bash
git add packages/nextclaw-digital-employee/app/pages/employees/index.vue
git commit -m "feat: 添加部门颜色映射和名称获取函数

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 3: 添加活跃状态计算函数

**Files:**
- Modify: `packages/nextclaw-digital-employee/app/pages/employees/index.vue`

- [ ] **Step 1: 添加活跃状态计算函数**

在 `getDeptName` 函数后添加：

```typescript
// 活跃状态类型
type ActivityStatus = {
  text: string;
  color: string; // CSS color value
  dotColor: string;
};

function getActivityStatus(emp: EmployeeResponse): ActivityStatus {
  const finishedAt = emp.latestRun?.finishedAt;
  if (!finishedAt) {
    return { text: "离线", color: "#94a3b8", dotColor: "#94a3b8" };
  }

  const finished = new Date(finishedAt);
  const now = new Date();
  const diffMs = now.getTime() - finished.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffMins <= 5) {
    return { text: "刚刚活跃", color: "#22c55e", dotColor: "#22c55e" };
  }
  if (diffMins < 60) {
    return { text: `${diffMins}分钟前`, color: "#eab308", dotColor: "#eab308" };
  }
  if (diffHours < 24 && finished.getDate() === now.getDate()) {
    const hours = finished.getHours().toString().padStart(2, "0");
    const mins = finished.getMinutes().toString().padStart(2, "0");
    return { text: `今天 ${hours}:${mins}`, color: "#94a3b8", dotColor: "#94a3b8" };
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (finished.getDate() === yesterday.getDate()) {
    return { text: "昨天", color: "#94a3b8", dotColor: "#94a3b8" };
  }
  return { text: "离线", color: "#94a3b8", dotColor: "#94a3b8" };
}
```

- [ ] **Step 2: 提交**

```bash
git add packages/nextclaw-digital-employee/app/pages/employees/index.vue
git commit -m "feat: 添加活跃状态计算函数 getActivityStatus

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 4: 添加描述文字和头像样式函数

**Files:**
- Modify: `packages/nextclaw-digital-employee/app/pages/employees/index.vue`

- [ ] **Step 1: 添加描述文字生成函数**

在 `getActivityStatus` 函数后添加：

```typescript
function getEmployeeDescription(emp: EmployeeResponse): string {
  if (emp.description?.trim()) return emp.description.trim();
  if (emp.enabledJobsCount > 0) return `负责 ${emp.enabledJobsCount} 个活跃任务`;
  return "等待分配工作";
}
```

- [ ] **Step 2: 添加头像渐变样式函数**

紧接上文添加：

```typescript
// 头像渐变色板
const AVATAR_GRADIENTS = [
  { from: "#6366f1", to: "#818cf8" }, // 紫
  { from: "#f97316", to: "#fb923c" }, // 橙
  { from: "#06b6d4", to: "#22d3ee" }, // 青
  { from: "#ec4899", to: "#f472b6" }, // 粉
  { from: "#10b981", to: "#34d399" }, // 绿
  { from: "#8b5cf6", to: "#a78bfa" }, // 浅紫
  { from: "#ef4444", to: "#f87171" }, // 红
  { from: "#0ea5e9", to: "#38bdf8" }, // 蓝
];

function getAvatarGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  const g = AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length]!;
  return `linear-gradient(135deg, ${g.from}, ${g.to})`;
}
```

- [ ] **Step 3: 提交**

```bash
git add packages/nextclaw-digital-employee/app/pages/employees/index.vue
git commit -m "feat: 添加描述文字和头像渐变样式函数

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 5: 重构员工卡片模板

**Files:**
- Modify: `packages/nextclaw-digital-employee/app/pages/employees/index.vue`

- [ ] **Step 1: 替换 employee-grid 中的卡片模板**

找到 `<div class="employee-grid">` 部分（约第1651行），将整个 `v-for` 循环内的卡片模板替换为：

```vue
<!-- Employee Grid -->
    <div class="employee-grid">
      <!-- 温暖卡片列表 -->
      <div
        v-for="emp in filteredEmployees"
        :key="emp.id"
        class="employee-list-card"
        @click="navigateTo(`/employees/${emp.id}`)"
      >
        <!-- 头像 -->
        <div
          class="employee-list-card__avatar"
          :style="{ background: getAvatarGradient(emp.name) }"
        >
          <span class="employee-list-card__avatar-text">{{ emp.name.charAt(0) }}</span>
          <span
            class="employee-list-card__avatar-dot"
            :style="{ background: getActivityStatus(emp).dotColor }"
          ></span>
        </div>

        <!-- 信息区域 -->
        <div class="employee-list-card__content">
          <div class="employee-list-card__header">
            <span class="employee-list-card__name">{{ emp.name }}</span>
            <span
              v-if="getDeptName(emp.departmentId)"
              class="employee-list-card__dept"
              :style="{
                background: getDeptTagColor(getDeptName(emp.departmentId)!).bg,
                color: getDeptTagColor(getDeptName(emp.departmentId)!).text
              }"
            >
              {{ getDeptName(emp.departmentId) }}
            </span>
          </div>

          <div class="employee-list-card__status" :style="{ color: getActivityStatus(emp).color }">
            <span
              class="employee-list-card__status-dot"
              :style="{ background: getActivityStatus(emp).dotColor }"
            ></span>
            {{ getActivityStatus(emp).text }}
          </div>

          <p class="employee-list-card__desc">{{ getEmployeeDescription(emp) }}</p>
        </div>

        <!-- 操作按钮 -->
        <div class="employee-list-card__actions">
          <button
            class="employee-list-card__action-btn"
            title="编辑"
            @click.stop="openEditor(emp)"
          >
            <Pencil class="h-4 w-4" :stroke-width="1.8" />
          </button>
          <button
            class="employee-list-card__action-btn employee-list-card__action-btn--danger"
            title="删除"
            @click.stop="openDeleteConfirm(emp)"
          >
            <Trash2 class="h-4 w-4" :stroke-width="1.8" />
          </button>
        </div>
      </div>
```

- [ ] **Step 2: 保留空状态模板**

确保 `v-if="filteredEmployees.length === 0"` 的空状态模板保持不变。

- [ ] **Step 3: 提交**

```bash
git add packages/nextclaw-digital-employee/app/pages/employees/index.vue
git commit -m "refactor: 重构员工卡片为温暖列表风格

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 6: 更新 CSS 样式

**Files:**
- Modify: `packages/nextclaw-digital-employee/app/pages/employees/index.vue`

- [ ] **Step 1: 找到并替换员工卡片相关样式**

找到 `/* ===== Employee Grid =====` 注释（约第2240行），将该部分替换为新的样式：

```css
/* ===== Employee Grid ===== */
.employee-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* ===== Employee List Card - 温暖卡片列表 ===== */
.employee-list-card {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 14px 16px;
  background: white;
  border-radius: 12px;
  border: 1px solid hsl(var(--border) / 0.5);
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 1px 2px hsl(var(--foreground) / 0.03);
}

.employee-list-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px hsl(var(--foreground) / 0.1);
  border-color: hsl(var(--primary) / 0.2);
}

/* 头像 */
.employee-list-card__avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  flex-shrink: 0;
}

.employee-list-card__avatar-text {
  font-size: 18px;
  font-weight: 700;
  color: white;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.employee-list-card__avatar-dot {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid white;
}

/* 内容区 */
.employee-list-card__content {
  flex: 1;
  min-width: 0;
}

.employee-list-card__header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.employee-list-card__name {
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}

.employee-list-card__dept {
  font-size: 10px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 10px;
}

.employee-list-card__status {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  margin-top: 4px;
}

.employee-list-card__status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.employee-list-card__desc {
  font-size: 13px;
  color: #64748b;
  margin: 6px 0 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 操作按钮 */
.employee-list-card__actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s ease;
  flex-shrink: 0;
}

.employee-list-card:hover .employee-list-card__actions {
  opacity: 1;
}

.employee-list-card__action-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  border: 1px solid hsl(var(--border) / 0.5);
  background: white;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  transition: all 0.15s ease;
}

.employee-list-card__action-btn:hover {
  background: hsl(var(--muted));
  color: hsl(var(--foreground));
}

.employee-list-card__action-btn--danger:hover {
  background: hsl(var(--destructive) / 0.1);
  color: hsl(var(--destructive));
  border-color: hsl(var(--destructive) / 0.3);
}
```

- [ ] **Step 2: 删除旧的员工卡片样式**

删除以下不再需要的样式类（如果存在）：
- `.employee-card` 相关的所有样式
- `.employee-card__scene`
- `.employee-card__portrait`
- `.employee-card__status-bar`
- 其他旧卡片样式

- [ ] **Step 3: 提交**

```bash
git add packages/nextclaw-digital-employee/app/pages/employees/index.vue
git commit -m "style: 更新员工卡片为温暖列表风格样式

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 7: 清理未使用的代码

**Files:**
- Modify: `packages/nextclaw-digital-employee/app/pages/employees/index.vue`

- [ ] **Step 1: 移除不再使用的函数和变量**

检查并移除以下不再使用的代码（如果存在且未被其他地方引用）：
- `generatePortraitSVG` 函数
- `getPortraitSVGDataURL` 函数
- `_portraitSVGCache` 缓存
- 相关的 `PortraitChar` 类型定义
- `SKIN_TONES`, `HAIR_TONES`, `SHIRT_TONES`, `BG_TONES`, `TIE_COLORS` 常量
- 旧的 `generateHalfBodySVG` 相关代码（如果不再使用）

保留：
- `getAvatarStyle` 函数（可能被其他地方使用）
- `getBannerStyle` 函数（可能被其他地方使用）
- `AVATAR_PALETTES` 常量

- [ ] **Step 2: 验证构建**

运行: `cd packages/nextclaw-digital-employee && npm run build`

预期: 构建成功，无错误

- [ ] **Step 3: 提交**

```bash
git add packages/nextclaw-digital-employee/app/pages/employees/index.vue
git commit -m "refactor: 清理未使用的证件照生成代码

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 8: 验证和测试

**Files:**
- Modify: `packages/nextclaw-digital-employee/app/pages/employees/index.vue`

- [ ] **Step 1: 启动开发服务器验证**

运行: `cd packages/nextclaw-digital-employee && npm run dev`

打开浏览器访问员工管理页面，检查：
1. 卡片布局是否为列表样式
2. 头像是否显示圆形渐变+首字
3. 状态点颜色是否正确（绿/黄/灰）
4. 部门标签颜色是否正确
5. 点击卡片是否跳转到详情页
6. 悬停时操作按钮是否显示

- [ ] **Step 2: 检查响应式**

调整浏览器窗口大小，确认列表在小屏幕上也能正常显示。

- [ ] **Step 3: 最终提交**

```bash
git add -A
git commit -m "feat: 员工管理界面重设计完成

- 改为温暖卡片列表风格
- 圆头像+首字+状态指示
- 彩色部门标签
- 状态点+活跃时间显示
- 整卡点击跳转详情页

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## 完成检查清单

- [ ] 类型定义已更新，包含 `finishedAt` 字段
- [ ] 部门颜色映射函数正常工作
- [ ] 活跃状态计算函数正确显示时间
- [ ] 描述文字逻辑正确
- [ ] 头像渐变样式正确显示
- [ ] 卡片模板已重构
- [ ] CSS 样式已更新
- [ ] 未使用的代码已清理
- [ ] 构建成功
- [ ] 页面功能正常