<script setup lang="ts">
import { formatScheduleSummary } from "~~/shared/ui-models";
import { Search, ChevronRight, ChevronLeft, Sparkles, Plus, X, ChevronDown, Pencil, Trash2, ExternalLink, Eye, CheckCircle, AlertCircle, Zap, Clock, Wrench } from "lucide-vue-next";
import type { DepartmentView } from "~/components/DepartmentTree.vue";

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
  latestRun?: { status: string; summary: string } | null;
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

const selectedDeptId = ref<string | null>(null);

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
const touched = reactive({ name: false });
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

// 每个部门的员工数量
const deptEmployeeCounts = computed<Record<string, number>>(() => {
  const counts: Record<string, number> = {};
  for (const emp of employees.value) {
    if (emp.departmentId) {
      counts[emp.departmentId] = (counts[emp.departmentId] ?? 0) + 1;
    }
  }
  return counts;
});

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
  { title: "能力配置", desc: "选择员工可使用的技能" },
  { title: "自动任务", desc: "设置定时执行的工作" }
];

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
  if (!e.health.hasSchedule) return { label: "待配置任务", cls: "bg-muted text-muted-foreground", lastStatus: "no-schedule" };
  return { label: "运行健康", cls: "bg-primary/10 text-primary", lastStatus: "healthy" };
}

// === 头像/卡片颜色生成（基于名称哈希，每位员工固定色系）===
// 低饱和度柔和色系：bannerFrom/To 控制 Banner，px = 像素头像前景，bg = 像素头像背景
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
  const style: CharacterStyle = {
    skinColor: SKIN_COLORS[h % SKIN_COLORS.length]!,
    hairColor: HAIR_COLORS[(h >> 3) % HAIR_COLORS.length]!,
    shirtColor: SHIRT_COLORS[(h >> 6) % SHIRT_COLORS.length]!.main,
    shirtColorLight: SHIRT_COLORS[(h >> 6) % SHIRT_COLORS.length]!.light,
    hairStyle: (['short', 'medium', 'long', 'ponytail', 'curly'] as const)[hairStyleIndex],
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
</script>

<template>
  <div class="flex h-full min-h-screen">
    <!-- 左侧组织树面板 -->
    <aside class="hidden lg:flex w-[220px] shrink-0 flex-col border-r border-border bg-card/50">
      <DepartmentTree
        :departments="departments"
        :employee-counts="deptEmployeeCounts"
        :selected-id="selectedDeptId"
        :total-count="employees.length"
        @select="selectedDeptId = $event"
        @refresh="async () => { await refreshDepts(); await refresh(); }"
      />
    </aside>

    <!-- 右侧主内容区 -->
    <div class="flex-1 min-w-0 space-y-6 p-6 lg:p-8">
    <!-- Header -->
    <div class="hero-section flex items-start justify-between gap-4">
      <div class="relative space-y-1">
        <span class="section-label">员工管理</span>
        <h1 class="font-display text-3xl font-bold tracking-tight">
          {{ selectedDeptName }}
          <span v-if="selectedDeptId" class="ml-2 text-lg font-normal text-muted-foreground">· 员工中心</span>
        </h1>
        <p class="text-sm text-muted-foreground">
          {{ selectedDeptId ? `查看「${selectedDeptName}」部门下的员工` : '创建、管理和运营你的数字员工团队。' }}
        </p>
      </div>
      <button class="btn-primary shrink-0" @click="showCreator = true; resetForm()">
        <Plus class="h-4 w-4" :stroke-width="2" />
        创建员工
      </button>
    </div>

    <!-- Search -->
    <div class="flex items-center gap-4">
      <label class="flex flex-1 items-center gap-2 rounded-lg border border-input bg-card px-3 py-2.5 transition-all duration-150 focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10">
        <Search class="h-4 w-4 text-muted-foreground" :stroke-width="1.8" />
        <input
          v-model="query"
          placeholder="搜索名称、编码或职责…"
          class="w-full border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </label>
      <p class="shrink-0 text-sm text-muted-foreground">{{ filteredEmployees.length }} 名员工</p>
    </div>

    <!-- Employee Grid -->
    <div class="stagger-in grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <!-- Profile Card -->
      <div
        v-for="emp in filteredEmployees"
        :key="emp.id"
        class="group flex flex-col rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1.5"
      >
        <!-- ① 办公工作场景 -->
        <div class="relative h-[100px] overflow-visible bg-gradient-to-b from-slate-100 via-slate-200 to-slate-300">
          <!-- 天花板灯带 -->
          <div class="absolute top-0 left-0 right-0 h-[4px] bg-gradient-to-r from-transparent via-amber-100 to-transparent opacity-80" />

          <!-- 隔断墙 -->
          <div class="absolute top-0 left-0 w-[60px] h-full bg-gradient-to-r from-slate-200 to-slate-300" />
          <div class="absolute top-0 right-0 w-[60px] h-full bg-gradient-to-l from-slate-200 to-slate-300" />

          <!-- 植物装饰 -->
          <div class="absolute bottom-[45px] left-2 text-base opacity-90 origin-bottom animate-plant-sway">🪴</div>
          <div class="absolute bottom-[45px] right-2 text-sm opacity-80">🌿</div>

          <!-- 桌面 -->
          <div class="absolute bottom-0 left-0 right-0 h-[42px] bg-gradient-to-b from-gray-500 to-gray-600" />

          <!-- 显示器 -->
          <div class="absolute bottom-[28px] left-1/2 -translate-x-1/2 w-[80px] h-[52px] bg-slate-800 rounded border-2 border-slate-600 animate-screen-glow">
            <!-- 屏幕内容 -->
            <div class="m-[5px] h-[calc(100%-10px)] bg-white rounded-sm overflow-hidden">
              <!-- 工具栏 -->
              <div class="h-[6px] bg-slate-100 flex gap-[2px] p-[2px] items-center">
                <div class="w-[2px] h-[2px] bg-red-500 rounded-full" />
                <div class="w-[2px] h-[2px] bg-yellow-500 rounded-full" />
                <div class="w-[2px] h-[2px] bg-green-500 rounded-full" />
              </div>
              <!-- 文档 -->
              <div class="p-[4px]">
                <div class="h-[2px] bg-blue-500 rounded-[1px] w-[50%]" />
                <div class="h-[2px] bg-slate-200 rounded-[1px] w-[80%] mt-[3px]" />
                <div class="h-[2px] bg-slate-200 rounded-[1px] w-[70%] mt-[2px]" />
                <div class="inline-block w-[2px] h-[3px] bg-blue-500 mt-[2px] animate-cursor-blink" />
              </div>
            </div>
            <!-- 底座 -->
            <div class="absolute -bottom-[6px] left-1/2 -translate-x-1/2 w-[14px] h-[6px] bg-slate-600" />
            <div class="absolute -bottom-[8px] left-1/2 -translate-x-1/2 w-[35px] h-[2px] bg-slate-600 rounded-[1px]" />
          </div>

          <!-- 人物剪影 -->
          <div class="absolute bottom-[42px] left-1/2 -translate-x-1/2 animate-subtle-float">
            <!-- 头部 -->
            <div
              class="relative w-[20px] h-[22px] rounded-[50%_50%_45%_45%] mx-auto animate-head-move"
              :style="{ backgroundColor: getCharacterStyle(emp.name).skinColor }"
            >
              <!-- 发型 - 5种不同风格 -->
              <!-- 1. 短发：干净利落的男生短发 -->
              <template v-if="getCharacterStyle(emp.name).hairStyle === 'short'">
                <div
                  class="absolute -top-[2px] left-[2px] right-[2px] h-[9px] rounded-[10px_10px_0_0]"
                  :style="{ backgroundColor: getCharacterStyle(emp.name).hairColor }"
                />
              </template>
              <!-- 2. 中长发：到耳朵的中等长度 -->
              <template v-else-if="getCharacterStyle(emp.name).hairStyle === 'medium'">
                <div
                  class="absolute -top-[3px] left-[0px] right-[0px] h-[11px] rounded-[12px_12px_0_0]"
                  :style="{ backgroundColor: getCharacterStyle(emp.name).hairColor }"
                />
                <div
                  class="absolute top-[6px] -left-[2px] w-[5px] h-[10px] rounded-b-[3px]"
                  :style="{ backgroundColor: getCharacterStyle(emp.name).hairColor }"
                />
                <div
                  class="absolute top-[6px] -right-[2px] w-[5px] h-[10px] rounded-b-[3px]"
                  :style="{ backgroundColor: getCharacterStyle(emp.name).hairColor }"
                />
              </template>
              <!-- 3. 长发：披肩长发 -->
              <template v-else-if="getCharacterStyle(emp.name).hairStyle === 'long'">
                <div
                  class="absolute -top-[3px] -left-[3px] -right-[3px] h-[12px] rounded-[12px_12px_4px_4px]"
                  :style="{ backgroundColor: getCharacterStyle(emp.name).hairColor }"
                />
                <div
                  class="absolute top-[7px] -left-[4px] w-[6px] h-[18px] rounded-b-[4px]"
                  :style="{ backgroundColor: getCharacterStyle(emp.name).hairColor }"
                />
                <div
                  class="absolute top-[7px] -right-[4px] w-[6px] h-[18px] rounded-b-[4px]"
                  :style="{ backgroundColor: getCharacterStyle(emp.name).hairColor }"
                />
              </template>
              <!-- 4. 马尾：扎起来的马尾 -->
              <template v-else-if="getCharacterStyle(emp.name).hairStyle === 'ponytail'">
                <div
                  class="absolute -top-[2px] left-[2px] right-[2px] h-[9px] rounded-[10px_10px_0_0]"
                  :style="{ backgroundColor: getCharacterStyle(emp.name).hairColor }"
                />
                <!-- 马尾辫 -->
                <div
                  class="absolute -top-[6px] left-1/2 -translate-x-1/2 w-[5px] h-[10px] rounded-t-[3px]"
                  :style="{ backgroundColor: getCharacterStyle(emp.name).hairColor }"
                />
              </template>
              <!-- 5. 卷发：蓬松的短发 -->
              <template v-else>
                <div
                  class="absolute -top-[4px] -left-[2px] -right-[2px] h-[12px] rounded-[14px_14px_0_0]"
                  :style="{ backgroundColor: getCharacterStyle(emp.name).hairColor }"
                />
                <div
                  class="absolute top-[6px] -left-[3px] w-[4px] h-[5px] rounded-full"
                  :style="{ backgroundColor: getCharacterStyle(emp.name).hairColor }"
                />
                <div
                  class="absolute top-[7px] -right-[3px] w-[4px] h-[5px] rounded-full"
                  :style="{ backgroundColor: getCharacterStyle(emp.name).hairColor }"
                />
              </template>
            </div>
            <!-- 身体 -->
            <div
              class="w-[32px] h-[20px] rounded-t-[6px] -mt-[3px] relative"
              :style="{ backgroundColor: getCharacterStyle(emp.name).shirtColor }"
            >
              <!-- 衣领 -->
              <div
                class="absolute top-0 left-1/2 -translate-x-1/2 w-[8px] h-[4px] rounded-b-[4px]"
                :style="{ backgroundColor: getCharacterStyle(emp.name).shirtColorLight }"
              />
              <!-- 左手臂 -->
              <div
                class="absolute -left-[4px] bottom-0 w-[7px] h-[16px] rounded-[3px] origin-top animate-arm-type-left"
                :style="{ backgroundColor: getCharacterStyle(emp.name).skinColor }"
              />
              <!-- 右手臂 -->
              <div
                class="absolute -right-[4px] bottom-0 w-[7px] h-[16px] rounded-[3px] origin-top animate-arm-type-right"
                :style="{ backgroundColor: getCharacterStyle(emp.name).skinColor }"
              />
            </div>
          </div>

          <!-- 键盘 -->
          <div class="absolute bottom-[42px] left-1/2 -translate-x-1/2 w-[50px] h-[7px] bg-slate-600 rounded-[2px]" />

          <!-- 健康状态徽章 -->
          <span class="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[9px] text-slate-700">
            <span
              class="h-[5px] w-[5px] rounded-full"
              :class="resolveHealth(emp).lastStatus === 'failed' ? 'bg-red-500' : resolveHealth(emp).lastStatus === 'healthy' ? 'bg-green-500' : 'bg-yellow-500'"
            />
            {{ resolveHealth(emp).label }}
          </span>
        </div>

        <!-- ② 头像（从 banner 露出） + 模型标签 -->
        <div class="-mt-5 flex items-end justify-between px-4">
          <!-- 头像：渐变色圆形 + 首字 -->
          <div
            class="relative h-12 w-12 rounded-full border-[3px] border-card shadow-lg flex items-center justify-center transition-transform duration-200 group-hover:scale-110"
            :style="getAvatarStyle(emp.name)"
          >
            <span class="text-white font-bold text-lg select-none">{{ emp.name.charAt(0) }}</span>
            <!-- 在线指示器 -->
            <span
              v-if="resolveHealth(emp).lastStatus === 'healthy'"
              class="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card bg-emerald-400 animate-pulse"
            />
          </div>
          <!-- 模型小标签 -->
          <span
            v-if="emp.model"
            class="mb-0.5 max-w-[96px] truncate rounded-full bg-muted/80 px-2 py-0.5 font-mono text-[9px] text-muted-foreground"
          >
            {{ emp.model.includes("/") ? emp.model.split("/")[1] : emp.model }}
          </span>
        </div>

        <!-- ③ 卡片主体 -->
        <div class="flex flex-col flex-1 px-4 pt-2.5 pb-4">
          <!-- 名称 + 编码 -->
          <h3 class="truncate text-sm font-bold tracking-tight text-foreground transition-colors duration-150 group-hover:text-primary">
            {{ emp.name }}
          </h3>
          <p class="font-mono text-[9px] tracking-widest text-muted-foreground/45 uppercase">{{ emp.code }}</p>

          <!-- 职责描述 -->
          <p class="mt-2 flex-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {{ emp.description || "暂无职责说明" }}
          </p>

          <!-- 技能 pills -->
          <div class="mt-3 flex flex-wrap gap-1">
            <span
              v-for="skill in emp.skills.slice(0, 3)"
              :key="skill.skillName"
              class="inline-flex items-center gap-0.5 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary/80"
            >
              <Zap class="h-2.5 w-2.5" :stroke-width="2" />
              {{ skill.skillName }}
            </span>
            <span v-if="emp.skills.length > 3" class="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              +{{ emp.skills.length - 3 }}
            </span>
            <span v-if="emp.skills.length === 0" class="inline-flex items-center gap-0.5 rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground/60">
              <Wrench class="h-2.5 w-2.5" :stroke-width="1.8" />
              待分配技能
            </span>
          </div>

          <!-- 排班 -->
          <div class="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground/70">
            <Clock class="h-3 w-3 shrink-0" :stroke-width="1.8" />
            <span class="truncate">{{ formatScheduleSummary(emp.schedule ?? null) }}</span>
          </div>

          <!-- 操作栏 -->
          <div class="mt-3 flex items-center justify-between border-t border-border/40 pt-3">
            <div class="flex items-center gap-0.5">
              <button
                class="rounded-md p-1.5 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 hover:bg-muted hover:text-foreground"
                title="查看"
                @click.stop="openViewer(emp)"
              >
                <Eye class="h-3.5 w-3.5" :stroke-width="1.8" />
              </button>
              <button
                class="rounded-md p-1.5 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 hover:bg-muted hover:text-foreground"
                title="编辑"
                @click.stop="openEditor(emp)"
              >
                <Pencil class="h-3.5 w-3.5" :stroke-width="1.8" />
              </button>
              <button
                class="rounded-md p-1.5 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
                title="删除"
                @click.stop="openDeleteConfirm(emp)"
              >
                <Trash2 class="h-3.5 w-3.5" :stroke-width="1.8" />
              </button>
            </div>
            <NuxtLink
              :to="`/employees/${emp.id}`"
              class="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-sm"
            >
              进入工作台
              <ExternalLink class="h-3 w-3" :stroke-width="2" />
            </NuxtLink>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div
        v-if="filteredEmployees.length === 0"
        class="col-span-full flex flex-col items-center rounded-2xl border border-dashed border-border bg-muted/10 px-6 py-12 text-center"
      >
        <div class="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/5">
          <Sparkles class="h-7 w-7 text-primary/30" :stroke-width="1.5" />
        </div>
        <p class="font-medium">还没有员工</p>
        <p class="mt-1 max-w-xs text-sm text-muted-foreground">点击右上角"创建员工"按钮，三步创建你的第一个数字员工。</p>
        <button class="btn-primary mt-4" @click="showCreator = true; resetForm()">
          <Plus class="h-4 w-4" :stroke-width="2" />
          创建员工
        </button>
      </div>
    </div>

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
                    <span class="text-sm font-medium">所属部门</span>
                    <select v-model="form.departmentId" class="input-field">
                      <option :value="null">— 不设置部门 —</option>
                      <option v-for="opt in deptTreeOptions" :key="opt.id" :value="opt.id">{{ opt.label }}</option>
                    </select>
                    <p class="text-[11px] text-muted-foreground">将员工归入某个组织部门</p>
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
                      <span class="text-sm font-medium">所属部门</span>
                      <select v-model="editForm.departmentId" class="input-field">
                        <option :value="null">— 不设置部门 —</option>
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
  </div>
</template>
