<script setup lang="ts">
import { formatScheduleSummary } from "~~/shared/ui-models";
import { Search, ChevronRight, ChevronLeft, Sparkles, Plus, X, ChevronDown, Pencil, Trash2, ExternalLink, Eye, CheckCircle, AlertCircle, Zap, Clock, Wrench, Building2, Users, Bot, Network, TrendingUp, Activity, ChevronsDown, ChevronsUp } from "lucide-vue-next";
import type { DepartmentView, HumanMemberBrief, DigitalMemberBrief } from "~/components/DepartmentTree.vue";

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

type SkillOption = {
  name: string;
  statusLabel: string;
  usageCount: number;
  enabled: boolean;
  purpose: string;
  categoryLabel: string;
};

type EmployeeListPayload = { ok: boolean; data: EmployeeResponse[] };
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

const { data: employeePayload, refresh } = await useFetch<EmployeeListPayload>("/api/employees");
const { data: skillPayload } = await useFetch<SkillListPayload>("/api/skills");
const { data: departmentPayload, refresh: refreshDepts } = await useFetch<{ ok: boolean; data: DepartmentView[] }>("/api/departments");
type HumanEmployeeListPayload = { ok: boolean; data: HumanMemberBrief[] };
const { data: humanEmployeePayload, refresh: refreshHumanEmployees } = await useFetch<HumanEmployeeListPayload>("/api/org/human-employees");

const selectedDeptId = ref<string | null>(null);
// 视图模式：overview=总览，list=员工列表
const viewMode = ref<'overview' | 'list'>('overview');

// 部门展开状态
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

function handleSelectDept(id: string | null) {
  selectedDeptId.value = id;
  viewMode.value = 'list';
}
function handleSelectOverview() {
  selectedDeptId.value = null;
  viewMode.value = 'overview';
}

// 点击部门卡片的逻辑
function handleDeptCardClick(node: { id: string; children: { id: string }[] }) {
  // 如果有子部门且已展开，点击卡片收起
  if (node.children.length > 0 && isDeptExpanded(node.id)) {
    expandedDepts.value.delete(node.id);
  } else {
    // 否则进入员工列表
    handleSelectDept(node.id);
  }
}

// Toast 通知系统
type Toast = { id: number; type: "success" | "error"; message: string };
const toasts = ref<Toast[]>([]);
let _toastId = 0;
function showToast(type: "success" | "error", message: string) {
  const id = ++_toastId;
  toasts.value.push({ id, type, message });
  setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id); }, 3500);
}
function dismissToast(id: number) {
  toasts.value = toasts.value.filter(t => t.id !== id);
}

const showCreator = ref(false);
const showEditor = ref(false);
const showViewer = ref(false);
const editorLoading = ref(false);
const viewerLoading = ref(false);
const step = ref(0);
const editStep = ref(0);
const viewStep = ref(0);
const query = ref("");
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
  scheduleKind: "cron",
  cronExpr: "0 18 * * *",
  everyMs: 1800000
});
const showAdvanced = ref(false);
const creating = ref(false);
const createError = ref("");
const editSaving = ref(false);
const editError = ref("");
const deleteConfirmOpen = ref(false);
const deleting = ref(false);
const deleteError = ref("");
const deletingEmployee = ref<EmployeeResponse | null>(null);
const touched = reactive({ name: false, departmentId: false });
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
const viewForm = reactive({
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

const employees = computed(() => employeePayload.value?.data ?? []);
const skills = computed(() => skillPayload.value?.data.filter((s) => s.enabled || s.statusLabel !== "已停用") ?? []);
const departments = computed(() => departmentPayload.value?.data ?? []);

// 每个部门的数字员工数量
const deptEmployeeCounts = computed<Record<string, number>>(() => {
  const counts: Record<string, number> = {};
  for (const emp of employees.value) {
    if (emp.departmentId) {
      counts[emp.departmentId] = (counts[emp.departmentId] ?? 0) + 1;
    }
  }
  return counts;
});

// 按部门分组：人类员工
const humanMembersMap = computed<Record<string, HumanMemberBrief[]>>(() => {
  const map: Record<string, HumanMemberBrief[]> = {};
  for (const m of (humanEmployeePayload.value?.data ?? [])) {
    const deptId = (m as any).departmentId as string | null;
    if (deptId) {
      if (!map[deptId]) map[deptId] = [];
      map[deptId].push(m);
    }
  }
  return map;
});

// 每个部门的人类员工数量
const humanCountsMap = computed<Record<string, number>>(() => {
  const counts: Record<string, number> = {};
  for (const members of Object.entries(humanMembersMap.value)) {
    counts[members[0]] = members[1].length;
  }
  return counts;
});

// 全局人类员工总数
const totalHumanCount = computed(() => humanEmployeePayload.value?.data?.length ?? 0);

// 组织树节点（包含子节点递归累加数量）
type OrgChartNode = {
  id: string;
  name: string;
  humanCount: number;
  digitalCount: number;
  children: OrgChartNode[];
};

const orgChartTree = computed<OrgChartNode[]>(() => {
  const depts = departments.value;
  const map = new Map<string, { dept: DepartmentView; children: string[] }>();
  for (const d of depts) map.set(d.id, { dept: d, children: [] });
  const roots: string[] = [];
  for (const d of depts) {
    if (d.parentId && map.has(d.parentId)) map.get(d.parentId)!.children.push(d.id);
    else roots.push(d.id);
  }
  function buildNode(id: string): OrgChartNode {
    const entry = map.get(id)!;
    const children = entry.children.map(buildNode);
    const ownHuman = humanCountsMap.value[id] ?? 0;
    const ownDigital = deptEmployeeCounts.value[id] ?? 0;
    const humanCount = ownHuman + children.reduce((s, c) => s + c.humanCount, 0);
    const digitalCount = ownDigital + children.reduce((s, c) => s + c.digitalCount, 0);
    return { id, name: entry.dept.name, humanCount, digitalCount, children };
  }
  return roots.map(buildNode);
});

// 按部门分组：数字员工
const digitalMembersMap = computed<Record<string, DigitalMemberBrief[]>>(() => {
  const map: Record<string, DigitalMemberBrief[]> = {};
  for (const emp of employees.value) {
    if (emp.departmentId) {
      if (!map[emp.departmentId]) map[emp.departmentId] = [];
      map[emp.departmentId]!.push({ id: emp.id, name: emp.name });
    }
  }
  return map;
});

// 数字员工覆盖率（数字员工 / 总员工数）
const digitalEmployeeCoverage = computed(() => {
  const total = totalHumanCount.value + employees.value.length;
  if (total === 0) return 0;
  return Math.round((employees.value.length / total) * 100);
});

// 今日活跃数字员工数（有运行记录的）
const activeDigitalEmployees = computed(() => {
  return employees.value.filter(emp => emp.latestRun?.status === 'completed' || emp.latestRun?.status === 'running').length;
});

// 获取部门员工列表（人类+数字员工混合显示，交替出现）
function getDeptMembers(deptId: string): Array<{ id: string; name: string; isDigital: boolean }> {
  const humans = (humanMembersMap.value[deptId] ?? []).map(m => ({
    id: m.id,
    name: m.name,
    isDigital: false
  }));
  const digitals = (digitalMembersMap.value[deptId] ?? []).map(m => ({
    id: m.id,
    name: m.name,
    isDigital: true
  }));

  // 交替混合：先取2个真人 + 2个数字员工，或按实际数量
  const result: Array<{ id: string; name: string; isDigital: boolean }> = [];
  const maxTotal = 4;
  let hIdx = 0, dIdx = 0;

  while (result.length < maxTotal && (hIdx < humans.length || dIdx < digitals.length)) {
    // 先加真人（最多2个）
    if (hIdx < humans.length && hIdx < 2) {
      result.push(humans[hIdx]!);
      hIdx++;
    }
    // 再加数字员工（最多2个）
    if (result.length < maxTotal && dIdx < digitals.length && dIdx < 2) {
      result.push(digitals[dIdx]!);
      dIdx++;
    }
    // 如果还不够，继续补充
    if (result.length < maxTotal && hIdx < humans.length) {
      result.push(humans[hIdx]!);
      hIdx++;
    }
    if (result.length < maxTotal && dIdx < digitals.length) {
      result.push(digitals[dIdx]!);
      dIdx++;
    }
    // 防止死循环
    if (hIdx >= humans.length && dIdx >= digitals.length) break;
  }

  return result;
}

// 获取部门总员工数
function getDeptTotalMembers(deptId: string): number {
  return (humanCountsMap.value[deptId] ?? 0) + (deptEmployeeCounts.value[deptId] ?? 0);
}

// 树形部门选项（层级缩进）
const deptTreeOptions = computed(() => {
  const depts = departments.value;
  const map = new Map<string, { dept: DepartmentView; children: string[] }>();
  for (const d of depts) map.set(d.id, { dept: d, children: [] });
  const roots: string[] = [];
  for (const d of depts) {
    if (d.parentId && map.has(d.parentId)) map.get(d.parentId)!.children.push(d.id);
    else roots.push(d.id);
  }
  const result: Array<{ id: string; label: string }> = [];
  function walk(id: string, depth: number) {
    const node = map.get(id);
    if (!node) return;
    const prefix = depth === 0 ? "" : "—".repeat(depth) + " ";
    result.push({ id, label: prefix + node.dept.name });
    for (const childId of node.children) walk(childId, depth + 1);
  }
  for (const rootId of roots) walk(rootId, 0);
  return result;
});

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

const steps = [
  { title: "基础信息", desc: "定义员工的身份与角色" },
  { title: "工作设定", desc: "模型与行为偏好" },
  { title: "能力配置", desc: "选择员工可使用的技能" }
];

async function createEmployee() {
  touched.departmentId = true;
  if (!form.departmentId) return;
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
    await navigateTo(`/employees/${created.data.id}`);
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
  editStep.value = 0;
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
      departmentId: (employee as EmployeeResponse).departmentId ?? null,
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
  if (!editForm.departmentId) {
    editError.value = "请选择所属部门";
    return;
  }
  editSaving.value = true;
  editError.value = "";
  try {
    await $fetch(`/api/employees/${editForm.id}`, {
      method: "PATCH",
      body: {
        name: editForm.name,
        code: editForm.code,
        description: editForm.description,
        systemPrompt: editForm.systemPrompt,
        model: editForm.model || undefined,
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

async function openViewer(employee: EmployeeResponse) {
  showViewer.value = true;
  viewerLoading.value = true;
  viewStep.value = 0;
  try {
    const detail = await $fetch<EmployeeDetailPayload>(`/api/employees/${employee.id}`);
    const [heartbeatContent, userContent, bootContent, agentsContent] = await Promise.all([
      loadWorkspaceFile(employee.id, "HEARTBEAT.md"),
      loadWorkspaceFile(employee.id, "USER.md"),
      loadWorkspaceFile(employee.id, "BOOT.md"),
      loadWorkspaceFile(employee.id, "AGENTS.md")
    ]);
    Object.assign(viewForm, {
      id: detail.data.id,
      name: detail.data.name,
      code: detail.data.code,
      description: detail.data.description,
      systemPrompt: detail.data.systemPrompt,
      model: detail.data.model || "",
      heartbeatContent,
      userContent,
      bootContent,
      agentsContent,
      skillNames: detail.data.skills.map((skill) => skill.skillName),
      scheduleKind: detail.data.schedule?.scheduleKind ?? "cron",
      cronExpr: detail.data.schedule?.cronExpr ?? "0 18 * * *",
      everyMs: detail.data.schedule?.everyMs ?? 1800000
    });
  } catch {
    // noop
  } finally {
    viewerLoading.value = false;
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

function nextStep() { step.value = Math.min(step.value + 1, steps.length - 1); }
function previousStep() { step.value = Math.max(step.value - 1, 0); }
function resetForm() {
  step.value = 0;
  touched.name = false;
  touched.departmentId = false;
  showAdvanced.value = false;
  Object.assign(form, { name: "", code: "", description: "", systemPrompt: "", model: "", departmentId: selectedDeptId.value, heartbeatContent: "", userContent: "", bootContent: "", agentsContent: "", skillNames: [], scheduleKind: "cron", cronExpr: "0 18 * * *", everyMs: 1800000 });
}
function createEmployeeCode(name: string): string {
  const n = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return n || `employee-${Date.now().toString().slice(-6)}`;
}

function resolveHealth(e: EmployeeResponse): { label: string; cls: string; lastStatus: string } {
  if (e.latestRun?.status === "failed") return { label: "执行失败", cls: "bg-destructive/10 text-destructive", lastStatus: "failed" };
  if (!e.health.hasSkills) return { label: "待绑定技能", cls: "bg-warning/10 text-warning-foreground", lastStatus: "no-skills" };
  if (e.jobsCount === 0) return { label: "待创建任务", cls: "bg-muted text-muted-foreground", lastStatus: "no-schedule" };
  if (e.enabledJobsCount === 0) return { label: "全部任务暂停", cls: "bg-warning/10 text-warning-foreground", lastStatus: "paused" };
  return { label: "运行健康", cls: "bg-primary/10 text-primary", lastStatus: "healthy" };
}

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

function getDeptName(deptId: string | null): string | null {
  if (!deptId) return null;
  return departments.value.find(d => d.id === deptId)?.name ?? null;
}

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

function getEmployeeDescription(emp: EmployeeResponse): string {
  if (emp.description?.trim()) return emp.description.trim();
  if (emp.enabledJobsCount > 0) return `负责 ${emp.enabledJobsCount} 个活跃任务`;
  return "等待分配工作";
}

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

// === 头像/卡片颜色生成（基于名称哈希，每位员工固定色系）===
// 低饱和度柔和色系：bannerFrom/To 控制 Banner，px = 像素头像前景，bg = 像素头像背景
// 部门卡片颜色（渐变色）
const deptColors = [
  'linear-gradient(135deg, #6366f1, #8b5cf6)', // 紫色
  'linear-gradient(135deg, #ec4899, #f472b6)', // 粉色
  'linear-gradient(135deg, #f59e0b, #fbbf24)', // 橙色
  'linear-gradient(135deg, #06b6d4, #22d3ee)', // 青色
  'linear-gradient(135deg, #8b5cf6, #a78bfa)', // 浅紫
  'linear-gradient(135deg, #ef4444, #f87171)', // 红色
];

// 部门图标类型
const deptIcons = ['code', 'box', 'chart', 'activity', 'users', 'dollar'];

type AvatarPalette = { bannerFrom: string; bannerTo: string; px: string; bg: string };
const AVATAR_PALETTES: AvatarPalette[] = [
  { bannerFrom: "#c7d2fe", bannerTo: "#a5b4fc", px: "#6366f1", bg: "#eef2ff" }, // soft indigo
  { bannerFrom: "#fecdd3", bannerTo: "#fca5a5", px: "#f87171", bg: "#fff1f2" }, // soft rose
  { bannerFrom: "#bae6fd", bannerTo: "#93c5fd", px: "#3b82f6", bg: "#eff6ff" }, // soft blue
  { bannerFrom: "#a7f3d0", bannerTo: "#6ee7b7", px: "#10b981", bg: "#ecfdf5" }, // soft emerald
  { bannerFrom: "#fde68a", bannerTo: "#fcd34d", px: "#d97706", bg: "#fffbeb" }, // soft amber
  { bannerFrom: "#a5f3fc", bannerTo: "#67e8f9", px: "#0891b2", bg: "#ecfeff" }, // soft cyan
  { bannerFrom: "#e9d5ff", bannerTo: "#d8b4fe", px: "#9333ea", bg: "#faf5ff" }, // soft purple
  { bannerFrom: "#bbf7d0", bannerTo: "#86efac", px: "#16a34a", bg: "#f0fdf4" }, // soft green
  { bannerFrom: "#fed7aa", bannerTo: "#fdba74", px: "#ea580c", bg: "#fff7ed" }, // soft orange
  { bannerFrom: "#fbcfe8", bannerTo: "#f9a8d4", px: "#db2777", bg: "#fdf2f8" }, // soft pink
  { bannerFrom: "#cffafe", bannerTo: "#a5f3fc", px: "#0e7490", bg: "#ecfeff" }, // soft aqua
  { bannerFrom: "#d9f99d", bannerTo: "#bef264", px: "#65a30d", bg: "#f7fee7" }, // soft lime
];

// === 办公场景人物样式（基于名称哈希随机生成）===
type CharacterStyle = {
  skinColor: string;      // 肤色
  hairColor: string;      // 发色
  shirtColor: string;     // 衬衫颜色
  shirtColorLight: string; // 衬衫浅色（衣领）
  hairStyle: 'short' | 'medium' | 'long' | 'ponytail' | 'curly';  // 发型
};

// 中国人肤色选项（亚洲肤色范围）
const SKIN_COLORS = [
  "#fde8d7",  // 白皙
  "#fcd9b6",  // 较白
  "#f5c9a6",  // 中等偏白
  "#e8b896",  // 中等
  "#d4a574",  // 健康色
  "#c99a5c",  // 小麦色
];

// 中国人发色选项（以黑发为主）
const HAIR_COLORS = [
  "#0a0a0a",  // 纯黑
  "#1a1a1a",  // 黑色
  "#2d1f1a",  // 深棕黑
  "#3d2b1f",  // 棕黑
  "#4a3728",  // 深棕
  "#5c4033",  // 棕色
  "#1a1a2e",  // 偏蓝黑（染发）
  "#2d2d44",  // 深灰黑（染发）
];

// 衬衫颜色选项（职场常见颜色）
const SHIRT_COLORS = [
  { main: "#3b82f6", light: "#60a5fa" },  // 蓝色
  { main: "#1e40af", light: "#3b82f6" },  // 深蓝
  { main: "#6366f1", light: "#818cf8" },  // 靛蓝
  { main: "#0f766e", light: "#14b8a6" },  // 墨绿
  { main: "#374151", light: "#6b7280" },  // 深灰
  { main: "#1f2937", light: "#4b5563" },  // 黑灰
  { main: "#dc2626", light: "#ef4444" },  // 红色
  { main: "#0891b2", light: "#22d3ee" },  // 青色
  { main: "#475569", light: "#64748b" },  // 蓝灰
  { main: "#2563eb", light: "#3b82f6" },  // 宝蓝
];

function _nameHash(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (name.charCodeAt(i) + ((h << 5) - h)) | 0;
  }
  return Math.abs(h);
}

function _getEmpPalette(name: string): AvatarPalette {
  return AVATAR_PALETTES[_nameHash(name) % AVATAR_PALETTES.length]!;
}

/** Banner：柔和渐变 + 白色圆点纹理叠加，背景更丰富 */
function getBannerStyle(name: string): Record<string, string> {
  const p = _getEmpPalette(name);
  return {
    backgroundImage: [
      "radial-gradient(circle, rgba(255,255,255,0.32) 1px, transparent 1px)",
      `linear-gradient(135deg, ${p.bannerFrom} 0%, ${p.bannerTo} 100%)`
    ].join(", "),
    backgroundSize: "14px 14px, 100% 100%"
  };
}

// 头像样式缓存（带大小限制，避免内存泄漏）
const AVATAR_STYLE_CACHE_LIMIT = 500;
const _avatarStyleCache = new Map<string, Record<string, string>>();

/** 获取头像渐变样式 - 带缓存 */
function getAvatarStyle(name: string): Record<string, string> {
  // 检查缓存
  const cached = _avatarStyleCache.get(name);
  if (cached) return cached;

  // 计算并缓存
  const p = _getEmpPalette(name);
  const style = {
    background: `linear-gradient(135deg, ${p.px} 0%, ${p.bannerTo} 100%)`
  };

  // 限制缓存大小，删除最旧的条目
  if (_avatarStyleCache.size >= AVATAR_STYLE_CACHE_LIMIT) {
    const firstKey = _avatarStyleCache.keys().next().value;
    if (firstKey) _avatarStyleCache.delete(firstKey);
  }
  _avatarStyleCache.set(name, style);
  return style;
}

// 角色样式缓存（带大小限制，避免内存泄漏）
const CHARACTER_STYLE_CACHE_LIMIT = 500;
const _characterStyleCache = new Map<string, CharacterStyle>();

/** 获取人物样式（肤色、发色、衬衫、发型）- 带缓存 */
function getCharacterStyle(name: string): CharacterStyle {
  // 检查缓存
  const cached = _characterStyleCache.get(name);
  if (cached) return cached;

  // 计算并缓存
  const h = _nameHash(name);
  const hairStyleIndex = (h * 7) % 5;  // 5种发型
  const hairStyles = ['short', 'medium', 'long', 'ponytail', 'curly'] as const;
  const style: CharacterStyle = {
    skinColor: SKIN_COLORS[h % SKIN_COLORS.length]!,
    hairColor: HAIR_COLORS[(h >> 3) % HAIR_COLORS.length]!,
    shirtColor: SHIRT_COLORS[(h >> 6) % SHIRT_COLORS.length]!.main,
    shirtColorLight: SHIRT_COLORS[(h >> 6) % SHIRT_COLORS.length]!.light,
    hairStyle: hairStyles[hairStyleIndex]!,
  };

  // 限制缓存大小，删除最旧的条目
  if (_characterStyleCache.size >= CHARACTER_STYLE_CACHE_LIMIT) {
    const firstKey = _characterStyleCache.keys().next().value;
    if (firstKey) _characterStyleCache.delete(firstKey);
  }
  _characterStyleCache.set(name, style);
  return style;
}

/** 确定性像素艺术头像（5×5 对称 Identicon，纯 SVG 内联，无外部请求）*/
function generatePixelAvatar(name: string): string {
  const GRID = 5;
  const CELL = 14;          // 每格 14px → 整体 70×70
  const total = GRID * CELL;
  const pal = _getEmpPalette(name);
  let s = _nameHash(name) >>> 0;
  const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
  const half = Math.ceil(GRID / 2);
  // 生成左半部分数据，右侧镜像对称
  const cells: boolean[][] = Array.from({ length: GRID }, () =>
    Array.from({ length: half }, () => rng() > 0.38)
  );
  const rects: string[] = [];
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const col = x < half ? x : GRID - 1 - x;
      if (cells[y]![col]) {
        rects.push(`<rect x="${x * CELL}" y="${y * CELL}" width="${CELL}" height="${CELL}" rx="2"/>`);
      }
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}"><rect width="${total}" height="${total}" fill="${pal.bg}"/><g fill="${pal.px}">${rects.join("")}</g></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// ======== 半身立像 SVG 生成系统 ========
// 配饰类型
type AccessoryKind = 'none' | 'headphone' | 'glasses' | 'cap' | 'scarf' | 'tie' | 'earring';
// 发型类型（扩展为6种）
type HalfBodyHairStyle = 'short' | 'medium' | 'long' | 'ponytail' | 'curly' | 'bun';
// 姿势类型
type PoseKind = 'both_wave' | 'arms_crossed' | 'hands_on_hips' | 'thinking';

type HalfBodyChar = {
  skinColor: string;
  hairColor: string;
  shirtColor: string;
  shirtColorLight: string;
  hairStyle: HalfBodyHairStyle;
  accessory: AccessoryKind;
  pose: PoseKind;
  bgDecorKind: number;  // 0-3: 决定背景装饰图案
};

// ======== 真人风格证件照头像 SVG 生成系统 ========
// 性别类型（用于决定发型和面部特征）
type GenderType = 'male' | 'female';
// 发型类型
type PortraitHairStyle = 'short' | 'side_part' | 'swept_back' | 'center_part' | 'bald' | 'ponytail' | 'wavy' | 'bob';
// 眼镜类型
type GlassesType = 'none' | 'rectangle' | 'round' | 'aviator';
// 表情类型
type ExpressionType = 'neutral' | 'smile' | 'confident';

type PortraitChar = {
  skinColor: string;
  skinShadow: string;
  skinHighlight: string;
  hairColor: string;
  shirtColor: string;
  shirtGradient: string;
  bgColor: string;
  bgGradient: string;
  gender: GenderType;
  hairStyle: PortraitHairStyle;
  glasses: GlassesType;
  expression: ExpressionType;
  hasTie: boolean;
  tieColor: string;
};

// 中国人肤色选项（更自然的亚洲肤色）
const SKIN_TONES = [
  { main: "#fde8d7", shadow: "#f5d4c0", highlight: "#fff5ed" },  // 白皙
  { main: "#fcd9b6", shadow: "#f0c8a0", highlight: "#fff0e5" },  // 较白
  { main: "#f5c9a6", shadow: "#e8b590", highlight: "#ffecd8" },  // 中等偏白
  { main: "#e8b896", shadow: "#d9a580", highlight: "#f8e0c8" },  // 中等
  { main: "#d4a574", shadow: "#c49260", highlight: "#f0d4b0" },  // 健康色
  { main: "#c99a5c", shadow: "#b88748", highlight: "#e8c898" },  // 小麦色
];

// 自然发色（以黑棕为主，符合中国人特点）
const HAIR_TONES = [
  "#0d0d0d",  // 纯黑
  "#1a1a1a",  // 深黑
  "#1f1a15",  // 自然黑
  "#2a2018",  // 深棕黑
  "#3d2b1f",  // 棕黑
  "#4a3728",  // 深棕
];

// 职场衬衫颜色（专业但温和）
const SHIRT_TONES = [
  { main: "#f8fafc", gradient: "#e2e8f0", name: "白" },
  { main: "#eff6ff", gradient: "#dbeafe", name: "浅蓝" },
  { main: "#ecfdf5", gradient: "#d1fae5", name: "浅绿" },
  { main: "#fef3c7", gradient: "#fde68a", name: "浅黄" },
  { main: "#fce7f3", gradient: "#fbcfe8", name: "浅粉" },
  { main: "#1e3a5f", gradient: "#2d4a6f", name: "深蓝" },
  { main: "#1f2937", gradient: "#374151", name: "深灰" },
  { main: "#0f4c3a", gradient: "#1a5c48", name: "墨绿" },
];

// 背景色（温暖柔和）
const BG_TONES = [
  { main: "#f8fafc", gradient: "#f1f5f9" },
  { main: "#fffbeb", gradient: "#fef3c7" },
  { main: "#f0fdf4", gradient: "#dcfce7" },
  { main: "#fef2f2", gradient: "#fee2e2" },
  { main: "#eff6ff", gradient: "#dbeafe" },
  { main: "#fdf4ff", gradient: "#f5d0fe" },
];

// 领带颜色
const TIE_COLORS = ["#1e40af", "#7c3aed", "#059669", "#dc2626", "#0f766e", "#4338ca"];

function _getPortraitChar(name: string): PortraitChar {
  const h = _nameHash(name);
  const hairStyles: PortraitHairStyle[] = ['short', 'side_part', 'swept_back', 'center_part', 'bald', 'ponytail', 'wavy', 'bob'];
  const glassesTypes: GlassesType[] = ['none', 'none', 'rectangle', 'none', 'round', 'none', 'aviator', 'none'];
  const expressions: ExpressionType[] = ['neutral', 'smile', 'confident'];

  const skinTone = SKIN_TONES[h % SKIN_TONES.length]!;
  const hairTone = HAIR_TONES[(h >> 3) % HAIR_TONES.length]!;
  const shirtTone = SHIRT_TONES[(h >> 6) % SHIRT_TONES.length]!;
  const bgTone = BG_TONES[(h >> 9) % BG_TONES.length]!;
  const gender: GenderType = ((h >> 5) & 1) === 0 ? 'male' : 'female';

  return {
    skinColor: skinTone.main,
    skinShadow: skinTone.shadow,
    skinHighlight: skinTone.highlight,
    hairColor: hairTone,
    shirtColor: shirtTone.main,
    shirtGradient: shirtTone.gradient,
    bgColor: bgTone.main,
    bgGradient: bgTone.gradient,
    gender,
    hairStyle: hairStyles[((h * 13) >>> 2) % hairStyles.length]!,
    glasses: glassesTypes[((h * 17) >>> 4) % glassesTypes.length]!,
    expression: expressions[((h * 23) >>> 6) % expressions.length]!,
    hasTie: ((h >> 8) & 1) === 1 && shirtTone.name !== "白" && shirtTone.name !== "浅蓝" && shirtTone.name !== "浅绿" && shirtTone.name !== "浅黄" && shirtTone.name !== "浅粉",
    tieColor: TIE_COLORS[h % TIE_COLORS.length]!,
  };
}

/** 生成真人风格证件照 SVG */
function generatePortraitSVG(name: string): string {
  const c = _getPortraitChar(name);
  const W = 120, H = 160;
  const cx = W / 2;

  // 头部位置计算
  const headCenterY = 52;
  const headWidth = 38;
  const headHeight = 48;
  const faceY = headCenterY - headHeight / 2 + 8;

  // ---- 发型 SVG ----
  const hairStyles: Record<PortraitHairStyle, string> = {
    short: `
      <ellipse cx="${cx}" cy="${faceY - 2}" rx="${headWidth / 2 + 4}" ry="18" fill="${c.hairColor}"/>
      <ellipse cx="${cx}" cy="${faceY + 8}" rx="${headWidth / 2 + 2}" ry="10" fill="${c.hairColor}"/>
    `,
    side_part: `
      <ellipse cx="${cx - 2}" cy="${faceY - 3}" rx="${headWidth / 2 + 5}" ry="20" fill="${c.hairColor}"/>
      <path d="M ${cx - 20} ${faceY - 15} Q ${cx - 25} ${faceY - 5} ${cx - 22} ${faceY + 5}" fill="${c.hairColor}"/>
    `,
    swept_back: `
      <ellipse cx="${cx}" cy="${faceY - 5}" rx="${headWidth / 2 + 3}" ry="16" fill="${c.hairColor}"/>
      <path d="M ${cx - 18} ${faceY - 18} Q ${cx} ${faceY - 25} ${cx + 18} ${faceY - 18}" fill="${c.hairColor}"/>
    `,
    center_part: `
      <path d="M ${cx - 20} ${faceY - 15} Q ${cx - 22} ${faceY} ${cx - 18} ${faceY + 12} L ${cx - 18} ${faceY - 5} Z" fill="${c.hairColor}"/>
      <path d="M ${cx + 20} ${faceY - 15} Q ${cx + 22} ${faceY} ${cx + 18} ${faceY + 12} L ${cx + 18} ${faceY - 5} Z" fill="${c.hairColor}"/>
      <ellipse cx="${cx}" cy="${faceY - 3}" rx="${headWidth / 2 + 3}" ry="14" fill="${c.hairColor}"/>
    `,
    bald: '',
    ponytail: `
      <ellipse cx="${cx}" cy="${faceY - 2}" rx="${headWidth / 2 + 2}" ry="15" fill="${c.hairColor}"/>
      <ellipse cx="${cx}" cy="${faceY + 5}" rx="${headWidth / 2}" ry="8" fill="${c.hairColor}"/>
      <ellipse cx="${cx + 2}" cy="${faceY - 22}" rx="8" ry="6" fill="${c.hairColor}"/>
    `,
    wavy: `
      <ellipse cx="${cx}" cy="${faceY - 3}" rx="${headWidth / 2 + 6}" ry="18" fill="${c.hairColor}"/>
      <ellipse cx="${cx - 16}" cy="${faceY + 5}" rx="8" ry="12" fill="${c.hairColor}"/>
      <ellipse cx="${cx + 16}" cy="${faceY + 5}" rx="8" ry="12" fill="${c.hairColor}"/>
    `,
    bob: `
      <ellipse cx="${cx}" cy="${faceY}" rx="${headWidth / 2 + 5}" ry="22" fill="${c.hairColor}"/>
      <rect x="${cx - 22}" y="${faceY - 8}" width="44" height="30" rx="8" fill="${c.hairColor}"/>
    `,
  };

  // ---- 眼镜 SVG ----
  const glassesStyles: Record<GlassesType, string> = {
    none: '',
    rectangle: `
      <rect x="${cx - 16}" y="${faceY + 18}" width="14" height="10" rx="2" fill="none" stroke="#374151" stroke-width="1.5"/>
      <rect x="${cx + 2}" y="${faceY + 18}" width="14" height="10" rx="2" fill="none" stroke="#374151" stroke-width="1.5"/>
      <line x1="${cx - 2}" y1="${faceY + 23}" x2="${cx + 2}" y2="${faceY + 23}" stroke="#374151" stroke-width="1.5"/>
      <line x1="${cx - 16}" y1="${faceY + 23}" x2="${cx - 22}" y2="${faceY + 20}" stroke="#374151" stroke-width="1.5"/>
      <line x1="${cx + 16}" y1="${faceY + 23}" x2="${cx + 22}" y2="${faceY + 20}" stroke="#374151" stroke-width="1.5"/>
    `,
    round: `
      <circle cx="${cx - 9}" cy="${faceY + 22}" r="7" fill="none" stroke="#374151" stroke-width="1.5"/>
      <circle cx="${cx + 9}" cy="${faceY + 22}" r="7" fill="none" stroke="#374151" stroke-width="1.5"/>
      <line x1="${cx - 2}" y1="${faceY + 22}" x2="${cx + 2}" y2="${faceY + 22}" stroke="#374151" stroke-width="1.5"/>
    `,
    aviator: `
      <path d="M ${cx - 18} ${faceY + 20} Q ${cx - 10} ${faceY + 15} ${cx - 2} ${faceY + 22}" fill="none" stroke="#374151" stroke-width="1.5"/>
      <path d="M ${cx + 18} ${faceY + 20} Q ${cx + 10} ${faceY + 15} ${cx + 2} ${faceY + 22}" fill="none" stroke="#374151" stroke-width="1.5"/>
      <line x1="${cx - 2}" y1="${faceY + 22}" x2="${cx + 2}" y2="${faceY + 22}" stroke="#374151" stroke-width="1.5"/>
    `,
  };

  // ---- 表情（眉毛和嘴巴）----
  const eyeY = faceY + 18;
  const expressions: Record<ExpressionType, { brows: string; mouth: string }> = {
    neutral: {
      brows: `
        <path d="M ${cx - 12} ${eyeY - 5} Q ${cx - 8} ${eyeY - 7} ${cx - 4} ${eyeY - 5}" fill="none" stroke="${c.hairColor}" stroke-width="1.2" stroke-linecap="round"/>
        <path d="M ${cx + 4} ${eyeY - 5} Q ${cx + 8} ${eyeY - 7} ${cx + 12} ${eyeY - 5}" fill="none" stroke="${c.hairColor}" stroke-width="1.2" stroke-linecap="round"/>
      `,
      mouth: `<line x1="${cx - 6}" y1="${faceY + 35}" x2="${cx + 6}" y2="${faceY + 35}" stroke="#b08968" stroke-width="1.5" stroke-linecap="round"/>`,
    },
    smile: {
      brows: `
        <path d="M ${cx - 12} ${eyeY - 4} Q ${cx - 8} ${eyeY - 6} ${cx - 4} ${eyeY - 5}" fill="none" stroke="${c.hairColor}" stroke-width="1.2" stroke-linecap="round"/>
        <path d="M ${cx + 4} ${eyeY - 5} Q ${cx + 8} ${eyeY - 6} ${cx + 12} ${eyeY - 4}" fill="none" stroke="${c.hairColor}" stroke-width="1.2" stroke-linecap="round"/>
      `,
      mouth: `<path d="M ${cx - 8} ${faceY + 33} Q ${cx} ${faceY + 40} ${cx + 8} ${faceY + 33}" fill="none" stroke="#c97b6a" stroke-width="1.8" stroke-linecap="round"/>`,
    },
    confident: {
      brows: `
        <path d="M ${cx - 12} ${eyeY - 3} Q ${cx - 8} ${eyeY - 8} ${cx - 4} ${eyeY - 6}" fill="none" stroke="${c.hairColor}" stroke-width="1.3" stroke-linecap="round"/>
        <path d="M ${cx + 4} ${eyeY - 6} Q ${cx + 8} ${eyeY - 8} ${cx + 12} ${eyeY - 3}" fill="none" stroke="${c.hairColor}" stroke-width="1.3" stroke-linecap="round"/>
      `,
      mouth: `<path d="M ${cx - 6} ${faceY + 34} Q ${cx} ${faceY + 38} ${cx + 6} ${faceY + 34}" fill="none" stroke="#b08968" stroke-width="1.6" stroke-linecap="round"/>`,
    },
  };

  // 耳朵
  const ears = `
    <ellipse cx="${cx - headWidth / 2 - 3}" cy="${eyeY + 2}" rx="4" ry="7" fill="${c.skinColor}"/>
    <ellipse cx="${cx + headWidth / 2 + 3}" cy="${eyeY + 2}" rx="4" ry="7" fill="${c.skinColor}"/>
  `;

  // 脖子
  const neck = `
    <rect x="${cx - 12}" y="${headCenterY + headHeight / 2 - 8}" width="24" height="20" fill="${c.skinColor}"/>
    <rect x="${cx - 10}" y="${headCenterY + headHeight / 2 - 5}" width="20" height="15" fill="${c.skinShadow}" opacity="0.3"/>
  `;

  // 衣服（肩部）
  const shoulderY = headCenterY + headHeight / 2 + 8;
  const clothes = c.hasTie ? `
    <!-- 衬衫 -->
    <path d="M ${cx - 35} ${H} Q ${cx - 40} ${shoulderY + 30} ${cx - 22} ${shoulderY} L ${cx - 12} ${shoulderY - 5} L ${cx} ${shoulderY + 5} L ${cx + 12} ${shoulderY - 5} L ${cx + 22} ${shoulderY} Q ${cx + 40} ${shoulderY + 30} ${cx + 35} ${H} Z" fill="${c.shirtColor}"/>
    <!-- 衣领 -->
    <path d="M ${cx - 12} ${shoulderY - 5} L ${cx - 5} ${shoulderY + 15} L ${cx} ${shoulderY + 5} L ${cx + 5} ${shoulderY + 15} L ${cx + 12} ${shoulderY - 5}" fill="white" stroke="${c.shirtGradient}" stroke-width="0.5"/>
    <!-- 领带 -->
    <polygon points="${cx},${shoulderY + 8} ${cx - 4},${shoulderY + 18} ${cx},${shoulderY + 45} ${cx + 4},${shoulderY + 18}" fill="${c.tieColor}"/>
    <rect x="${cx - 5}" y="${shoulderY + 5}" width="10" height="8" rx="1" fill="${c.tieColor}"/>
  ` : `
    <!-- 无领带衬衫 -->
    <path d="M ${cx - 35} ${H} Q ${cx - 40} ${shoulderY + 30} ${cx - 22} ${shoulderY} L ${cx - 10} ${shoulderY - 5} L ${cx} ${shoulderY + 8} L ${cx + 10} ${shoulderY - 5} L ${cx + 22} ${shoulderY} Q ${cx + 40} ${shoulderY + 30} ${cx + 35} ${H} Z" fill="${c.shirtColor}"/>
    <!-- 圆领 -->
    <path d="M ${cx - 10} ${shoulderY - 3} Q ${cx} ${shoulderY + 12} ${cx + 10} ${shoulderY - 3}" fill="none" stroke="${c.shirtGradient}" stroke-width="2"/>
  `;

  // 阴影（颈部下方）
  const shadow = `
    <ellipse cx="${cx}" cy="${shoulderY + 5}" rx="18" ry="4" fill="${c.skinShadow}" opacity="0.15"/>
  `;

  // 组合 SVG
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
    <defs>
      <linearGradient id="bg_${encodeURIComponent(name)}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${c.bgColor}"/>
        <stop offset="100%" stop-color="${c.bgGradient}"/>
      </linearGradient>
      <linearGradient id="skin_${encodeURIComponent(name)}" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="${c.skinHighlight}"/>
        <stop offset="100%" stop-color="${c.skinShadow}"/>
      </linearGradient>
    </defs>
    <!-- 背景 -->
    <rect width="${W}" height="${H}" fill="url(#bg_${encodeURIComponent(name)})"/>
    <!-- 衣服（底层） -->
    ${clothes}
    <!-- 脖子 -->
    ${neck}
    <!-- 阴影 -->
    ${shadow}
    <!-- 耳朵 -->
    ${ears}
    <!-- 头部（椭圆形脸） -->
    <ellipse cx="${cx}" cy="${headCenterY}" rx="${headWidth / 2}" ry="${headHeight / 2}" fill="${c.skinColor}"/>
    <!-- 脸部高光 -->
    <ellipse cx="${cx}" cy="${headCenterY - 5}" rx="${headWidth / 2 - 4}" ry="${headHeight / 2 - 6}" fill="${c.skinHighlight}" opacity="0.15"/>
    <!-- 发型 -->
    ${hairStyles[c.hairStyle]}
    <!-- 眼睛 -->
    <ellipse cx="${cx - 8}" cy="${eyeY}" rx="3" ry="3.5" fill="#1a1a1a"/>
    <ellipse cx="${cx + 8}" cy="${eyeY}" rx="3" ry="3.5" fill="#1a1a1a"/>
    <!-- 眼白高光 -->
    <circle cx="${cx - 7}" cy="${eyeY - 1}" r="1" fill="white"/>
    <circle cx="${cx + 9}" cy="${eyeY - 1}" r="1" fill="white"/>
    <!-- 眉毛 -->
    ${expressions[c.expression].brows}
    <!-- 鼻子（简化的） -->
    <line x1="${cx}" y1="${eyeY + 4}" x2="${cx}" y2="${faceY + 26}" stroke="${c.skinShadow}" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/>
    <!-- 嘴巴 -->
    ${expressions[c.expression].mouth}
    <!-- 眼镜 -->
    ${glassesStyles[c.glasses]}
  </svg>`;

  return svg;
}

// 证件照 SVG 缓存
const _portraitSVGCache = new Map<string, string>();
function getPortraitSVGDataURL(name: string): string {
  const cached = _portraitSVGCache.get(name);
  if (cached) return cached;
  const svg = generatePortraitSVG(name);
  const dataURL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  if (_portraitSVGCache.size >= 500) {
    const firstKey = _portraitSVGCache.keys().next().value;
    if (firstKey) _portraitSVGCache.delete(firstKey);
  }
  _portraitSVGCache.set(name, dataURL);
  return dataURL;
}

// 保留旧的半身立像函数（用于其他地方可能的使用）
function _getHalfBodyChar(name: string): HalfBodyChar {
  const h = _nameHash(name);
  const hairStyles: HalfBodyHairStyle[] = ['short', 'medium', 'long', 'ponytail', 'curly', 'bun'];
  const accessories: AccessoryKind[] = ['none', 'headphone', 'glasses', 'cap', 'scarf', 'tie', 'earring', 'none'];
  const poses: PoseKind[] = ['both_wave', 'arms_crossed', 'hands_on_hips', 'thinking'];
  const skinColors = SKIN_COLORS;
  const hairColors = HAIR_COLORS;
  const shirtIdx = (h >> 6) % SHIRT_COLORS.length;
  return {
    skinColor: skinColors[h % skinColors.length]!,
    hairColor: hairColors[(h >> 3) % hairColors.length]!,
    shirtColor: SHIRT_COLORS[shirtIdx]!.main,
    shirtColorLight: SHIRT_COLORS[shirtIdx]!.light,
    hairStyle: hairStyles[((h * 31) >>> 2) % hairStyles.length]!,
    accessory: accessories[((h * 17) >>> 5) % accessories.length]!,
    pose: poses[((h * 13) >>> 8) % poses.length]!,
    bgDecorKind: (h >> 10) % 4,
  };
}

/** 生成半身立像 SVG（平面卡通风，纯 SVG，无外部请求）*/
function generateHalfBodySVG(name: string): string {
  const pal = _getEmpPalette(name);
  const c = _getHalfBodyChar(name);
  const W = 280, H = 120;
  // 人物中心坐标（偏左，留右侧装饰空间）
  const cx = 110, bottomY = H;

  // 颜色变体
  const skin = c.skinColor;
  const hair = c.hairColor;
  const shirt = c.shirtColor;
  const shirtLight = c.shirtColorLight;
  // 背景色（从调色板）
  const bgFrom = pal.bannerFrom;
  const bgTo = pal.bannerTo;
  const accentColor = pal.px;

  // ---- 背景装饰 SVG 片段 ----
  const bgDecorations = [
    // 0: 圆圈气泡
    `<circle cx="220" cy="25" r="28" fill="${accentColor}" fill-opacity="0.12"/>
     <circle cx="255" cy="65" r="16" fill="${accentColor}" fill-opacity="0.08"/>
     <circle cx="195" cy="70" r="10" fill="${accentColor}" fill-opacity="0.10"/>
     <circle cx="248" cy="18" r="7" fill="${accentColor}" fill-opacity="0.15"/>`,
    // 1: 星形+菱形
    `<polygon points="218,14 221,22 229,22 223,27 225,35 218,30 211,35 213,27 207,22 215,22" fill="${accentColor}" fill-opacity="0.18"/>
     <rect x="240" y="50" width="14" height="14" rx="2" transform="rotate(45,247,57)" fill="${accentColor}" fill-opacity="0.12"/>
     <rect x="195" y="65" width="10" height="10" rx="1" transform="rotate(30,200,70)" fill="${accentColor}" fill-opacity="0.10"/>`,
    // 2: 波点矩阵
    `<circle cx="195" cy="18" r="3.5" fill="${accentColor}" fill-opacity="0.18"/>
     <circle cx="213" cy="18" r="3.5" fill="${accentColor}" fill-opacity="0.14"/>
     <circle cx="231" cy="18" r="3.5" fill="${accentColor}" fill-opacity="0.18"/>
     <circle cx="249" cy="18" r="3.5" fill="${accentColor}" fill-opacity="0.12"/>
     <circle cx="195" cy="36" r="3.5" fill="${accentColor}" fill-opacity="0.12"/>
     <circle cx="213" cy="36" r="3.5" fill="${accentColor}" fill-opacity="0.18"/>
     <circle cx="231" cy="36" r="3.5" fill="${accentColor}" fill-opacity="0.14"/>
     <circle cx="249" cy="36" r="3.5" fill="${accentColor}" fill-opacity="0.18"/>
     <circle cx="204" cy="60" r="3" fill="${accentColor}" fill-opacity="0.10"/>
     <circle cx="222" cy="60" r="3" fill="${accentColor}" fill-opacity="0.10"/>
     <circle cx="240" cy="60" r="3" fill="${accentColor}" fill-opacity="0.10"/>`,
    // 3: 几何线条
    `<line x1="190" y1="10" x2="260" y2="80" stroke="${accentColor}" stroke-opacity="0.12" stroke-width="1.5"/>
     <line x1="200" y1="10" x2="270" y2="80" stroke="${accentColor}" stroke-opacity="0.08" stroke-width="1"/>
     <circle cx="230" cy="45" r="22" fill="none" stroke="${accentColor}" stroke-opacity="0.14" stroke-width="1.5"/>
     <circle cx="230" cy="45" r="34" fill="none" stroke="${accentColor}" stroke-opacity="0.07" stroke-width="1"/>`,
  ];
  const bgDecor = bgDecorations[c.bgDecorKind] ?? bgDecorations[0]!;

  // ---- 发型 SVG 片段 ----
  // 头部：椭圆形，底部 y=bottomY-42，顶部 y=bottomY-42-38=bottomY-80
  const headCY = bottomY - 55;  // 头部中心y
  const headRX = 16, headRY = 19;
  const headTopY = headCY - headRY;

  const hairShapes: Record<HalfBodyHairStyle, string> = {
    short: `<rect x="${cx - 16}" y="${headTopY - 3}" width="32" height="14" rx="8" fill="${hair}"/>`,
    medium: `<rect x="${cx - 18}" y="${headTopY - 4}" width="36" height="16" rx="9" fill="${hair}"/>
             <rect x="${cx - 19}" y="${headCY - 10}" width="7" height="16" rx="4" fill="${hair}"/>
             <rect x="${cx + 12}" y="${headCY - 10}" width="7" height="16" rx="4" fill="${hair}"/>`,
    long: `<rect x="${cx - 19}" y="${headTopY - 4}" width="38" height="16" rx="10" fill="${hair}"/>
           <rect x="${cx - 22}" y="${headCY - 8}" width="8" height="28" rx="4" fill="${hair}"/>
           <rect x="${cx + 14}" y="${headCY - 8}" width="8" height="28" rx="4" fill="${hair}"/>`,
    ponytail: `<rect x="${cx - 15}" y="${headTopY - 3}" width="30" height="12" rx="7" fill="${hair}"/>
               <rect x="${cx - 3}" y="${headTopY - 14}" width="8" height="18" rx="4" fill="${hair}"/>`,
    curly: `<ellipse cx="${cx}" cy="${headTopY - 2}" rx="18" ry="9" fill="${hair}"/>
            <ellipse cx="${cx - 15}" cy="${headTopY + 6}" rx="7" ry="8" fill="${hair}"/>
            <ellipse cx="${cx + 15}" cy="${headTopY + 6}" rx="7" ry="8" fill="${hair}"/>`,
    bun: `<rect x="${cx - 14}" y="${headTopY - 2}" width="28" height="11" rx="7" fill="${hair}"/>
          <circle cx="${cx}" cy="${headTopY - 9}" r="9" fill="${hair}"/>`,
  };
  const hairSVG = hairShapes[c.hairStyle] ?? hairShapes.short;

  // ---- 配饰 SVG 片段 ----
  const accessoryShapes: Record<AccessoryKind, string> = {
    none: '',
    headphone: `<rect x="${cx - 22}" y="${headCY - 14}" width="6" height="12" rx="3" fill="#374151"/>
                <rect x="${cx + 16}" y="${headCY - 14}" width="6" height="12" rx="3" fill="#374151"/>
                <path d="M ${cx - 19} ${headCY - 14} Q ${cx} ${headTopY - 16} ${cx + 19} ${headCY - 14}" fill="none" stroke="#374151" stroke-width="3"/>`,
    glasses: `<rect x="${cx - 18}" y="${headCY - 4}" width="14" height="9" rx="4" fill="none" stroke="#374151" stroke-width="1.5"/>
              <rect x="${cx + 4}" y="${headCY - 4}" width="14" height="9" rx="4" fill="none" stroke="#374151" stroke-width="1.5"/>
              <line x1="${cx - 4}" y1="${headCY}" x2="${cx + 4}" y2="${headCY}" stroke="#374151" stroke-width="1.5"/>`,
    cap: `<ellipse cx="${cx}" cy="${headTopY + 6}" rx="20" ry="6" fill="${hair}"/>
          <rect x="${cx - 18}" y="${headTopY - 8}" width="36" height="16" rx="4" fill="${accentColor}"/>
          <rect x="${cx - 20}" y="${headTopY + 2}" width="6" height="4" rx="2" fill="${accentColor}" fill-opacity="0.7"/>`,
    scarf: `<rect x="${cx - 18}" y="${headCY + 14}" width="36" height="10" rx="3" fill="${accentColor}" fill-opacity="0.85"/>
            <rect x="${cx - 5}" y="${headCY + 14}" width="12" height="20" rx="3" fill="${accentColor}" fill-opacity="0.7"/>`,
    tie: `<polygon points="${cx},${headCY+20} ${cx-5},${headCY+28} ${cx},${headCY+46} ${cx+5},${headCY+28}" fill="${accentColor}"/>`,
    earring: `<circle cx="${cx - 17}" cy="${headCY + 8}" r="3" fill="${accentColor}"/>
              <circle cx="${cx + 17}" cy="${headCY + 8}" r="3" fill="${accentColor}"/>`,
  };
  const accessorySVG = accessoryShapes[c.accessory] ?? '';

  // ---- 姿势（手臂）SVG 片段 ----
  // 肩膀连接点：左肩 (cx-22, shoulderY-14)，右肩 (cx+22, shoulderY-14)
  const shoulderY = bottomY - 22;
  const poseShapes: Record<PoseKind, string> = {
    // 双手挥手：两臂都向斜上方高举
    both_wave: `
      <path d="M ${cx - 22} ${shoulderY - 14} Q ${cx - 40} ${shoulderY - 32} ${cx - 34} ${shoulderY - 48}" fill="none" stroke="${skin}" stroke-width="10" stroke-linecap="round"/>
      <path d="M ${cx + 22} ${shoulderY - 14} Q ${cx + 40} ${shoulderY - 32} ${cx + 34} ${shoulderY - 48}" fill="none" stroke="${skin}" stroke-width="10" stroke-linecap="round"/>
      <ellipse cx="${cx - 32}" cy="${shoulderY - 50}" rx="7" ry="6" fill="${skin}"/>
      <ellipse cx="${cx + 32}" cy="${shoulderY - 50}" rx="7" ry="6" fill="${skin}"/>`,
    // 双手交叉：左手搭右肩，右手搭左肩
    arms_crossed: `
      <path d="M ${cx - 22} ${shoulderY - 14} Q ${cx - 4} ${shoulderY + 2} ${cx + 20} ${shoulderY - 6}" fill="none" stroke="${skin}" stroke-width="10" stroke-linecap="round"/>
      <path d="M ${cx + 22} ${shoulderY - 14} Q ${cx + 4} ${shoulderY + 2} ${cx - 20} ${shoulderY - 6}" fill="none" stroke="${skin}" stroke-width="10" stroke-linecap="round"/>`,
    // 叉腰：双臂向外弯折，肘部向外，手放腰侧
    hands_on_hips: `
      <path d="M ${cx - 22} ${shoulderY - 12} Q ${cx - 38} ${shoulderY - 6} ${cx - 34} ${shoulderY + 12}" fill="none" stroke="${skin}" stroke-width="10" stroke-linecap="round"/>
      <path d="M ${cx + 22} ${shoulderY - 12} Q ${cx + 38} ${shoulderY - 6} ${cx + 34} ${shoulderY + 12}" fill="none" stroke="${skin}" stroke-width="10" stroke-linecap="round"/>
      <ellipse cx="${cx - 32}" cy="${shoulderY + 14}" rx="7" ry="5" fill="${skin}"/>
      <ellipse cx="${cx + 32}" cy="${shoulderY + 14}" rx="7" ry="5" fill="${skin}"/>`,
    // 托腮：右臂弯曲，手撑向脸侧；左臂自然垂下
    thinking: `
      <path d="M ${cx + 22} ${shoulderY - 14} Q ${cx + 30} ${shoulderY - 26} ${cx + 18} ${headCY + 16}" fill="none" stroke="${skin}" stroke-width="10" stroke-linecap="round"/>
      <ellipse cx="${cx + 16}" cy="${headCY + 18}" rx="8" ry="6" fill="${skin}"/>
      <path d="M ${cx - 22} ${shoulderY - 12} Q ${cx - 26} ${shoulderY + 2} ${cx - 24} ${shoulderY + 16}" fill="none" stroke="${skin}" stroke-width="10" stroke-linecap="round"/>`,
  };
  const poseSVG = poseShapes[c.pose] ?? poseShapes.both_wave;

  // ---- 身体（衬衫）----
  const bodySVG = `
    <!-- 衬衫身体 -->
    <path d="M ${cx - 28} ${shoulderY} Q ${cx - 32} ${shoulderY - 6} ${cx - 18} ${shoulderY - 18} L ${cx - 8} ${shoulderY - 14} L ${cx} ${shoulderY - 8} L ${cx + 8} ${shoulderY - 14} L ${cx + 18} ${shoulderY - 18} Q ${cx + 32} ${shoulderY - 6} ${cx + 28} ${shoulderY} L ${cx + 28} ${bottomY} L ${cx - 28} ${bottomY} Z" fill="${shirt}"/>
    <!-- 衣领 -->
    <path d="M ${cx - 8} ${shoulderY - 14} L ${cx} ${shoulderY - 4} L ${cx + 8} ${shoulderY - 14}" fill="${shirtLight}" stroke="${shirtLight}" stroke-width="1"/>
    <!-- 衬衫翻领细节 -->
    <path d="M ${cx - 8} ${shoulderY - 14} L ${cx - 4} ${shoulderY - 6}" fill="none" stroke="${shirtLight}" stroke-opacity="0.6" stroke-width="1.5"/>
    <path d="M ${cx + 8} ${shoulderY - 14} L ${cx + 4} ${shoulderY - 6}" fill="none" stroke="${shirtLight}" stroke-opacity="0.6" stroke-width="1.5"/>
  `;

  // ---- 脸部五官 ----
  const eyeY = headCY - 2;
  const faceFeatures = `
    <!-- 眼睛 -->
    <ellipse cx="${cx - 5}" cy="${eyeY}" rx="2.8" ry="3.2" fill="#1a1a1a"/>
    <ellipse cx="${cx + 5}" cy="${eyeY}" rx="2.8" ry="3.2" fill="#1a1a1a"/>
    <!-- 眼白高光 -->
    <circle cx="${cx - 4.2}" cy="${eyeY - 1.2}" r="0.9" fill="white"/>
    <circle cx="${cx + 5.8}" cy="${eyeY - 1.2}" r="0.9" fill="white"/>
    <!-- 眉毛 -->
    <path d="M ${cx - 8} ${eyeY - 6} Q ${cx - 5} ${eyeY - 8} ${cx - 2} ${eyeY - 6}" fill="none" stroke="${hair}" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M ${cx + 2} ${eyeY - 6} Q ${cx + 5} ${eyeY - 8} ${cx + 8} ${eyeY - 6}" fill="none" stroke="${hair}" stroke-width="1.8" stroke-linecap="round"/>
    <!-- 微笑 -->
    <path d="M ${cx - 5} ${headCY + 8} Q ${cx} ${headCY + 13} ${cx + 5} ${headCY + 8}" fill="none" stroke="#c97b6a" stroke-width="1.8" stroke-linecap="round"/>
  `;

  // ---- 组合 SVG ----
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <linearGradient id="bg_${encodeURIComponent(name)}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${bgFrom}"/>
      <stop offset="100%" stop-color="${bgTo}"/>
    </linearGradient>
  </defs>
  <!-- 背景 -->
  <rect width="${W}" height="${H}" fill="url(#bg_${encodeURIComponent(name)})"/>
  <!-- 背景装饰 -->
  ${bgDecor}
  <!-- 手臂（在身体下方渲染，部分被覆盖） -->
  ${poseSVG}
  <!-- 身体 -->
  ${bodySVG}
  <!-- 配饰（围巾等在头部下方） -->
  ${c.accessory === 'scarf' ? accessorySVG : ''}
  <!-- 头部 -->
  <ellipse cx="${cx}" cy="${headCY}" rx="${headRX}" ry="${headRY}" fill="${skin}"/>
  <!-- 发型 -->
  ${hairSVG}
  <!-- 脸部 -->
  ${faceFeatures}
  <!-- 其他配饰（在发型/头部上方） -->
  ${c.accessory !== 'scarf' ? accessorySVG : ''}
</svg>`;
  return svgContent;
}

// 半身立像 SVG 缓存
const _halfBodySVGCache = new Map<string, string>();
function getHalfBodySVGDataURL(name: string): string {
  const cached = _halfBodySVGCache.get(name);
  if (cached) return cached;
  const svg = generateHalfBodySVG(name);
  const dataURL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  if (_halfBodySVGCache.size >= 500) {
    const firstKey = _halfBodySVGCache.keys().next().value;
    if (firstKey) _halfBodySVGCache.delete(firstKey);
  }
  _halfBodySVGCache.set(name, dataURL);
  return dataURL;
}
</script>

<template>
  <div class="employees-page">
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
      <!-- 标题区域 -->
      <div class="overview-header">
        <div class="overview-header__content">
          <h1 class="overview-header__title">组织架构总览</h1>
          <p class="overview-header__subtitle">
            {{ departments.length }} 个部门 · {{ totalHumanCount }} 名员工 · {{ employees.length }} 名数字员工
          </p>
        </div>
        <button class="overview-create-btn" @click="showCreator = true; resetForm()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          创建员工
        </button>
      </div>

      <!-- 紧凑统计区 -->
      <div class="overview-stats">
        <!-- 数字员工概况 -->
        <div class="overview-stats__card overview-stats__card--digital">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="overview-stats__icon">
            <rect x="3" y="8" width="18" height="12" rx="2"/>
            <circle cx="9" cy="14" r="1.5"/>
            <circle cx="15" cy="14" r="1.5"/>
            <path d="M12 4v4"/>
            <circle cx="12" cy="3" r="1"/>
          </svg>
          <div class="overview-stats__body">
            <div class="overview-stats__value">{{ employees.length }} <span class="overview-stats__unit">数字员工</span></div>
            <div class="overview-stats__meta">
              <span>覆盖率 {{ digitalEmployeeCoverage }}%</span>
              <span>今日活跃 {{ activeDigitalEmployees }}</span>
            </div>
          </div>
        </div>

        <!-- 真人员工 -->
        <div class="overview-stats__card overview-stats__card--human">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="overview-stats__icon">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          <div class="overview-stats__body">
            <div class="overview-stats__value overview-stats__value--dark">{{ totalHumanCount }} <span class="overview-stats__unit">真人员工</span></div>
            <div class="overview-stats__meta overview-stats__meta--muted">分布在 {{ departments.length }} 个部门</div>
          </div>
        </div>

        <!-- 人机比例 -->
        <div class="overview-stats__card overview-stats__card--ratio">
          <div class="overview-stats__label">人机协作比例</div>
          <div class="overview-stats__ratio-bar">
            <div class="overview-stats__ratio-human" :style="{ width: totalHumanCount + employees.length > 0 ? (totalHumanCount / (totalHumanCount + employees.length) * 100) + '%' : '0%' }">
              真人 {{ totalHumanCount + employees.length > 0 ? Math.round(totalHumanCount / (totalHumanCount + employees.length) * 100) : 0 }}%
            </div>
            <div class="overview-stats__ratio-ai">AI</div>
          </div>
          <div class="overview-stats__ratio-labels">
            <span>{{ totalHumanCount }} 人</span>
            <span>{{ employees.length }} 数字员工</span>
          </div>
        </div>
      </div>

      <div class="overflow-x-auto pb-8">
        <div class="org-chart-root">
          <!-- 根节点 -->
          <div class="org-root-wrapper">
            <div class="org-root-card">
              <div class="org-root-card__header">
                <div class="org-root-card__icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M3 21h18"/>
                    <path d="M5 21V7l8-4v18"/>
                    <path d="M19 21V11l-6-4"/>
                    <path d="M9 9h1"/>
                    <path d="M9 13h1"/>
                    <path d="M9 17h1"/>
                  </svg>
                </div>
                <div class="org-root-card__company">数字重庆政务科技有限公司</div>
              </div>
              <div class="org-root-card__footer">
                <div class="org-root-stat">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                  <div class="org-root-stat__text">
                    <span class="org-root-stat__value">{{ totalHumanCount }}</span>
                    <span class="org-root-stat__label">真人</span>
                  </div>
                </div>
                <div class="org-root-stat org-root-stat--accent">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="8" width="18" height="12" rx="2"/>
                    <circle cx="9" cy="14" r="1"/>
                    <circle cx="15" cy="14" r="1"/>
                  </svg>
                  <div class="org-root-stat__text">
                    <span class="org-root-stat__value">{{ employees.length }}</span>
                    <span class="org-root-stat__label">数字员工</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-if="orgChartTree.length > 0" class="org-v-line" />
          <div v-if="orgChartTree.length > 0" class="org-h-rail">
            <div class="org-h-rail__line" />
          </div>

          <div v-if="orgChartTree.length > 0" class="org-dept-row">
            <div v-for="(node, nodeIdx) in orgChartTree" :key="node.id" class="org-dept-col">
              <div class="org-v-line org-v-line--short" />
              <!-- 一级部门卡片 -->
              <div
                class="org-dept-card"
                :class="{ 'org-dept-card--selected': selectedDeptId === node.id && viewMode === 'list', 'org-dept-card--expanded': isDeptExpanded(node.id) }"
                :style="{ '--dept-color': deptColors[nodeIdx % deptColors.length] }"
                @click="handleDeptCardClick(node)"
              >
                <!-- 部门图标和名称 -->
                <div class="org-dept-card__header">
                  <div class="org-dept-card__icon">
                    <svg v-if="deptIcons[nodeIdx % deptIcons.length] === 'code'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <polyline points="16 18 22 12 16 6"/>
                      <polyline points="8 6 2 12 8 18"/>
                    </svg>
                    <svg v-else-if="deptIcons[nodeIdx % deptIcons.length] === 'box'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <rect x="3" y="3" width="18" height="18" rx="2"/>
                      <path d="M12 8v8"/>
                      <path d="M8 12h8"/>
                    </svg>
                    <svg v-else-if="deptIcons[nodeIdx % deptIcons.length] === 'chart'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <path d="M21.21 15.89A10 10 0 1 1 8 2.83"/>
                      <path d="M22 12A10 10 0 0 0 12 2v10z"/>
                    </svg>
                    <svg v-else-if="deptIcons[nodeIdx % deptIcons.length] === 'activity'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                    </svg>
                    <svg v-else-if="deptIcons[nodeIdx % deptIcons.length] === 'users'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                      <circle cx="9" cy="7" r="4"/>
                      <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
                      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                    <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <line x1="12" y1="1" x2="12" y2="23"/>
                      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                    </svg>
                  </div>
                  <div class="org-dept-card__title-row">
                    <span class="org-dept-card__name">{{ node.name }}</span>
                    <span v-if="node.children.length > 0" class="org-dept-card__subcount">{{ node.children.length }} 个子部门</span>
                    <button
                      v-if="node.children.length > 0"
                      class="org-dept-card__expand-btn"
                      @click="toggleDeptExpand(node.id, $event)"
                    >
                      <svg v-if="!isDeptExpanded(node.id)" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                      <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="18 15 12 9 6 15"/>
                      </svg>
                    </button>
                  </div>
                </div>

                <!-- 人数统计 -->
                <div class="org-dept-card__stats">
                  <div class="org-dept-stat org-dept-stat--human">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                      <circle cx="12" cy="7" r="4"/>
                    </svg>
                    <span class="org-dept-stat__value">{{ node.humanCount }}</span>
                    <span class="org-dept-stat__label">真人</span>
                  </div>
                  <div class="org-dept-stat org-dept-stat--digital">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="3" y="8" width="18" height="12" rx="2"/>
                      <circle cx="9" cy="14" r="1"/>
                      <circle cx="15" cy="14" r="1"/>
                    </svg>
                    <span class="org-dept-stat__value">{{ node.digitalCount }}</span>
                    <span class="org-dept-stat__label">数字</span>
                  </div>
                </div>

                <!-- 比例条 -->
                <div class="org-dept-card__ratio">
                  <div class="org-dept-card__ratio-bar">
                    <div
                      class="org-dept-card__ratio-human"
                      :style="{ width: (node.humanCount + node.digitalCount) > 0 ? (node.humanCount / (node.humanCount + node.digitalCount) * 100) + '%' : '0%' }"
                    ></div>
                    <div
                      class="org-dept-card__ratio-digital"
                      :style="{ width: (node.humanCount + node.digitalCount) > 0 ? (node.digitalCount / (node.humanCount + node.digitalCount) * 100) + '%' : '0%' }"
                    ></div>
                  </div>
                  <div class="org-dept-card__ratio-labels">
                    <span>{{ (node.humanCount + node.digitalCount) > 0 ? Math.round(node.humanCount / (node.humanCount + node.digitalCount) * 100) : 0 }}% 真人</span>
                    <span>{{ (node.humanCount + node.digitalCount) > 0 ? Math.round(node.digitalCount / (node.humanCount + node.digitalCount) * 100) : 0 }}% 数字员工</span>
                  </div>
                </div>
              </div>

              <!-- 子部门（可展开/收起） -->
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
                          :style="{ '--dept-color': deptColors[Math.abs(child.id.charCodeAt(0)) % deptColors.length] }"
                          @click="handleSelectDept(child.id)"
                        >
                          <div class="org-dept-card__header">
                            <div class="org-dept-card__title-row">
                              <span class="org-dept-card__name">{{ child.name }}</span>
                            </div>
                          </div>
                          <div class="org-dept-card__stats">
                            <div class="org-dept-stat org-dept-stat--human">
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                                <circle cx="12" cy="7" r="4"/>
                              </svg>
                              <span class="org-dept-stat__value">{{ child.humanCount }}</span>
                              <span class="org-dept-stat__label">真人</span>
                            </div>
                            <div class="org-dept-stat org-dept-stat--digital">
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="8" width="18" height="12" rx="2"/>
                                <circle cx="9" cy="14" r="1"/>
                                <circle cx="15" cy="14" r="1"/>
                              </svg>
                              <span class="org-dept-stat__value">{{ child.digitalCount }}</span>
                              <span class="org-dept-stat__label">数字</span>
                            </div>
                          </div>
                          <div class="org-dept-card__ratio">
                            <div class="org-dept-card__ratio-bar">
                              <div
                                class="org-dept-card__ratio-human"
                                :style="{ width: (child.humanCount + child.digitalCount) > 0 ? (child.humanCount / (child.humanCount + child.digitalCount) * 100) + '%' : '0%' }"
                              ></div>
                              <div
                                class="org-dept-card__ratio-digital"
                                :style="{ width: (child.humanCount + child.digitalCount) > 0 ? (child.digitalCount / (child.humanCount + child.digitalCount) * 100) + '%' : '0%' }"
                              ></div>
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

    <!-- ===== 员工列表视图 ===== -->
    <template v-else>
    <div class="employee-list-view">
    <!-- Header -->
    <div class="list-header">
      <div class="list-header__content">
        <span class="list-header__badge">员工管理</span>
        <h1 class="list-header__title">
          {{ selectedDeptName }}
          <span v-if="selectedDeptId" class="list-header__subtitle">· 员工中心</span>
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
    <Teleport to="body">
      <Transition name="slide-over">
        <div v-if="showCreator" class="fixed inset-0 z-50 flex justify-end">
          <div class="absolute inset-0 bg-foreground/20 backdrop-blur-sm" @click="showCreator = false" />
          <div class="slide-over-panel relative w-full max-w-md overflow-y-auto bg-card shadow-2xl">
            <div class="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/95 px-6 py-4 backdrop-blur-sm">
              <div>
                <span class="section-label">新建员工</span>
                <h2 class="mt-0.5 text-lg font-semibold">三步创建</h2>
              </div>
              <button class="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" @click="showCreator = false">
                <X class="h-5 w-5" :stroke-width="1.8" />
              </button>
            </div>

            <div class="p-6">
              <!-- Step Tabs -->
              <div class="mb-6 flex gap-2">
                <button
                  v-for="(s, i) in steps"
                  :key="s.title"
                  type="button"
                  class="flex flex-1 flex-col items-center gap-1 rounded-lg p-2.5 text-center transition-all"
                  :class="step === i ? 'bg-primary/5 ring-1 ring-primary/20' : 'hover:bg-muted/50'"
                  @click="step = i"
                >
                  <span
                    class="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold"
                    :class="step === i ? 'bg-primary text-primary-foreground' : step > i ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'"
                  >{{ i + 1 }}</span>
                  <span class="text-[11px] font-medium" :class="step === i ? 'text-foreground' : 'text-muted-foreground'">{{ s.title }}</span>
                </button>
              </div>

              <!-- Form -->
              <form class="space-y-4" @submit.prevent="step === steps.length - 1 ? createEmployee() : nextStep()">
                <!-- Step 0: 基础信息 -->
                <div v-if="step === 0" class="space-y-3">
                  <label class="block space-y-1.5">
                    <span class="text-sm font-medium">名称 <span class="text-destructive">*</span></span>
                    <input
                      v-model="form.name"
                      required
                      placeholder="例如：项目管理助手"
                      class="input-field"
                      :class="touched.name && !form.name.trim() && 'border-destructive/50 focus:border-destructive focus:ring-destructive/10'"
                      @blur="touched.name = true"
                    />
                    <p v-if="touched.name && !form.name.trim()" class="text-xs text-destructive">请输入名称</p>
                    <p class="text-[11px] text-muted-foreground">给这位员工起一个容易识别的名字</p>
                  </label>
                  <label class="block space-y-1.5">
                    <span class="text-sm font-medium">所属部门 <span class="text-destructive">*</span></span>
                    <select v-model="form.departmentId" class="input-field" :class="touched.departmentId && !form.departmentId && 'border-destructive/50 focus:border-destructive focus:ring-destructive/10'" @change="touched.departmentId = true">
                      <option :value="null">— 请选择部门 —</option>
                      <option v-for="opt in deptTreeOptions" :key="opt.id" :value="opt.id">{{ opt.label }}</option>
                    </select>
                    <p v-if="touched.departmentId && !form.departmentId" class="text-xs text-destructive">请选择所属部门</p>
                    <p v-else class="text-[11px] text-muted-foreground">将员工归入某个组织部门</p>
                  </label>
                  <label class="block space-y-1.5">
                    <span class="text-sm font-medium">编码<span class="ml-1 text-xs text-muted-foreground">可选</span></span>
                    <input v-model="form.code" placeholder="默认按名称自动生成" class="input-field" />
                    <p class="text-[11px] text-muted-foreground">系统内唯一标识，留空则自动生成</p>
                  </label>
                  <label class="block space-y-1.5">
                    <span class="text-sm font-medium">职责描述</span>
                    <textarea v-model="form.description" rows="2" placeholder="描述它负责哪些业务结果…" class="input-field" />
                    <p class="text-[11px] text-muted-foreground">帮助团队理解这位员工的核心职责</p>
                  </label>
                  <label class="block space-y-1.5">
                    <span class="text-sm font-medium">角色设定</span>
                    <textarea v-model="form.systemPrompt" rows="4" placeholder="定义角色人格、行为风格、输出边界和工作原则…" class="input-field" />
                    <p class="text-[11px] text-muted-foreground">定义这位员工的性格特征、行为准则和工作方式</p>
                  </label>
                </div>

                <!-- Step 1: 工作设定 -->
                <div v-else-if="step === 1" class="space-y-3">
                  <label class="block space-y-1.5">
                    <span class="text-sm font-medium">使用模型</span>
                    <input v-model="form.model" placeholder="留空使用系统默认模型" class="input-field" list="model-suggestions" />
                    <datalist id="model-suggestions">
                      <option value="openai/gpt-4.1" />
                      <option value="openai/gpt-4.1-mini" />
                      <option value="openai/gpt-4.1-nano" />
                      <option value="openai/o3" />
                      <option value="openai/o4-mini" />
                      <option value="anthropic/claude-sonnet-4-20250514" />
                      <option value="anthropic/claude-haiku-3.5" />
                    </datalist>
                    <p class="text-[11px] text-muted-foreground">指定该员工使用的 AI 模型，格式为 <code class="rounded bg-muted px-1 py-0.5 text-[10px]">provider/model</code></p>
                  </label>

                  <label class="block space-y-1.5">
                    <span class="text-sm font-medium">服务对象</span>
                    <textarea v-model="form.userContent" rows="3" placeholder="名称、称呼方式、时区、关注重点…" class="input-field" />
                    <p class="text-[11px] text-muted-foreground">描述这位员工服务的用户或团队，帮助它更好地理解上下文</p>
                  </label>

                  <label class="block space-y-1.5">
                    <span class="text-sm font-medium">心跳巡检内容</span>
                    <textarea v-model="form.heartbeatContent" rows="3" placeholder="定期检查的事项，如监控指标、待办进度、数据同步状态…" class="input-field" />
                    <p class="text-[11px] text-muted-foreground">心跳模式下，员工会按周期执行这些检查任务</p>
                  </label>

                  <button
                    type="button"
                    class="flex w-full items-center gap-1.5 rounded-lg px-1 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    @click="showAdvanced = !showAdvanced"
                  >
                    <ChevronDown class="h-3.5 w-3.5 transition-transform" :class="showAdvanced && 'rotate-180'" />
                    {{ showAdvanced ? '收起高级设定' : '展开高级设定' }}
                  </button>

                  <template v-if="showAdvanced">
                    <label class="block space-y-1.5">
                      <span class="text-sm font-medium">启动任务</span>
                      <textarea v-model="form.bootContent" rows="3" placeholder="员工启动时自动执行的指令，如发送问候、读取最新数据…" class="input-field" />
                      <p class="text-[11px] text-muted-foreground">每次启动时首先执行的操作清单</p>
                    </label>

                    <label class="block space-y-1.5">
                      <span class="text-sm font-medium">操作规则</span>
                      <textarea v-model="form.agentsContent" rows="4" placeholder="自定义工作规则：记忆管理、安全策略、沟通方式…" class="input-field" />
                      <p class="text-[11px] text-muted-foreground">覆盖或补充默认的工作行为规范</p>
                    </label>
                  </template>
                </div>

                <!-- Step 2: 能力配置 -->
                <div v-else-if="step === 2" class="space-y-3">
                  <div class="flex items-start gap-2 rounded-lg bg-primary/5 p-3 text-sm text-primary">
                    <Sparkles class="mt-0.5 h-4 w-4 shrink-0" :stroke-width="1.8" />
                    <p>优先选择已启用且职责明确的技能。</p>
                  </div>
                  <label
                    v-for="skill in skills"
                    :key="skill.name"
                    class="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 transition-all hover:bg-muted/30"
                    :class="form.skillNames.includes(skill.name) && 'border-primary/30 bg-primary/5'"
                  >
                    <input v-model="form.skillNames" type="checkbox" :value="skill.name" class="mt-0.5 h-4 w-4 accent-primary" />
                    <div class="min-w-0">
                      <div class="flex items-center gap-2">
                        <p class="text-sm font-medium">{{ skill.name }}</p>
                        <span class="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{{ skill.categoryLabel }}</span>
                      </div>
                      <p class="mt-0.5 text-xs text-muted-foreground">{{ skill.purpose }}</p>
                    </div>
                  </label>
                </div>

                <!-- Step 3: 自动任务 -->
                <div v-else class="space-y-3">
                  <div class="grid gap-2">
                    <label
                      v-for="opt in [
                        { value: 'cron', title: '每日定时', desc: '适合日报、巡检、总结和推送' },
                        { value: 'every', title: '固定间隔', desc: '适合持续巡检或短周期同步' },
                        { value: 'heartbeat', title: '心跳巡检', desc: '适合轻量检查和持续状态感知' }
                      ]"
                      :key="opt.value"
                      class="flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 transition-all"
                      :class="form.scheduleKind === opt.value ? 'border-primary/30 bg-primary/5' : 'border-border hover:bg-muted/30'"
                    >
                      <input v-model="form.scheduleKind" type="radio" :value="opt.value" class="mt-0.5 h-4 w-4 accent-primary" />
                      <div>
                        <p class="text-sm font-medium">{{ opt.title }}</p>
                        <p class="text-xs text-muted-foreground">{{ opt.desc }}</p>
                      </div>
                    </label>
                  </div>
                  <label v-if="form.scheduleKind === 'cron'" class="block space-y-1.5">
                    <span class="text-sm font-medium">Cron 表达式</span>
                    <input v-model="form.cronExpr" class="input-field font-mono" />
                  </label>
                  <label v-else class="block space-y-1.5">
                    <span class="text-sm font-medium">间隔毫秒</span>
                    <input v-model.number="form.everyMs" type="number" min="1000" class="input-field" />
                  </label>
                </div>

                <p v-if="createError" class="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{{ createError }}</p>

                <div class="flex items-center justify-between gap-2 border-t border-border pt-4">
                  <button v-if="step > 0" type="button" class="btn-ghost" @click="previousStep">
                    <ChevronLeft class="h-3.5 w-3.5" />
                    上一步
                  </button>
                  <span v-else />
                  <button class="btn-primary" :disabled="creating || (step === 0 && !form.name.trim())">
                    {{ step === steps.length - 1 ? (creating ? "创建中..." : "创建并进入工作台") : "下一步" }}
                    <ChevronRight v-if="step < steps.length - 1" class="h-3.5 w-3.5" />
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Editor Slide-over -->
    <Teleport to="body">
      <Transition name="slide-over">
        <div v-if="showEditor" class="fixed inset-0 z-50 flex justify-end">
          <div class="absolute inset-0 bg-foreground/20 backdrop-blur-sm" @click="showEditor = false" />
          <div class="slide-over-panel relative w-full max-w-md overflow-y-auto bg-card shadow-2xl">
            <div class="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/95 px-6 py-4 backdrop-blur-sm">
              <div>
                <span class="section-label">编辑员工</span>
                <h2 class="mt-0.5 text-lg font-semibold">更新员工信息</h2>
              </div>
              <button class="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" @click="showEditor = false">
                <X class="h-5 w-5" :stroke-width="1.8" />
              </button>
            </div>

            <div class="p-6">
              <div v-if="editorLoading" class="rounded-lg bg-muted/50 px-3 py-3 text-sm text-muted-foreground">加载员工信息中...</div>
              <template v-else>
                <!-- Step Tabs -->
                <div class="mb-6 flex gap-2">
                  <button
                    v-for="(s, i) in steps"
                    :key="s.title"
                    type="button"
                    class="flex flex-1 flex-col items-center gap-1 rounded-lg p-2.5 text-center transition-all"
                    :class="editStep === i ? 'bg-primary/5 ring-1 ring-primary/20' : 'hover:bg-muted/50'"
                    @click="editStep = i"
                  >
                    <span
                      class="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold"
                      :class="editStep === i ? 'bg-primary text-primary-foreground' : editStep > i ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'"
                    >{{ i + 1 }}</span>
                    <span class="text-[11px] font-medium" :class="editStep === i ? 'text-foreground' : 'text-muted-foreground'">{{ s.title }}</span>
                  </button>
                </div>

                <form class="space-y-4" @submit.prevent="editStep === steps.length - 1 ? saveEmployeeEdit() : editStep++">
                  <!-- Step 0: 基础信息 -->
                  <div v-if="editStep === 0" class="space-y-3">
                    <label class="block space-y-1.5">
                      <span class="text-sm font-medium">编码</span>
                      <input v-model="editForm.code" class="input-field bg-muted/50 text-muted-foreground" disabled />
                      <p class="text-[11px] text-muted-foreground">编码不可修改</p>
                    </label>
                    <label class="block space-y-1.5">
                      <span class="text-sm font-medium">名称 <span class="text-destructive">*</span></span>
                      <input v-model="editForm.name" required class="input-field" placeholder="例如：项目管理助手" />
                    </label>
                    <label class="block space-y-1.5">
                      <span class="text-sm font-medium">所属部门 <span class="text-destructive">*</span></span>
                      <select v-model="editForm.departmentId" class="input-field">
                        <option :value="null">— 请选择部门 —</option>
                        <option v-for="opt in deptTreeOptions" :key="`edit-dept-${opt.id}`" :value="opt.id">{{ opt.label }}</option>
                      </select>
                      <p class="text-[11px] text-muted-foreground">将员工归入某个组织部门</p>
                    </label>
                    <label class="block space-y-1.5">
                      <span class="text-sm font-medium">职责描述</span>
                      <textarea v-model="editForm.description" rows="2" class="input-field" placeholder="描述它负责哪些业务结果…" />
                      <p class="text-[11px] text-muted-foreground">帮助团队理解这位员工的核心职责</p>
                    </label>
                    <label class="block space-y-1.5">
                      <span class="text-sm font-medium">角色设定</span>
                      <textarea v-model="editForm.systemPrompt" rows="4" class="input-field" placeholder="定义角色人格、行为风格、输出边界和工作原则…" />
                      <p class="text-[11px] text-muted-foreground">定义这位员工的性格特征、行为准则和工作方式</p>
                    </label>
                  </div>

                  <!-- Step 1: 工作设定 -->
                  <div v-else-if="editStep === 1" class="space-y-3">
                    <label class="block space-y-1.5">
                      <span class="text-sm font-medium">使用模型</span>
                      <input v-model="editForm.model" placeholder="留空使用系统默认模型" class="input-field" list="edit-model-suggestions" />
                      <datalist id="edit-model-suggestions">
                        <option value="openai/gpt-4.1" />
                        <option value="openai/gpt-4.1-mini" />
                        <option value="openai/gpt-4.1-nano" />
                        <option value="openai/o3" />
                        <option value="openai/o4-mini" />
                        <option value="anthropic/claude-sonnet-4-20250514" />
                        <option value="anthropic/claude-haiku-3.5" />
                      </datalist>
                      <p class="text-[11px] text-muted-foreground">指定该员工使用的 AI 模型，格式为 <code class="rounded bg-muted px-1 py-0.5 text-[10px]">provider/model</code></p>
                    </label>
                    <label class="block space-y-1.5">
                      <span class="text-sm font-medium">服务对象</span>
                      <textarea v-model="editForm.userContent" rows="3" class="input-field" placeholder="名称、称呼方式、时区、关注重点…" />
                      <p class="text-[11px] text-muted-foreground">描述这位员工服务的用户或团队，帮助它更好地理解上下文</p>
                    </label>
                    <label class="block space-y-1.5">
                      <span class="text-sm font-medium">心跳巡检内容</span>
                      <textarea v-model="editForm.heartbeatContent" rows="3" class="input-field" placeholder="定期检查的事项…" />
                      <p class="text-[11px] text-muted-foreground">心跳模式下，员工会按周期执行这些检查任务</p>
                    </label>
                    <label class="block space-y-1.5">
                      <span class="text-sm font-medium">启动任务</span>
                      <textarea v-model="editForm.bootContent" rows="3" class="input-field" placeholder="员工启动时自动执行的指令…" />
                      <p class="text-[11px] text-muted-foreground">每次启动时首先执行的操作清单</p>
                    </label>
                    <label class="block space-y-1.5">
                      <span class="text-sm font-medium">操作规则</span>
                      <textarea v-model="editForm.agentsContent" rows="4" class="input-field" placeholder="自定义工作规则：记忆管理、安全策略、沟通方式…" />
                      <p class="text-[11px] text-muted-foreground">覆盖或补充默认的工作行为规范</p>
                    </label>
                  </div>

                  <!-- Step 2: 能力配置 -->
                  <div v-else-if="editStep === 2" class="space-y-3">
                    <div class="flex items-start gap-2 rounded-lg bg-primary/5 p-3 text-sm text-primary">
                      <Sparkles class="mt-0.5 h-4 w-4 shrink-0" :stroke-width="1.8" />
                      <p>优先选择已启用且职责明确的技能。</p>
                    </div>
                    <label
                      v-for="skill in skills"
                      :key="`edit-${skill.name}`"
                      class="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 transition-all hover:bg-muted/30"
                      :class="editForm.skillNames.includes(skill.name) && 'border-primary/30 bg-primary/5'"
                    >
                      <input v-model="editForm.skillNames" type="checkbox" :value="skill.name" class="mt-0.5 h-4 w-4 accent-primary" />
                      <div class="min-w-0">
                        <div class="flex items-center gap-2">
                          <p class="text-sm font-medium">{{ skill.name }}</p>
                          <span class="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{{ skill.categoryLabel }}</span>
                        </div>
                        <p class="mt-0.5 text-xs text-muted-foreground">{{ skill.purpose }}</p>
                      </div>
                    </label>
                  </div>

                  <!-- Step 3: 自动任务 -->
                  <div v-else class="space-y-3">
                    <div class="grid gap-2">
                      <label
                        v-for="opt in [
                          { value: 'cron', title: '每日定时', desc: '适合日报、巡检、总结和推送' },
                          { value: 'every', title: '固定间隔', desc: '适合持续巡检或短周期同步' },
                          { value: 'heartbeat', title: '心跳巡检', desc: '适合轻量检查和持续状态感知' }
                        ]"
                        :key="`edit-sched-${opt.value}`"
                        class="flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 transition-all"
                        :class="editForm.scheduleKind === opt.value ? 'border-primary/30 bg-primary/5' : 'border-border hover:bg-muted/30'"
                      >
                        <input v-model="editForm.scheduleKind" type="radio" :value="opt.value" class="mt-0.5 h-4 w-4 accent-primary" />
                        <div>
                          <p class="text-sm font-medium">{{ opt.title }}</p>
                          <p class="text-xs text-muted-foreground">{{ opt.desc }}</p>
                        </div>
                      </label>
                    </div>
                    <label v-if="editForm.scheduleKind === 'cron'" class="block space-y-1.5">
                      <span class="text-sm font-medium">Cron 表达式</span>
                      <input v-model="editForm.cronExpr" class="input-field font-mono" />
                    </label>
                    <label v-else class="block space-y-1.5">
                      <span class="text-sm font-medium">间隔毫秒</span>
                      <input v-model.number="editForm.everyMs" type="number" min="1000" class="input-field" />
                    </label>
                  </div>

                  <p v-if="editError" class="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{{ editError }}</p>

                  <div class="flex items-center justify-between gap-2 border-t border-border pt-4">
                    <button v-if="editStep > 0" type="button" class="btn-ghost" @click="editStep--">
                      <ChevronLeft class="h-3.5 w-3.5" />
                      上一步
                    </button>
                    <span v-else />
                    <button class="btn-primary" :disabled="editSaving || (editStep === 0 && !editForm.name.trim())">
                      {{ editStep === steps.length - 1 ? (editSaving ? "保存中..." : "保存修改") : "下一步" }}
                      <ChevronRight v-if="editStep < steps.length - 1" class="h-3.5 w-3.5" />
                    </button>
                  </div>
                </form>
              </template>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Viewer Slide-over -->
    <Teleport to="body">
      <Transition name="slide-over">
        <div v-if="showViewer" class="fixed inset-0 z-50 flex justify-end">
          <div class="absolute inset-0 bg-foreground/20 backdrop-blur-sm" @click="showViewer = false" />
          <div class="slide-over-panel relative w-full max-w-md overflow-y-auto bg-card shadow-2xl">
            <div class="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/95 px-6 py-4 backdrop-blur-sm">
              <div>
                <span class="section-label">查看员工</span>
                <h2 class="mt-0.5 text-lg font-semibold">{{ viewForm.name || '员工详情' }}</h2>
              </div>
              <button class="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" @click="showViewer = false">
                <X class="h-5 w-5" :stroke-width="1.8" />
              </button>
            </div>

            <div class="p-6">
              <div v-if="viewerLoading" class="rounded-lg bg-muted/50 px-3 py-3 text-sm text-muted-foreground">加载员工信息中...</div>
              <template v-else>
                <!-- Step Tabs -->
                <div class="mb-6 flex gap-2">
                  <button
                    v-for="(s, i) in steps"
                    :key="`view-tab-${s.title}`"
                    type="button"
                    class="flex flex-1 flex-col items-center gap-1 rounded-lg p-2.5 text-center transition-all"
                    :class="viewStep === i ? 'bg-primary/5 ring-1 ring-primary/20' : 'hover:bg-muted/50'"
                    @click="viewStep = i"
                  >
                    <span
                      class="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold"
                      :class="viewStep === i ? 'bg-primary text-primary-foreground' : viewStep > i ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'"
                    >{{ i + 1 }}</span>
                    <span class="text-[11px] font-medium" :class="viewStep === i ? 'text-foreground' : 'text-muted-foreground'">{{ s.title }}</span>
                  </button>
                </div>

                <div class="space-y-4">
                  <!-- Step 0: 基础信息 -->
                  <div v-if="viewStep === 0" class="space-y-3">
                    <div class="space-y-1.5">
                      <p class="text-sm font-medium text-muted-foreground">编码</p>
                      <p class="rounded-lg bg-muted/50 px-3 py-2 text-sm font-mono">{{ viewForm.code }}</p>
                    </div>
                    <div class="space-y-1.5">
                      <p class="text-sm font-medium text-muted-foreground">名称</p>
                      <p class="rounded-lg bg-muted/30 px-3 py-2 text-sm font-semibold">{{ viewForm.name }}</p>
                    </div>
                    <div class="space-y-1.5">
                      <p class="text-sm font-medium text-muted-foreground">职责描述</p>
                      <p class="rounded-lg bg-muted/30 px-3 py-2 text-sm min-h-[3rem] whitespace-pre-wrap">{{ viewForm.description || '未填写' }}</p>
                    </div>
                    <div class="space-y-1.5">
                      <p class="text-sm font-medium text-muted-foreground">角色设定</p>
                      <p class="rounded-lg bg-muted/30 px-3 py-2 text-sm min-h-[5rem] whitespace-pre-wrap">{{ viewForm.systemPrompt || '未配置' }}</p>
                    </div>
                  </div>

                  <!-- Step 1: 工作设定 -->
                  <div v-else-if="viewStep === 1" class="space-y-3">
                    <div class="space-y-1.5">
                      <p class="text-sm font-medium text-muted-foreground">使用模型</p>
                      <p class="rounded-lg bg-muted/30 px-3 py-2 text-sm font-mono">{{ viewForm.model || '系统默认' }}</p>
                    </div>
                    <div class="space-y-1.5">
                      <p class="text-sm font-medium text-muted-foreground">服务对象</p>
                      <p class="rounded-lg bg-muted/30 px-3 py-2 text-sm min-h-[4rem] whitespace-pre-wrap">{{ viewForm.userContent || '未配置' }}</p>
                    </div>
                    <div class="space-y-1.5">
                      <p class="text-sm font-medium text-muted-foreground">心跳巡检内容</p>
                      <p class="rounded-lg bg-muted/30 px-3 py-2 text-sm min-h-[4rem] whitespace-pre-wrap">{{ viewForm.heartbeatContent || '未配置' }}</p>
                    </div>
                    <div class="space-y-1.5">
                      <p class="text-sm font-medium text-muted-foreground">启动任务</p>
                      <p class="rounded-lg bg-muted/30 px-3 py-2 text-sm min-h-[4rem] whitespace-pre-wrap">{{ viewForm.bootContent || '未配置' }}</p>
                    </div>
                    <div class="space-y-1.5">
                      <p class="text-sm font-medium text-muted-foreground">操作规则</p>
                      <p class="rounded-lg bg-muted/30 px-3 py-2 text-sm min-h-[5rem] whitespace-pre-wrap">{{ viewForm.agentsContent || '未配置' }}</p>
                    </div>
                  </div>

                  <!-- Step 2: 能力配置 -->
                  <div v-else-if="viewStep === 2" class="space-y-3">
                    <div v-if="viewForm.skillNames.length === 0" class="rounded-lg bg-muted/30 px-3 py-4 text-sm text-center text-muted-foreground">未绑定任何技能</div>
                    <div
                      v-for="skillName in viewForm.skillNames"
                      :key="`view-skill-${skillName}`"
                      class="flex items-start gap-3 rounded-lg border border-border p-3"
                    >
                      <div class="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary/50" />
                      <div class="min-w-0">
                        <p class="text-sm font-medium">{{ skillName }}</p>
                        <p class="mt-0.5 text-xs text-muted-foreground">{{ skills.find(s => s.name === skillName)?.purpose || '' }}</p>
                      </div>
                    </div>
                  </div>

                  <!-- Step 3: 自动任务 -->
                  <div v-else class="space-y-3">
                    <div class="rounded-lg border border-primary/30 bg-primary/5 px-3 py-3">
                      <p class="text-sm font-medium">{{ { cron: '每日定时', every: '固定间隔', heartbeat: '心跳巡检' }[viewForm.scheduleKind] }}</p>
                    </div>
                    <div v-if="viewForm.scheduleKind === 'cron'" class="space-y-1.5">
                      <p class="text-sm font-medium text-muted-foreground">Cron 表达式</p>
                      <p class="rounded-lg bg-muted/30 px-3 py-2 text-sm font-mono">{{ viewForm.cronExpr }}</p>
                    </div>
                    <div v-else class="space-y-1.5">
                      <p class="text-sm font-medium text-muted-foreground">间隔毫秒</p>
                      <p class="rounded-lg bg-muted/30 px-3 py-2 text-sm font-mono">{{ viewForm.everyMs }}</p>
                    </div>
                  </div>

                  <div class="flex items-center justify-end gap-2 border-t border-border pt-4">
                    <button type="button" class="btn-ghost" @click="showViewer = false">关闭</button>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

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

<style scoped>
/* ===== Page Layout ===== */
.employees-page {
  display: flex;
  min-height: 100vh;
  position: relative;
}

.page-bg {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
}
.page-bg__gradient-1 {
  position: absolute;
  top: -30%;
  right: -20%;
  width: 70%;
  height: 70%;
  background: radial-gradient(ellipse, hsl(162 50% 70% / 0.08) 0%, transparent 60%);
  filter: blur(60px);
}
.page-bg__gradient-2 {
  position: absolute;
  bottom: -30%;
  left: -15%;
  width: 60%;
  height: 60%;
  background: radial-gradient(ellipse, hsl(220 50% 70% / 0.06) 0%, transparent 60%);
  filter: blur(60px);
}
.page-bg__grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(hsl(var(--border) / 0.25) 1px, transparent 1px),
    linear-gradient(90deg, hsl(var(--border) / 0.25) 1px, transparent 1px);
  background-size: 80px 80px;
  mask-image: radial-gradient(ellipse at center, black 0%, transparent 70%);
  opacity: 0.4;
}

.employees-sidebar {
  display: none;
  width: 240px;
  flex-shrink: 0;
  flex-direction: column;
  border-right: 1px solid hsl(var(--border));
  background: hsl(var(--card) / 0.6);
  backdrop-filter: blur(8px);
}
@media (min-width: 1024px) {
  .employees-sidebar {
    display: flex;
  }
}

.employees-main {
  flex: 1;
  min-width: 0;
  overflow: auto;
  padding: 32px;
  position: relative;
  z-index: 1;
}

/* ===== Employee List View ===== */
.employee-list-view {
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.list-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
}
.list-header__content {
  flex: 1;
}
.list-header__badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 0.08);
  padding: 4px 12px;
  border-radius: 20px;
  margin-bottom: 8px;
}
.list-header__title {
  font-size: 2rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: hsl(var(--foreground));
  line-height: 1.2;
}
.list-header__subtitle {
  font-size: 1.1rem;
  font-weight: 400;
  color: hsl(var(--muted-foreground));
  margin-left: 8px;
}
.list-header__desc {
  font-size: 14px;
  color: hsl(var(--muted-foreground));
  margin-top: 6px;
}

.create-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  font-size: 14px;
  font-weight: 600;
  color: hsl(var(--primary-foreground));
  background: linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.85) 100%);
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px hsl(var(--primary) / 0.25);
}
.create-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px hsl(var(--primary) / 0.35);
}
.create-btn--lg {
  padding: 14px 28px;
  font-size: 15px;
}

/* ===== Search Bar ===== */
.search-bar {
  display: flex;
  align-items: center;
  gap: 16px;
}
.search-input {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 14px;
  color: hsl(var(--muted-foreground));
  transition: all 0.2s ease;
}
.search-input:focus-within {
  border-color: hsl(var(--primary) / 0.5);
  box-shadow: 0 0 0 3px hsl(var(--primary) / 0.1);
}
.search-input__field {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 14px;
  color: hsl(var(--foreground));
  outline: none;
}
.search-input__field::placeholder {
  color: hsl(var(--muted-foreground));
}
.search-input__shortcut {
  font-size: 11px;
  font-family: ui-monospace, monospace;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--muted) / 0.5);
  padding: 3px 6px;
  border-radius: 6px;
  border: 1px solid hsl(var(--border));
}
.search-bar__stats {
  display: flex;
  align-items: baseline;
  gap: 4px;
  flex-shrink: 0;
}
.search-bar__count {
  font-size: 18px;
  font-weight: 700;
  color: hsl(var(--foreground));
}
.search-bar__label {
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

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

/* ===== Empty State ===== */
.employee-empty {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 24px;
  border-radius: 20px;
  border: 2px dashed hsl(var(--border));
  background: hsl(var(--muted) / 0.1);
  text-align: center;
}
.employee-empty__icon {
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 20px;
  background: hsl(var(--primary) / 0.05);
  color: hsl(var(--primary) / 0.3);
  margin-bottom: 16px;
}
.employee-empty__title {
  font-size: 16px;
  font-weight: 600;
  color: hsl(var(--foreground));
}
.employee-empty__desc {
  font-size: 13px;
  color: hsl(var(--muted-foreground));
  max-width: 280px;
  margin-top: 8px;
}

/* ===== Overview Header ===== */
.overview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}
.overview-header__content {
  flex: 1;
}
.overview-header__title {
  font-size: 22px;
  font-weight: 700;
  color: #0f172a;
  margin: 0;
}
.overview-header__subtitle {
  font-size: 12px;
  color: #64748b;
  margin: 2px 0 0 0;
}
.overview-create-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #0f172a;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 10px;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}
.overview-create-btn:hover {
  background: #1e293b;
}

/* ===== Overview Stats ===== */
.overview-stats {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
}
.overview-stats__card {
  flex: 1;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 14px 18px;
  display: flex;
  align-items: center;
  gap: 16px;
}
.overview-stats__card--digital {
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  border: none;
}
.overview-stats__card--digital .overview-stats__icon {
  color: rgba(255, 255, 255, 0.9);
}
.overview-stats__card--digital .overview-stats__value {
  color: white;
}
.overview-stats__card--digital .overview-stats__unit {
  color: rgba(255, 255, 255, 0.7);
}
.overview-stats__card--digital .overview-stats__meta {
  color: rgba(255, 255, 255, 0.8);
}
.overview-stats__card--ratio {
  flex-direction: column;
  align-items: stretch;
  gap: 0;
}
.overview-stats__icon {
  flex-shrink: 0;
  color: #3b82f6;
}
.overview-stats__body {
  flex: 1;
}
.overview-stats__value {
  font-size: 24px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1;
}
.overview-stats__value--dark {
  color: #0f172a;
}
.overview-stats__unit {
  font-size: 14px;
  font-weight: 400;
  color: #64748b;
}
.overview-stats__meta {
  display: flex;
  gap: 16px;
  margin-top: 4px;
  font-size: 11px;
  color: #94a3b8;
}
.overview-stats__meta--muted {
  color: #94a3b8;
}
.overview-stats__label {
  font-size: 11px;
  color: #64748b;
  margin-bottom: 6px;
}
.overview-stats__ratio-bar {
  display: flex;
  align-items: center;
  gap: 0;
  margin-bottom: 4px;
}
.overview-stats__ratio-human {
  background: #3b82f6;
  height: 20px;
  border-radius: 5px 0 0 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 9px;
  font-weight: 600;
  min-width: 40px;
  padding: 0 6px;
}
.overview-stats__ratio-ai {
  background: #10b981;
  height: 20px;
  border-radius: 0 5px 5px 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 8px;
  font-weight: 600;
  padding: 0 8px;
}
.overview-stats__ratio-labels {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: #94a3b8;
}

/* ===== Org Chart ===== */
.org-chart-root {
  display: flex;
  flex-direction: column;
  align-items: center;
  user-select: none;
  padding-top: 24px;
}

/* 竖线 */
.org-v-line {
  width: 2px;
  height: 24px;
  background: #cbd5e1;
  margin: 0 auto;
}
.org-v-line--short {
  height: 20px;
}

/* 横向连接轨 */
.org-h-rail {
  position: relative;
  width: 100%;
  display: flex;
  justify-content: center;
}
.org-h-rail__line {
  width: 80%;
  height: 2px;
  background: #cbd5e1;
}

/* 部门行 */
.org-dept-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 14px;
  width: 100%;
}
.org-dept-col {
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* 根节点包装 */
.org-root-wrapper {
  display: flex;
  justify-content: center;
}

/* 根节点卡片 */
.org-root-card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 16px 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}
.org-root-card__header {
  display: flex;
  align-items: center;
  gap: 14px;
}
.org-root-card__icon {
  width: 44px;
  height: 44px;
  background: linear-gradient(135deg, #0f172a, #1e293b);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}
.org-root-card__company {
  font-size: 15px;
  font-weight: 600;
  color: #0f172a;
}
.org-root-card__footer {
  display: flex;
  justify-content: center;
  gap: 32px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid #f1f5f9;
}
.org-root-stat {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #3b82f6;
}
.org-root-stat--accent {
  color: #10b981;
}
.org-root-stat__text {
  text-align: left;
}
.org-root-stat__value {
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
  display: block;
}
.org-root-stat__label {
  font-size: 9px;
  color: #94a3b8;
}

/* 部门卡片 */
.org-dept-card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 14px 18px;
  min-width: 190px;
  cursor: pointer;
  text-align: left;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);
  transition: all 0.2s ease;
}
.org-dept-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}
.org-dept-card--selected {
  border-color: #6366f1;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
}
.org-dept-card--sub {
  min-width: 160px;
  padding: 12px 14px;
}

/* 部门卡片头部 */
.org-dept-card__header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.org-dept-card__icon {
  width: 32px;
  height: 32px;
  background: var(--dept-color, linear-gradient(135deg, #6366f1, #8b5cf6));
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  flex-shrink: 0;
}
.org-dept-card__title-row {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.org-dept-card__name {
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
}
.org-dept-card__subcount {
  font-size: 10px;
  color: #94a3b8;
}
.org-dept-card__expand-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: #f1f5f9;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #64748b;
  transition: all 0.2s;
}
.org-dept-card__expand-btn:hover {
  background: #e2e8f0;
  color: #0f172a;
}

/* 部门统计 */
.org-dept-card__stats {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}
.org-dept-stat {
  flex: 1;
  background: #eff6ff;
  border-radius: 6px;
  padding: 8px;
  text-align: center;
}
.org-dept-stat--digital {
  background: #ecfdf5;
}
.org-dept-stat__value {
  font-size: 14px;
  font-weight: 700;
  color: #1e40af;
}
.org-dept-stat--digital .org-dept-stat__value {
  color: #059669;
}
.org-dept-stat__label {
  font-size: 8px;
  color: #3b82f6;
  display: block;
}
.org-dept-stat--digital .org-dept-stat__label {
  color: #10b981;
}

/* 比例条 */
.org-dept-card__ratio {
  margin-top: 4px;
}
.org-dept-card__ratio-bar {
  height: 3px;
  background: #e2e8f0;
  border-radius: 2px;
  overflow: hidden;
  display: flex;
}
.org-dept-card__ratio-human {
  background: #3b82f6;
}
.org-dept-card__ratio-digital {
  background: #10b981;
}
.org-dept-card__ratio-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
  font-size: 9px;
  color: #94a3b8;
}

/* 子部门 */
.org-sub-depts {
  display: flex;
  flex-direction: column;
  align-items: center;
  transform-origin: top center;
}

/* Expand Animation */
.org-expand-enter-active {
  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}
.org-expand-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.org-expand-enter-from,
.org-expand-leave-to {
  opacity: 0;
  transform: translateY(-16px) scaleY(0.9);
}

/* ===== Avatar Preview ===== */
.org-dept-card__avatars {
  padding: 12px 16px 14px;
  border-top: 1px solid hsl(var(--border) / 0.3);
  background: linear-gradient(180deg, hsl(var(--background) / 0.3) 0%, hsl(var(--background) / 0.6) 100%);
}
.org-dept-card__avatars--sub {
  padding: 10px 12px 12px;
}
.org-avatar-group {
  display: flex;
  justify-content: center;
}
.org-avatar-group--sm {
  transform: scale(0.9);
}
.org-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  margin-left: -10px;
  border: 2px solid hsl(var(--card));
  transition: all 0.2s ease;
  cursor: pointer;
}
.org-avatar:first-child {
  margin-left: 0;
}
.org-avatar:hover {
  transform: translateY(-3px) scale(1.15);
  z-index: 10 !important;
  box-shadow: 0 4px 12px hsl(var(--foreground) / 0.15);
}
.org-avatar--human {
  background: linear-gradient(135deg, hsl(220 70% 55%) 0%, hsl(220 70% 45%) 100%);
  color: white;
  box-shadow: 0 2px 8px hsl(220 70% 45% / 0.35);
}
.org-avatar--digital {
  background: linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.75) 100%);
  color: white;
  box-shadow: 0 2px 8px hsl(var(--primary) / 0.35);
}
.org-avatar--more {
  background: linear-gradient(135deg, hsl(var(--muted)) 0%, hsl(var(--muted) / 0.8) 100%);
  color: hsl(var(--muted-foreground));
  font-size: 11px;
  border: 2px dashed hsl(var(--border));
}
.org-avatar--xs {
  width: 24px;
  height: 24px;
  font-size: 10px;
  margin-left: -8px;
}
</style>
