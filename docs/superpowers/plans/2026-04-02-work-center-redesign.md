# 工作中心重写 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the Work Center dashboard (`dashboard.vue`) into a "Command Center" style page with 4 stat cards, employee workbench, output feed, skill capability map, and integration strip.

**Architecture:** Replace `dashboard.vue` entirely. Create 5 focused components in `app/components/dashboard/`. Add 1 new server API endpoint (`/api/dashboard/stats`) for aggregated stats. All data comes from existing repos + new query methods.

**Tech Stack:** Vue 3 + Nuxt 3, TypeScript, Tailwind-style utility classes (project uses custom CSS + semantic tokens), lucide-vue-next icons, existing platform-context repos.

**Spec:** [设计文档](../specs/2026-04-02-work-center-redesign-design.md)

---

## File Structure

### New Files
- `server/api/dashboard/stats.get.ts` — aggregated dashboard stats API
- `app/components/dashboard/DashboardStatsCard.vue` — single stat card
- `app/components/dashboard/DashboardEmployeeCard.vue` — employee workbench card
- `app/components/dashboard/DashboardOutputFeed.vue` — latest output timeline
- `app/components/dashboard/DashboardSkillsMap.vue` — skill capability map (6 categories)
- `app/components/dashboard/DashboardIntegrationStrip.vue` — connected systems strip

### Modified Files
- `app/pages/dashboard.vue` — full rewrite
- `server/repositories/run-record-repository.ts` — add `countTodayByEmployee()` method

All paths below are relative to `packages/nextclaw-digital-employee/`.

---

## Task 1: Add Run Stats Query to Repository

**Files:**
- Modify: `server/repositories/run-record-repository.ts`

- [ ] **Step 1: Add `getTodayStats()` method to `RunRecordRepository`**

Add a method that returns today's run count and success count, grouped by employee:

```typescript
async getTodayStats(): Promise<{ employeeId: string; total: number; succeeded: number }[]> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const rows = await this.db("run_records")
    .select("employee_id")
    .count("* as total")
    .count(this.db.raw("CASE WHEN status = 'completed' THEN 1 END as succeeded"))
    .where("started_at", ">=", todayStart.toISOString())
    .groupBy("employee_id");
  return rows.map((row: any) => ({
    employeeId: row.employee_id,
    total: Number(row.total),
    succeeded: Number(row.succeeded),
  }));
}
```

Also add a `getTotalCountByEmployee()` method:

```typescript
async getTotalCountByEmployee(): Promise<{ employeeId: string; total: number }[]> {
  const rows = await this.db("run_records")
    .select("employee_id")
    .count("* as total")
    .groupBy("employee_id");
  return rows.map((row: any) => ({
    employeeId: row.employee_id,
    total: Number(row.total),
  }));
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd packages/nextclaw-digital-employee && npx nuxi typecheck`
Expected: No new type errors

---

## Task 2: Create Dashboard Stats API

**Files:**
- Create: `server/api/dashboard/stats.get.ts`

- [ ] **Step 1: Create the stats endpoint**

```typescript
import { getPlatformContext } from "../../runtime/platform-context";
import { SKILL_CATEGORIES } from "../../../shared/skill-categories";

export default defineEventHandler(async () => {
  const ctx = await getPlatformContext();
  const [todayStats, totalCounts, skills] = await Promise.all([
    ctx.runRepo.getTodayStats(),
    ctx.runRepo.getTotalCountByEmployee(),
    ctx.skillInstallationRepo.list(),
  ]);

  const todayRunCount = todayStats.reduce((sum, s) => sum + s.total, 0);
  const todaySuccessCount = todayStats.reduce((sum, s) => sum + s.succeeded, 0);
  const todaySuccessRate = todayRunCount > 0 ? Math.round((todaySuccessCount / todayRunCount) * 100) : 100;

  const totalCountMap = new Map(totalCounts.map((c) => [c.employeeId, c.total]));
  const todayStatsMap = new Map(todayStats.map((s) => [s.employeeId, s]));

  const employeeStats = [...new Set([...totalCountMap.keys(), ...todayStatsMap.keys()])].map((employeeId) => ({
    employeeId,
    todayRunCount: todayStatsMap.get(employeeId)?.total ?? 0,
    totalRunCount: totalCountMap.get(employeeId) ?? 0,
    todaySuccessRate: (() => {
      const stat = todayStatsMap.get(employeeId);
      if (!stat || stat.total === 0) return 100;
      return Math.round((stat.succeeded / stat.total) * 100);
    })(),
  }));

  const categoryCounts = new Map<string, number>();
  for (const skill of skills) {
    const cat = skill.category || "general";
    categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
  }

  const skillCategoryCounts = SKILL_CATEGORIES.map((cat) => ({
    category: cat.slug,
    categoryLabel: cat.label,
    count: categoryCounts.get(cat.slug) ?? 0,
  }));

  return {
    ok: true,
    data: {
      todayRunCount,
      todaySuccessRate,
      totalSkillCount: skills.length,
      employeeStats,
      skillCategoryCounts,
    },
  };
});
```

- [ ] **Step 2: Create shared skill categories constant**

Create `shared/skill-categories.ts` (extract from skills/index.vue):

```typescript
export const SKILL_CATEGORIES = [
  { slug: "project-management", label: "项目管理类", emoji: "📋" },
  { slug: "business-management", label: "经营管理类", emoji: "📈" },
  { slug: "product-rd", label: "产品研发类", emoji: "🔬" },
  { slug: "marketing", label: "市场营销类", emoji: "📣" },
  { slug: "solutions", label: "解决方案类", emoji: "💡" },
  { slug: "general", label: "通用能力类", emoji: "⚡" },
] as const;
```

- [ ] **Step 3: Verify API works**

Run: `curl http://localhost:3100/api/dashboard/stats | jq .`
Expected: JSON with todayRunCount, todaySuccessRate, totalSkillCount, employeeStats[], skillCategoryCounts[]

---

## Task 3: Create Dashboard Components

**Files:**
- Create: `app/components/dashboard/DashboardStatsCard.vue`
- Create: `app/components/dashboard/DashboardEmployeeCard.vue`
- Create: `app/components/dashboard/DashboardOutputFeed.vue`
- Create: `app/components/dashboard/DashboardSkillsMap.vue`
- Create: `app/components/dashboard/DashboardIntegrationStrip.vue`

### Step 3a: DashboardStatsCard

- [ ] **Create `app/components/dashboard/DashboardStatsCard.vue`**

Props: `{ icon: string; label: string; value: number | string; unit?: string; barPercent: number; barColor: string }`

A single stat card with: icon slot → label → big number + unit → progress bar.
Follow the mockup styling (rounded-xl, border, hover shadow/translate).

### Step 3b: DashboardEmployeeCard

- [ ] **Create `app/components/dashboard/DashboardEmployeeCard.vue`**

Props: `{ employee: EmployeeResponse; stats: { todayRunCount: number; totalRunCount: number; todaySuccessRate: number }; deptName: string | null }`
Emits: `click`

Shows: gradient avatar → name + dept → status indicator (running/idle) → skill tags → 4-cell meta grid.
Click emits event for navigation.

### Step 3c: DashboardOutputFeed

- [ ] **Create `app/components/dashboard/DashboardOutputFeed.vue`**

Props: `{ runs: RunItem[] }`
Emits: `select-run(runId: string)`

Timeline-style feed. Each item: status dot (✓/↻/!) → employee name · task summary → time.
Use the existing `RunItem` type from dashboard.vue (or import from shared).

### Step 3d: DashboardSkillsMap

- [ ] **Create `app/components/dashboard/DashboardSkillsMap.vue`**

Props: `{ categories: Array<{ category: string; categoryLabel: string; count: number }>; totalSkills: number }`
Emits: `select-category(slug: string)`

6-column grid. Each column: emoji icon → category name → count number.
Header shows total.

### Step 3e: DashboardIntegrationStrip

- [ ] **Create `app/components/dashboard/DashboardIntegrationStrip.vue`**

Props: `{ integrations: Array<{ id: string; title: string; tone: string }> }`

Compact row of chips with status dots. Links to `/integrations`.

---

## Task 4: Rewrite dashboard.vue

**Files:**
- Modify: `app/pages/dashboard.vue` (full rewrite)

- [ ] **Step 1: Rewrite dashboard.vue**

Replace entire content. The new page:

1. Fetches from `/api/dashboard/stats`, `/api/employees`, `/api/runs?pageSize=10`, `/api/integrations`
2. Layout:
   - Header: badge + title + subtitle
   - Stats row: 4 x DashboardStatsCard
   - Main grid: left (employee cards) + right (DashboardOutputFeed)
   - DashboardSkillsMap
   - DashboardIntegrationStrip
3. Auto-refresh every 30s
4. Navigation: employee cards → `/employees/{id}`, feed items → `/runs?runId={id}`, skill categories → `/skills/{slug}`, create → `/employees?showCreator=true`

- [ ] **Step 2: Add page-level CSS**

Create `app/pages/dashboard-page.css` with styles for the new layout grid, or use inline scoped styles.
Follow existing project pattern (employees-page.css pattern).

- [ ] **Step 3: Build & verify**

Run: `cd packages/nextclaw-digital-employee && npx nuxi build`
Expected: Build succeeds

---

## Task 5: Smoke Test

- [ ] **Step 1: Start dev server and verify page renders**

Run: `cd packages/nextclaw-digital-employee && npx nuxi dev`
Navigate to the dashboard page in browser.
Verify:
- 4 stat cards render with correct numbers
- Employee card(s) show with correct status
- Output feed shows recent runs
- Skills map shows 6 categories with counts
- Integration strip shows connected systems
- All links navigate correctly

- [ ] **Step 2: Verify 30s auto-refresh**

Wait 30s on the dashboard, verify data refreshes without page reload.

---

## Task 6: Cleanup

- [ ] **Step 1: Remove unused code from old dashboard**

If any old dashboard-specific code is no longer referenced (old CSS, old types), remove it.

- [ ] **Step 2: Verify no lint/type errors**

Run: `cd packages/nextclaw-digital-employee && npx nuxi typecheck`
Expected: No errors
