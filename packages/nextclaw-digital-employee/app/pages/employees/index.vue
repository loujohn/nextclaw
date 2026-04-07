<script setup lang="ts">
import { Search, Sparkles, Plus, X, CheckCircle, AlertCircle } from "lucide-vue-next";
import type { EmployeeResponse, EmployeeListPayload } from "~/composables/useEmployeeList";
import type { HumanEmployeeApiItem } from "~/composables/useDepartmentTree";
import type { DepartmentView } from "~~/shared/department-types";

type SkillOption = {
  name: string;
  nameZh?: string;
  statusLabel: string;
  usageCount: number;
  enabled: boolean;
  purpose: string;
  categoryLabel: string;
};

type SkillListPayload = { ok: boolean; data: SkillOption[] };
type EmployeeDetailPayload = {
  ok: boolean;
  data: {
    id: string;
    name: string;
    code: string;
    description: string;
    systemPrompt: string;
    model: string;
    skills: Array<{ skillName: string }>;
    schedule: {
      scheduleKind: "cron" | "every" | "heartbeat";
      cronExpr?: string | null;
      everyMs?: number | null;
    } | null;
  };
};

const cachedDataOption = <T,>(key: string) => ({
  key,
  getCachedData: (k: string) => useNuxtData<T>(k).data.value ?? undefined,
});
const { data: employeePayload, refresh } = useLazyFetch<EmployeeListPayload>("/api/employees", cachedDataOption("employees-list"));
const { data: skillPayload } = useLazyFetch<SkillListPayload>("/api/skills", cachedDataOption("skills-list"));
const { data: departmentPayload, refresh: refreshDepts } = useLazyFetch<{ ok: boolean; data: DepartmentView[] }>("/api/departments", cachedDataOption("departments-list"));
const { data: humanEmployeePayload, refresh: refreshHumanEmployees } = useLazyFetch<{ ok: boolean; data: HumanEmployeeApiItem[] }>("/api/org/human-employees", cachedDataOption("human-employees-list"));

const pageReady = computed(() => !!employeePayload.value && !!departmentPayload.value);

const { employees } = useEmployeeList(employeePayload);
const {
  departments, deptEmployeeCounts, humanMembersMap, humanCountsMap,
  totalHumanCount, digitalMembersMap, deptTreeOptions,
} = useDepartmentTree(departmentPayload, humanEmployeePayload, employees);
const route = useRoute();

function getSingleQueryValue(value: string | string[] | undefined): string {
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

const selectedDeptId = ref<string | null>(resolveInitialDeptId());
// 视图模式：overview=总览，list=员工列表
const viewMode = ref<'overview' | 'list'>(resolveInitialViewMode());

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

const showCreator = ref(false);
const showEditor = ref(false);
const editorLoading = ref(false);
const query = ref(resolveInitialSearchQuery());
const form = reactive({
  name: "",
  code: "",
  description: "",
  systemPrompt: "",
  model: "",
  departmentId: null as string | null,
  heartbeatContent: "",
  userContent: "",
  bootContent: "",
  agentsContent: "",
  skillNames: [] as string[],
  scheduleKind: "none",
  cronExpr: "0 18 * * *",
  everyMs: 1800000
});
const creating = ref(false);
const createError = ref("");
const editSaving = ref(false);
const editError = ref("");
const deleteConfirmOpen = ref(false);
const deleting = ref(false);
const deleteError = ref("");
const deletingEmployee = ref<EmployeeResponse | null>(null);
const editForm = reactive({
  id: "",
  name: "",
  code: "",
  description: "",
  systemPrompt: "",
  model: "",
  departmentId: null as string | null,
  heartbeatContent: "",
  userContent: "",
  bootContent: "",
  agentsContent: "",
  skillNames: [] as string[],
  scheduleKind: "cron" as "cron" | "every" | "heartbeat",
  cronExpr: "0 18 * * *",
  everyMs: 1800000
});
const skills = computed(() => skillPayload.value?.data.filter((s) => s.enabled || s.statusLabel !== "已停用") ?? []);

const digitalEmployeeCoverage = computed(() => {
  const total = totalHumanCount.value + employees.value.length;
  return total === 0 ? 0 : Math.round((employees.value.length / total) * 100);
});
const activeDigitalEmployees = computed(() =>
  employees.value.filter(emp => emp.latestRun?.status === 'completed' || emp.latestRun?.status === 'running').length
);

// 选中部门的显示名称
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

async function createEmployee() {
  creating.value = true;
  createError.value = "";
  try {
    const code = form.code.trim() || createEmployeeCode(form.name);
    const workspaceFiles: Record<string, string> = {};
    if (form.heartbeatContent.trim()) workspaceFiles["HEARTBEAT.md"] = form.heartbeatContent.trim();
    if (form.userContent.trim()) workspaceFiles["USER.md"] = form.userContent.trim();
    if (form.bootContent.trim()) workspaceFiles["BOOT.md"] = form.bootContent.trim();
    if (form.agentsContent.trim()) workspaceFiles["AGENTS.md"] = form.agentsContent.trim();

    const created = await $fetch<{ ok: boolean; data: { id: string } }>("/api/employees", {
      method: "POST",
      body: {
        name: form.name,
        code,
        description: form.description,
        systemPrompt: form.systemPrompt,
        model: form.model || undefined,
        departmentId: form.departmentId || null,
        skillNames: form.skillNames,
        scheduleKind: form.scheduleKind,
        cronExpr: form.cronExpr,
        everyMs: form.everyMs,
        workspaceFiles: Object.keys(workspaceFiles).length ? workspaceFiles : undefined
      }
    });
    resetForm();
    showCreator.value = false;
    await refresh();
    await navigateTo(buildEmployeeWorkbenchRoute(created.data.id));
  } catch (error) {
    createError.value = error instanceof Error ? error.message : String(error);
  } finally {
    creating.value = false;
  }
}

async function loadWorkspaceFile(employeeId: string, filename: string): Promise<string> {
  try {
    const result = await $fetch<{ ok: boolean; data: { content: string } }>(
      `/api/employees/${employeeId}/workspace/${encodeURIComponent(filename)}`
    );
    return result.data.content ?? "";
  } catch {
    return "";
  }
}

async function openEditor(employee: EmployeeResponse) {
  showEditor.value = true;
  editorLoading.value = true;
  editError.value = "";
  try {
    const detail = await $fetch<EmployeeDetailPayload>(`/api/employees/${employee.id}`);
    const [heartbeatContent, userContent, bootContent, agentsContent] = await Promise.all([
      loadWorkspaceFile(employee.id, "HEARTBEAT.md"),
      loadWorkspaceFile(employee.id, "USER.md"),
      loadWorkspaceFile(employee.id, "BOOT.md"),
      loadWorkspaceFile(employee.id, "AGENTS.md")
    ]);
    Object.assign(editForm, {
      id: detail.data.id,
      name: detail.data.name,
      code: detail.data.code,
      description: detail.data.description,
      systemPrompt: detail.data.systemPrompt,
      model: detail.data.model || "",
      departmentId: employee.departmentId ?? null,
      heartbeatContent,
      userContent,
      bootContent,
      agentsContent,
      skillNames: detail.data.skills.map((skill) => skill.skillName),
      scheduleKind: detail.data.schedule?.scheduleKind ?? "cron",
      cronExpr: detail.data.schedule?.cronExpr ?? "0 18 * * *",
      everyMs: detail.data.schedule?.everyMs ?? 1800000
    });
  } catch (error) {
    editError.value = error instanceof Error ? error.message : String(error);
  } finally {
    editorLoading.value = false;
  }
}

async function saveEmployeeEdit() {
  if (!editForm.id) return;
  editSaving.value = true;
  editError.value = "";
  try {
    await $fetch(`/api/employees/${editForm.id}`, {
      method: "PATCH",
      body: {
        name: editForm.name,
        description: editForm.description,
        systemPrompt: editForm.systemPrompt,
        model: editForm.model,
        departmentId: editForm.departmentId,
        skillNames: editForm.skillNames,
        scheduleKind: editForm.scheduleKind,
        cronExpr: editForm.cronExpr,
        everyMs: editForm.everyMs,
        workspaceFiles: {
          "HEARTBEAT.md": editForm.heartbeatContent,
          "USER.md": editForm.userContent,
          "BOOT.md": editForm.bootContent,
          "AGENTS.md": editForm.agentsContent
        }
      }
    });
    await refresh();
    showEditor.value = false;
    showToast("success", "员工信息已保存");
  } catch (error) {
    editError.value = error instanceof Error ? error.message : String(error);
    showToast("error", `保存失败：${editError.value}`);
  } finally {
    editSaving.value = false;
  }
}

function openDeleteConfirm(employee: EmployeeResponse) {
  deletingEmployee.value = employee;
  deleteConfirmOpen.value = true;
  deleteError.value = "";
}

async function deleteEmployee() {
  if (!deletingEmployee.value) return;
  deleting.value = true;
  deleteError.value = "";
  const empName = deletingEmployee.value.name;
  try {
    const deletingId = deletingEmployee.value.id;
    await $fetch(`/api/employees/${deletingId}`, { method: "DELETE" });
    await refresh();
    if (showEditor.value && editForm.id === deletingId) {
      showEditor.value = false;
    }
    deleteConfirmOpen.value = false;
    deletingEmployee.value = null;
    showToast("success", `已删除员工「${empName}」`);
  } catch (error) {
    deleteError.value = error instanceof Error ? error.message : String(error);
    showToast("error", `删除失败：${deleteError.value}`);
  } finally {
    deleting.value = false;
  }
}

function resetForm() {
  Object.assign(form, { name: "", code: "", description: "", systemPrompt: "", model: "", departmentId: selectedDeptId.value, heartbeatContent: "", userContent: "", bootContent: "", agentsContent: "", skillNames: [], scheduleKind: "none", cronExpr: "0 18 * * *", everyMs: 1800000 });
}
function createEmployeeCode(name: string): string {
  const n = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return n || `employee-${Date.now().toString().slice(-6)}`;
}

function getDeptName(deptId: string | null): string | null {
  if (!deptId) return null;
  return departments.value.find(d => d.id === deptId)?.name ?? null;
}


</script>

<template>
  <PageSkeleton v-if="!pageReady" />
  <div v-else class="employees-page">
    <!-- 背景装饰 -->
    <div class="page-bg">
      <div class="page-bg__gradient-1" />
      <div class="page-bg__gradient-2" />
      <div class="page-bg__grid" />
    </div>

    <!-- 左侧组织树面板 -->
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

    <!-- 右侧主内容区 -->
    <main class="employees-main">

    <!-- ===== 总览视图 ===== -->
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
        @create="showCreator = true; resetForm()"
      />
    </template>

    <!-- ===== 员工列表视图 ===== -->
    <template v-else>
    <div class="employee-list-view">
    <!-- Header -->
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
      <button class="create-btn" @click="showCreator = true; resetForm()">
        <Plus class="h-4 w-4" :stroke-width="2" />
        <span>创建员工</span>
      </button>
    </div>

    <!-- Search & Filter Bar -->
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

    <!-- Employee Grid -->
    <div class="employee-grid">
      <EmployeesEmployeeCard
        v-for="emp in filteredEmployees"
        :key="emp.id"
        :employee="emp"
        :dept-name="getDeptName(emp.departmentId)"
        @click="navigateTo(buildEmployeeWorkbenchRoute(emp.id))"
        @edit="openEditor(emp)"
        @delete="openDeleteConfirm(emp)"
      />

      <!-- Empty State -->
      <div
        v-if="filteredEmployees.length === 0"
        class="employee-empty"
      >
        <div class="employee-empty__icon">
          <Sparkles class="h-7 w-7" :stroke-width="1.5" />
        </div>
        <p class="employee-empty__title">还没有员工</p>
        <p class="employee-empty__desc">点击右上角"创建员工"按钮，三步创建你的第一个数字员工。</p>
        <button class="create-btn create-btn--lg" @click="showCreator = true; resetForm()">
          <Plus class="h-4 w-4" :stroke-width="2" />
          创建员工
        </button>
      </div>
    </div>
  </div>
    </template>
  </main>

    <!-- Creator Slide-over -->
    <EmployeesEmployeeFormSlideOver
      mode="create"
      :visible="showCreator"
      :form="form"
      :skills="skills"
      :dept-tree-options="deptTreeOptions"
      :saving="creating"
      :error="createError"
      @update:visible="showCreator = $event"
      @submit="createEmployee"
    />

    <!-- Editor Slide-over -->
    <EmployeesEmployeeFormSlideOver
      mode="edit"
      :visible="showEditor"
      :form="editForm"
      :skills="skills"
      :dept-tree-options="deptTreeOptions"
      :saving="editSaving"
      :error="editError"
      :loading="editorLoading"
      @update:visible="showEditor = $event"
      @submit="saveEmployeeEdit"
    />

    <!-- Toast Notifications -->
    <Teleport to="body">
      <div class="fixed top-0 inset-x-0 z-[60] flex flex-col items-center gap-2 pt-5 pointer-events-none">
        <TransitionGroup name="toast">
          <div
            v-for="toast in toasts"
            :key="toast.id"
            class="pointer-events-auto flex items-center gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur-sm min-w-[260px] max-w-sm"
            :class="toast.type === 'success' ? 'bg-card border-primary/20 text-foreground' : 'bg-card border-destructive/20 text-foreground'"
          >
            <CheckCircle v-if="toast.type === 'success'" class="h-4 w-4 shrink-0 text-primary" :stroke-width="2" />
            <AlertCircle v-else class="h-4 w-4 shrink-0 text-destructive" :stroke-width="2" />
            <p class="flex-1 text-sm">{{ toast.message }}</p>
            <button class="text-muted-foreground hover:text-foreground" @click="dismissToast(toast.id)">
              <X class="h-3.5 w-3.5" :stroke-width="2" />
            </button>
          </div>
        </TransitionGroup>
      </div>
    </Teleport>

    <!-- Delete Confirm -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="deleteConfirmOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div class="absolute inset-0 bg-foreground/35" @click="deleteConfirmOpen = false" />
          <div class="relative w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl">
            <h3 class="text-base font-semibold">确认删除员工</h3>
            <p class="mt-2 text-sm text-muted-foreground">
              将删除员工 <span class="font-medium text-foreground">{{ deletingEmployee?.name }}</span>，并清理其工作区文件和关联记录。
            </p>
            <p v-if="deleteError" class="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{{ deleteError }}</p>
            <div class="mt-5 flex items-center justify-end gap-2">
              <button class="btn-ghost" :disabled="deleting" @click="deleteConfirmOpen = false">取消</button>
              <button class="btn-ghost text-destructive hover:bg-destructive/10" :disabled="deleting" @click="deleteEmployee">
                {{ deleting ? "删除中..." : "确认删除" }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style src="./employees-page.css"></style>
