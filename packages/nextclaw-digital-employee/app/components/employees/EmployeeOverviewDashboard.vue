<script setup lang="ts">
import { ref, computed } from "vue";
import { Building2 } from "lucide-vue-next";

type OrgChartNode = {
  id: string;
  name: string;
  humanCount: number;
  digitalCount: number;
  children: OrgChartNode[];
};

const props = defineProps<{
  departments: Array<{ id: string; name: string; parentId: string | null }>;
  employeeCount: number;
  totalHumanCount: number;
  deptEmployeeCounts: Record<string, number>;
  humanCountsMap: Record<string, number>;
  selectedDeptId: string | null;
  viewMode: string;
  activeDigitalEmployees: number;
  digitalEmployeeCoverage: number;
}>();

const emit = defineEmits<{
  "select-dept": [id: string];
  create: [];
}>();

const DEPT_COLORS = [
  "linear-gradient(135deg, #6366f1, #8b5cf6)",
  "linear-gradient(135deg, #ec4899, #f472b6)",
  "linear-gradient(135deg, #f59e0b, #fbbf24)",
  "linear-gradient(135deg, #06b6d4, #22d3ee)",
  "linear-gradient(135deg, #8b5cf6, #a78bfa)",
  "linear-gradient(135deg, #ef4444, #f87171)",
];
const DEPT_ICONS = ["code", "box", "chart", "activity", "users", "dollar"];

const expandedDepts = ref<Set<string>>(new Set());

function toggleDeptExpand(deptId: string, event?: Event) {
  if (event) event.stopPropagation();
  if (expandedDepts.value.has(deptId)) {
    expandedDepts.value.delete(deptId);
  } else {
    expandedDepts.value.add(deptId);
  }
}
function isDeptExpanded(deptId: string): boolean {
  return expandedDepts.value.has(deptId);
}
function handleDeptCardClick(node: { id: string; children: { id: string }[] }) {
  if (node.children.length > 0 && isDeptExpanded(node.id)) {
    expandedDepts.value.delete(node.id);
  } else {
    emit("select-dept", node.id);
  }
}

const orgChartTree = computed<OrgChartNode[]>(() => {
  const depts = props.departments;
  const map = new Map<string, { dept: (typeof depts)[number]; children: string[] }>();
  for (const d of depts) map.set(d.id, { dept: d, children: [] });
  const roots: string[] = [];
  for (const d of depts) {
    if (d.parentId && map.has(d.parentId)) map.get(d.parentId)!.children.push(d.id);
    else roots.push(d.id);
  }
  function buildNode(id: string): OrgChartNode {
    const entry = map.get(id)!;
    const children = entry.children.map(buildNode);
    const ownHuman = props.humanCountsMap[id] ?? 0;
    const ownDigital = props.deptEmployeeCounts[id] ?? 0;
    const humanCount = ownHuman + children.reduce((s, c) => s + c.humanCount, 0);
    const digitalCount = ownDigital + children.reduce((s, c) => s + c.digitalCount, 0);
    return { id, name: entry.dept.name, humanCount, digitalCount, children };
  }
  return roots.map(buildNode);
});
</script>

<template>
  <!-- 标题区域 -->
  <div class="overview-header">
    <div class="overview-header__content">
      <h1 class="overview-header__title">组织架构总览</h1>
      <p class="overview-header__subtitle">
        {{ departments.length }} 个部门 · {{ totalHumanCount }} 名员工 · {{ employeeCount }} 名数字员工
      </p>
    </div>
    <button class="overview-create-btn" @click="emit('create')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
      创建员工
    </button>
  </div>

  <!-- 紧凑统计区 -->
  <div class="overview-stats">
    <div class="overview-stats__card overview-stats__card--digital">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="overview-stats__icon">
        <rect x="3" y="8" width="18" height="12" rx="2" />
        <circle cx="9" cy="14" r="1.5" />
        <circle cx="15" cy="14" r="1.5" />
        <path d="M12 4v4" />
        <circle cx="12" cy="3" r="1" />
      </svg>
      <div class="overview-stats__body">
        <div class="overview-stats__value">{{ employeeCount }} <span class="overview-stats__unit">数字员工</span></div>
        <div class="overview-stats__meta">
          <!-- <span>数字化率 {{ digitalEmployeeCoverage }}%</span> -->
          <span>今日活跃 {{ activeDigitalEmployees }}</span>
        </div>
      </div>
    </div>

    <div class="overview-stats__card overview-stats__card--human">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="overview-stats__icon">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
      <div class="overview-stats__body">
        <div class="overview-stats__value overview-stats__value--dark">{{ totalHumanCount }} <span class="overview-stats__unit">实体员工</span></div>
        <!-- <div class="overview-stats__meta overview-stats__meta--muted">分布在 {{ departments.length }} 个部门</div> -->
      </div>
    </div>

    <div class="overview-stats__card overview-stats__card--ratio">
      <div class="overview-stats__label">人机协作比例</div>
      <div class="overview-stats__ratio-bar">
        <div class="overview-stats__ratio-human" :style="{ width: totalHumanCount + employeeCount > 0 ? (totalHumanCount / (totalHumanCount + employeeCount) * 100) + '%' : '0%' }">
          实体 {{ totalHumanCount + employeeCount > 0 ? Math.round(totalHumanCount / (totalHumanCount + employeeCount) * 100) : 0 }}%
        </div>
        <div class="overview-stats__ratio-ai">AI</div>
      </div>
      <div class="overview-stats__ratio-labels">
        <span>{{ totalHumanCount }} 实体员工</span>
        <span>{{ employeeCount }} 数字员工</span>
      </div>
    </div>
  </div>

  <div class="overflow-x-auto pb-8">
    <div class="org-chart-root">
      <div class="org-root-wrapper">
        <div class="org-root-card">
          <div class="org-root-card__header">
            <div class="org-root-card__icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M3 21h18" /><path d="M5 21V7l8-4v18" /><path d="M19 21V11l-6-4" />
                <path d="M9 9h1" /><path d="M9 13h1" /><path d="M9 17h1" />
              </svg>
            </div>
            <div class="org-root-card__company">数字重庆政务科技有限公司</div>
          </div>
          <div class="org-root-card__footer">
            <div class="org-root-stat">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
              </svg>
              <div class="org-root-stat__text">
                <span class="org-root-stat__value">{{ totalHumanCount }}</span>
                <span class="org-root-stat__label">实体员工</span>
              </div>
            </div>
            <div class="org-root-stat org-root-stat--accent">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="8" width="18" height="12" rx="2" /><circle cx="9" cy="14" r="1" /><circle cx="15" cy="14" r="1" />
              </svg>
              <div class="org-root-stat__text">
                <span class="org-root-stat__value">{{ employeeCount }}</span>
                <span class="org-root-stat__label">数字员工</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="orgChartTree.length > 0" class="org-v-line" />
      <div v-if="orgChartTree.length > 0" class="org-h-rail"><div class="org-h-rail__line" /></div>

      <div v-if="orgChartTree.length > 0" class="org-dept-row">
        <div v-for="(node, nodeIdx) in orgChartTree" :key="node.id" class="org-dept-col">
          <div class="org-v-line org-v-line--short" />
          <div
            class="org-dept-card"
            :class="{ 'org-dept-card--selected': selectedDeptId === node.id && viewMode === 'list', 'org-dept-card--expanded': isDeptExpanded(node.id) }"
            :style="{ '--dept-color': DEPT_COLORS[nodeIdx % DEPT_COLORS.length] }"
            @click="handleDeptCardClick(node)"
          >
            <div class="org-dept-card__header">
              <div class="org-dept-card__icon">
                <svg v-if="DEPT_ICONS[nodeIdx % DEPT_ICONS.length] === 'code'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
                </svg>
                <svg v-else-if="DEPT_ICONS[nodeIdx % DEPT_ICONS.length] === 'box'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M12 8v8" /><path d="M8 12h8" />
                </svg>
                <svg v-else-if="DEPT_ICONS[nodeIdx % DEPT_ICONS.length] === 'chart'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M21.21 15.89A10 10 0 1 1 8 2.83" /><path d="M22 12A10 10 0 0 0 12 2v10z" />
                </svg>
                <svg v-else-if="DEPT_ICONS[nodeIdx % DEPT_ICONS.length] === 'activity'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
                <svg v-else-if="DEPT_ICONS[nodeIdx % DEPT_ICONS.length] === 'users'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </div>
              <div class="org-dept-card__title-row">
                <span class="org-dept-card__name">{{ node.name }}</span>
                <span v-if="node.children.length > 0" class="org-dept-card__subcount">{{ node.children.length }} 个子部门</span>
                <button v-if="node.children.length > 0" class="org-dept-card__expand-btn" @click="toggleDeptExpand(node.id, $event)">
                  <svg v-if="!isDeptExpanded(node.id)" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9" /></svg>
                  <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15" /></svg>
                </button>
              </div>
            </div>
            <div class="org-dept-card__stats">
              <div class="org-dept-stat org-dept-stat--human">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                <span class="org-dept-stat__value">{{ node.humanCount }}</span>
                <span class="org-dept-stat__label">实体员工</span>
              </div>
              <div class="org-dept-stat org-dept-stat--digital">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="8" width="18" height="12" rx="2" /><circle cx="9" cy="14" r="1" /><circle cx="15" cy="14" r="1" /></svg>
                <span class="org-dept-stat__value">{{ node.digitalCount }}</span>
                <span class="org-dept-stat__label">数字员工</span>
              </div>
            </div>
            <div class="org-dept-card__ratio">
              <div class="org-dept-card__ratio-bar">
                <div class="org-dept-card__ratio-human" :style="{ width: (node.humanCount + node.digitalCount) > 0 ? (node.humanCount / (node.humanCount + node.digitalCount) * 100) + '%' : '0%' }" />
                <div class="org-dept-card__ratio-digital" :style="{ width: (node.humanCount + node.digitalCount) > 0 ? (node.digitalCount / (node.humanCount + node.digitalCount) * 100) + '%' : '0%' }" />
              </div>
              <div class="org-dept-card__ratio-labels">
                <span>{{ (node.humanCount + node.digitalCount) > 0 ? Math.round(node.humanCount / (node.humanCount + node.digitalCount) * 100) : 0 }}% 实体员工</span>
                <span>{{ (node.humanCount + node.digitalCount) > 0 ? Math.round(node.digitalCount / (node.humanCount + node.digitalCount) * 100) : 0 }}% 数字员工</span>
              </div>
            </div>
          </div>

          <Transition name="org-expand">
            <template v-if="node.children.length > 0 && isDeptExpanded(node.id)">
              <div class="org-sub-depts">
                <div class="org-v-line" />
                <div class="org-h-rail"><div class="org-h-rail__line" /></div>
                <div class="org-dept-row">
                  <div v-for="child in node.children" :key="child.id" class="org-dept-col">
                    <div class="org-v-line org-v-line--short" />
                    <div
                      class="org-dept-card org-dept-card--sub"
                      :class="{ 'org-dept-card--selected': selectedDeptId === child.id && viewMode === 'list' }"
                      :style="{ '--dept-color': DEPT_COLORS[Math.abs(child.id.charCodeAt(0)) % DEPT_COLORS.length] }"
                      @click="emit('select-dept', child.id)"
                    >
                      <div class="org-dept-card__header">
                        <div class="org-dept-card__title-row">
                          <span class="org-dept-card__name">{{ child.name }}</span>
                        </div>
                      </div>
                      <div class="org-dept-card__stats">
                        <div class="org-dept-stat org-dept-stat--human">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                          <span class="org-dept-stat__value">{{ child.humanCount }}</span>
                          <span class="org-dept-stat__label">实体员工</span>
                        </div>
                        <div class="org-dept-stat org-dept-stat--digital">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="8" width="18" height="12" rx="2" /><circle cx="9" cy="14" r="1" /><circle cx="15" cy="14" r="1" /></svg>
                          <span class="org-dept-stat__value">{{ child.digitalCount }}</span>
                          <span class="org-dept-stat__label">数字</span>
                        </div>
                      </div>
                      <div class="org-dept-card__ratio">
                        <div class="org-dept-card__ratio-bar">
                          <div class="org-dept-card__ratio-human" :style="{ width: (child.humanCount + child.digitalCount) > 0 ? (child.humanCount / (child.humanCount + child.digitalCount) * 100) + '%' : '0%' }" />
                          <div class="org-dept-card__ratio-digital" :style="{ width: (child.humanCount + child.digitalCount) > 0 ? (child.digitalCount / (child.humanCount + child.digitalCount) * 100) + '%' : '0%' }" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </Transition>
        </div>
      </div>

      <div v-if="orgChartTree.length === 0" class="flex flex-col items-center py-16 text-muted-foreground">
        <Building2 class="h-10 w-10 opacity-20 mb-3" :stroke-width="1.5" />
        <p class="text-sm">暂无组织数据，请在左侧点击"同步"从钉钉导入</p>
      </div>
    </div>
  </div>
</template>
