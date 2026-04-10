<script setup lang="ts">
import { Search, Sparkles, Plus } from "lucide-vue-next";

const employeesStore = useEmployeesStore();
const skillsStore = useSkillsStore();
const deptsStore = useDepartmentsStore();
const humanEmpStore = useHumanEmployeesStore();

const employeePayload = computed(() => employeesStore.data);
const refresh = () => employeesStore.refresh();
const skillPayload = computed(() => skillsStore.data);
const departmentPayload = computed(() => deptsStore.data);
const humanEmployeePayload = computed(() => humanEmpStore.data);
const refreshHumanEmployees = () => humanEmpStore.refresh();
const refreshDepts = () => deptsStore.refresh();

const pageReady = computed(() => !!employeePayload.value && !!departmentPayload.value);

const employees = computed(() => employeesStore.list);
const {
  departments, deptEmployeeCounts, humanMembersMap, humanCountsMap,
  totalHumanCount, digitalMembersMap, deptTreeOptions,
} = useDepartmentTree(departmentPayload, humanEmployeePayload, employees);
const route = useRoute();

function getSingleQueryValue(value: string | (string | null)[] | null | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

function resolveInitialViewMode(): 'overview' | 'list' {
  return getSingleQueryValue(route.query.view) === 'list' ? 'list' : 'overview';
}

function resolveInitialDeptId(): string | null {
  const deptId = getSingleQueryValue(route.query.deptId).trim();
  return deptId || null;
}

function resolveInitialSearchQuery(): string {
  return getSingleQueryValue(route.query.q);
}

const selectedDeptId = ref<string | null>(resolveInitialDeptId());
const viewMode = ref<'overview' | 'list'>(resolveInitialViewMode());
const query = ref(resolveInitialSearchQuery());

function buildEmployeeListRouteQuery(options?: {
  view?: 'overview' | 'list';
  deptId?: string | null;
  q?: string;
}): Record<string, string> {
  const view = options?.view ?? viewMode.value;
  const deptId = options?.deptId ?? selectedDeptId.value;
  const keyword = (options?.q ?? query.value).trim();
  if (view !== 'list') {
    return {};
  }
  return {
    view: 'list',
    ...(deptId ? { deptId } : {}),
    ...(keyword ? { q: keyword } : {})
  };
}

function hasSameEmployeeListQuery(nextQuery: Record<string, string>): boolean {
  const currentQuery = buildEmployeeListRouteQuery({
    view: resolveInitialViewMode(),
    deptId: resolveInitialDeptId(),
    q: resolveInitialSearchQuery()
  });
  const currentKeys = Object.keys(currentQuery);
  const nextKeys = Object.keys(nextQuery);
  if (currentKeys.length !== nextKeys.length) {
    return false;
  }
  return nextKeys.every((key) => currentQuery[key] === nextQuery[key]);
}

async function replaceEmployeeListRoute(nextQuery: Record<string, string>) {
  if (hasSameEmployeeListQuery(nextQuery)) {
    return;
  }
  await navigateTo({ path: '/employees', query: nextQuery }, { replace: true });
}

function buildEmployeeWorkbenchRoute(employeeId: string) {
  return {
    path: `/employees/${employeeId}`,
    query: buildEmployeeListRouteQuery()
  };
}

function handleSelectDept(id: string | null) {
  selectedDeptId.value = id;
  viewMode.value = 'list';
  void replaceEmployeeListRoute(buildEmployeeListRouteQuery({ view: 'list', deptId: id }));
}
function handleSelectOverview() {
  selectedDeptId.value = null;
  viewMode.value = 'overview';
  query.value = "";
  void replaceEmployeeListRoute({});
}

const { toasts, showToast, dismissToast } = useToast();

const crud = useEmployeeCrud({
  refresh: async () => { await refresh(); },
  showToast,
  selectedDeptId,
  buildWorkbenchRoute: buildEmployeeWorkbenchRoute,
});

const skills = computed(() => skillPayload.value?.data.filter((s) => s.enabled || s.statusLabel !== "已停用") ?? []);

const digitalEmployeeCoverage = computed(() => {
  const total = totalHumanCount.value + employees.value.length;
  return total === 0 ? 0 : Math.round((employees.value.length / total) * 100);
});
const activeDigitalEmployees = computed(() =>
  employees.value.filter(emp => emp.latestRun?.status === 'completed' || emp.latestRun?.status === 'running').length
);

const selectedDeptName = computed(() => {
  if (!selectedDeptId.value) return "全部员工";
  return departments.value.find(d => d.id === selectedDeptId.value)?.name ?? "全部员工";
});

const filteredEmployees = computed(() => {
  let list = employees.value;
  if (selectedDeptId.value !== null) {
    list = list.filter(e => e.departmentId === selectedDeptId.value);
  }
  const kw = query.value.trim().toLowerCase();
  if (!kw) return list;
  return list.filter((e) =>
    [e.name, e.code, e.description].filter(Boolean).some((t) => t.toLowerCase().includes(kw))
  );
});

onMounted(() => {
  void Promise.all([
    refresh(),
    refreshDepts(),
    refreshHumanEmployees()
  ]);
});

watch(() => route.query, () => {
  viewMode.value = resolveInitialViewMode();
  selectedDeptId.value = resolveInitialDeptId();
  query.value = resolveInitialSearchQuery();
});

watch(query, (value) => {
  if (viewMode.value !== 'list') {
    return;
  }
  void replaceEmployeeListRoute(buildEmployeeListRouteQuery({ view: 'list', deptId: selectedDeptId.value, q: value }));
});

function getDeptName(deptId: string | null): string | null {
  if (!deptId) return null;
  return departments.value.find(d => d.id === deptId)?.name ?? null;
}
</script>

<template>
  <PageSkeleton v-if="!pageReady" />
  <div v-else class="employees-page">
    <div class="page-bg">
      <div class="page-bg__gradient-1" />
      <div class="page-bg__gradient-2" />
      <div class="page-bg__grid" />
    </div>

    <aside class="employees-sidebar">
      <DepartmentTree
        :departments="departments"
        :employee-counts="deptEmployeeCounts"
        :human-counts="humanCountsMap"
        :selected-id="viewMode === 'overview' ? '__overview__' : selectedDeptId"
        :total-count="employees.length"
        :total-human-count="totalHumanCount"
        :human-members="humanMembersMap"
        :digital-members="digitalMembersMap"
        @select="handleSelectDept"
        @select-overview="handleSelectOverview"
        @refresh="async () => { await refreshDepts(); await refresh(); await refreshHumanEmployees(); }"
      />
    </aside>

    <main class="employees-main">

    <template v-if="viewMode === 'overview'">
      <EmployeesEmployeeOverviewDashboard
        :departments="departments"
        :employee-count="employees.length"
        :total-human-count="totalHumanCount"
        :dept-employee-counts="deptEmployeeCounts"
        :human-counts-map="humanCountsMap"
        :selected-dept-id="selectedDeptId"
        :view-mode="viewMode"
        :active-digital-employees="activeDigitalEmployees"
        :digital-employee-coverage="digitalEmployeeCoverage"
        @select-dept="handleSelectDept"
        @create="crud.openCreator()"
      />
    </template>

    <template v-else>
    <div class="employee-list-view">
    <div class="list-header">
      <div class="list-header__content">
        <span class="list-header__badge">员工管理</span>
        <h1 class="list-header__title">
          {{ selectedDeptName }}
          <span v-if="selectedDeptId" class="list-header__subtitle">· 组织架构</span>
        </h1>
        <p class="list-header__desc">
          {{ selectedDeptId ? `查看「${selectedDeptName}」部门下的员工` : '创建、管理和运营你的数字员工团队' }}
        </p>
      </div>
      <button class="create-btn" @click="crud.openCreator()">
        <Plus class="h-4 w-4" :stroke-width="2" />
        <span>创建员工</span>
      </button>
    </div>

    <div class="search-bar">
      <div class="search-input">
        <Search class="h-4 w-4" :stroke-width="1.8" />
        <input
          v-model="query"
          placeholder="搜索名称、编码或职责…"
          class="search-input__field"
        />
        <kbd v-if="!query" class="search-input__shortcut">⌘K</kbd>
      </div>
      <div class="search-bar__stats">
        <span class="search-bar__count">{{ filteredEmployees.length }}</span>
        <span class="search-bar__label">名员工</span>
      </div>
    </div>

    <div class="employee-grid">
      <EmployeesEmployeeCard
        v-for="emp in filteredEmployees"
        :key="emp.id"
        :employee="emp"
        :dept-name="getDeptName(emp.departmentId)"
        @click="navigateTo(buildEmployeeWorkbenchRoute(emp.id))"
        @edit="crud.openEditor(emp)"
        @delete="crud.openDeleteConfirm(emp)"
      />

      <div
        v-if="filteredEmployees.length === 0"
        class="employee-empty"
      >
        <div class="employee-empty__icon">
          <Sparkles class="h-7 w-7" :stroke-width="1.5" />
        </div>
        <p class="employee-empty__title">还没有员工</p>
        <p class="employee-empty__desc">点击右上角"创建员工"按钮，三步创建你的第一个数字员工。</p>
        <button class="create-btn create-btn--lg" @click="crud.openCreator()">
          <Plus class="h-4 w-4" :stroke-width="2" />
          创建员工
        </button>
      </div>
    </div>
  </div>
    </template>
  </main>

    <EmployeesEmployeeFormSlideOver
      mode="create"
      :visible="crud.showCreator.value"
      :form="crud.form"
      :skills="skills"
      :dept-tree-options="deptTreeOptions"
      :saving="crud.creating.value"
      :error="crud.createError.value"
      @update:visible="crud.showCreator.value = $event"
      @submit="crud.createEmployee"
    />

    <EmployeesEmployeeFormSlideOver
      mode="edit"
      :visible="crud.showEditor.value"
      :form="crud.editForm"
      :skills="skills"
      :dept-tree-options="deptTreeOptions"
      :saving="crud.editSaving.value"
      :error="crud.editError.value"
      :loading="crud.editorLoading.value"
      @update:visible="crud.showEditor.value = $event"
      @submit="crud.saveEmployeeEdit"
    />

    <SharedToastContainer :toasts="toasts" @dismiss="dismissToast" />

    <SharedConfirmDialog
      :open="crud.deleteConfirmOpen.value"
      title="确认删除员工"
      :message="`将删除员工「${crud.deletingEmployee.value?.name ?? ''}」，并清理其工作区文件和关联记录。`"
      confirm-label="确认删除"
      confirming-label="删除中..."
      :error="crud.deleteError.value"
      :confirming="crud.deleting.value"
      @confirm="crud.deleteEmployee"
      @cancel="crud.deleteConfirmOpen.value = false"
    />
  </div>
</template>

<style src="./employees-page.css"></style>
