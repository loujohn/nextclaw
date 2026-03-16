<script setup lang="ts">
import { ChevronRight, ChevronDown, Plus, Pencil, Trash2, FolderOpen, Folder, Building2, X, Check } from "lucide-vue-next";

export type DepartmentView = {
  id: string;
  name: string;
  description: string;
  parentId: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type DepartmentTreeNode = DepartmentView & {
  children: DepartmentTreeNode[];
  employeeCount: number;
};

const props = defineProps<{
  departments: DepartmentView[];
  employeeCounts: Record<string, number>;
  selectedId: string | null;
  totalCount: number;
}>();

const emit = defineEmits<{
  select: [id: string | null];
  refresh: [];
}>();

// ---- 构建树形结构 ----
const tree = computed<DepartmentTreeNode[]>(() => {
  const map = new Map<string, DepartmentTreeNode>();
  for (const d of props.departments) {
    map.set(d.id, { ...d, children: [], employeeCount: props.employeeCounts[d.id] ?? 0 });
  }
  const roots: DepartmentTreeNode[] = [];
  for (const node of map.values()) {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
});

// ---- 展开/折叠状态 ----
const expanded = ref<Set<string>>(new Set());
function toggleExpand(id: string) {
  if (expanded.value.has(id)) {
    expanded.value.delete(id);
  } else {
    expanded.value.add(id);
  }
}
function isExpanded(id: string): boolean {
  return expanded.value.has(id);
}

// ---- Toast ----
type Toast = { id: number; type: "success" | "error"; message: string };
const toasts = ref<Toast[]>([]);
let _toastId = 0;
function showToast(type: "success" | "error", message: string) {
  const id = ++_toastId;
  toasts.value.push({ id, type, message });
  setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id); }, 3500);
}

// ---- 新建部门 ----
const showCreator = ref(false);
const creatorParentId = ref<string | null>(null);
const creatorForm = reactive({ name: "", description: "" });
const creating = ref(false);
const createError = ref("");

function openCreator(parentId: string | null = null) {
  creatorParentId.value = parentId;
  creatorForm.name = "";
  creatorForm.description = "";
  createError.value = "";
  showCreator.value = true;
}

async function createDepartment() {
  const name = creatorForm.name.trim();
  if (!name) { createError.value = "请填写部门名称"; return; }
  creating.value = true;
  createError.value = "";
  try {
    await $fetch("/api/departments", {
      method: "POST",
      body: { name, description: creatorForm.description, parentId: creatorParentId.value }
    });
    showCreator.value = false;
    if (creatorParentId.value) expanded.value.add(creatorParentId.value);
    emit("refresh");
    showToast("success", `已创建部门「${name}」`);
  } catch (err) {
    createError.value = err instanceof Error ? err.message : String(err);
  } finally {
    creating.value = false;
  }
}

// ---- 编辑部门 ----
const showEditor = ref(false);
const editingDept = ref<DepartmentView | null>(null);
const editForm = reactive({ name: "", description: "" });
const saving = ref(false);
const saveError = ref("");

function openEditor(dept: DepartmentView) {
  editingDept.value = dept;
  editForm.name = dept.name;
  editForm.description = dept.description;
  saveError.value = "";
  showEditor.value = true;
}

async function saveDepartment() {
  if (!editingDept.value) return;
  const name = editForm.name.trim();
  if (!name) { saveError.value = "请填写部门名称"; return; }
  saving.value = true;
  saveError.value = "";
  try {
    await $fetch(`/api/departments/${editingDept.value.id}`, {
      method: "PATCH",
      body: { name, description: editForm.description }
    });
    showEditor.value = false;
    emit("refresh");
    showToast("success", `已更新部门「${name}」`);
  } catch (err) {
    saveError.value = err instanceof Error ? err.message : String(err);
  } finally {
    saving.value = false;
  }
}

// ---- 删除部门 ----
const deletingDept = ref<DepartmentView | null>(null);
const deleting = ref(false);
const deleteError = ref("");

function openDeleteConfirm(dept: DepartmentView) {
  deletingDept.value = dept;
  deleteError.value = "";
}

async function deleteDepartment() {
  if (!deletingDept.value) return;
  deleting.value = true;
  deleteError.value = "";
  const deptName = deletingDept.value.name;
  try {
    await $fetch(`/api/departments/${deletingDept.value.id}`, { method: "DELETE" });
    if (props.selectedId === deletingDept.value.id) {
      emit("select", null);
    }
    deletingDept.value = null;
    emit("refresh");
    showToast("success", `已删除部门「${deptName}」`);
  } catch (err: any) {
    const msg = err?.data?.statusMessage ?? err?.message ?? String(err);
    deleteError.value = msg.includes("employee") ? "该部门（或其子部门）下仍有员工，请先移除员工后再删除" : msg;
  } finally {
    deleting.value = false;
  }
}
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- 头部 -->
    <div class="flex items-center justify-between px-3 py-3 border-b border-border">
      <span class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">组织架构</span>
      <button
        class="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/5 transition-colors"
        @click="openCreator(null)"
      >
        <Plus class="h-3 w-3" :stroke-width="2.2" />
        新增
      </button>
    </div>

    <!-- 全部 -->
    <button
      class="mx-2 mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors"
      :class="selectedId === null ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted hover:text-foreground'"
      @click="emit('select', null)"
    >
      <Building2 class="h-4 w-4 shrink-0" :stroke-width="1.8" />
      <span class="flex-1 text-left">全部员工</span>
      <span class="text-[10px] font-mono">{{ totalCount }}</span>
    </button>

    <!-- 树形列表 -->
    <div class="flex-1 overflow-y-auto py-1">
      <DepartmentTreeNode
        v-for="node in tree"
        :key="node.id"
        :node="node"
        :selected-id="selectedId"
        :expanded="expanded"
        :depth="0"
        @select="emit('select', $event)"
        @toggle="toggleExpand"
        @add-child="openCreator"
        @edit="openEditor"
        @delete="openDeleteConfirm"
      />

      <div v-if="tree.length === 0" class="px-4 py-6 text-center text-[12px] text-muted-foreground">
        <Building2 class="mx-auto mb-2 h-6 w-6 opacity-30" :stroke-width="1.5" />
        暂无组织，点击"新增"创建
      </div>
    </div>

    <!-- Toast -->
    <Teleport to="body">
      <div class="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2">
        <Transition v-for="toast in toasts" :key="toast.id" name="toast">
          <div
            class="flex items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur-sm"
            :class="toast.type === 'success' ? 'border-primary/20 bg-primary/10 text-primary' : 'border-destructive/20 bg-destructive/10 text-destructive'"
          >
            <Check v-if="toast.type === 'success'" class="h-4 w-4 shrink-0" :stroke-width="2.2" />
            <X v-else class="h-4 w-4 shrink-0" :stroke-width="2.2" />
            {{ toast.message }}
          </div>
        </Transition>
      </div>
    </Teleport>

    <!-- 新建部门弹窗 -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showCreator" class="fixed inset-0 z-50 flex items-center justify-center">
          <div class="absolute inset-0 bg-foreground/20 backdrop-blur-sm" @click="showCreator = false" />
          <div class="relative w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div class="mb-4 flex items-center justify-between">
              <h3 class="text-sm font-semibold">
                {{ creatorParentId ? "新增子部门" : "新增部门" }}
              </h3>
              <button class="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" @click="showCreator = false">
                <X class="h-4 w-4" :stroke-width="1.8" />
              </button>
            </div>
            <form class="space-y-3" @submit.prevent="createDepartment">
              <div>
                <label class="mb-1 block text-xs font-medium text-muted-foreground">部门名称 <span class="text-destructive">*</span></label>
                <input
                  v-model="creatorForm.name"
                  placeholder="如：技术部、产品组…"
                  class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                  autofocus
                />
              </div>
              <div>
                <label class="mb-1 block text-xs font-medium text-muted-foreground">描述（可选）</label>
                <input
                  v-model="creatorForm.description"
                  placeholder="部门职责简介…"
                  class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                />
              </div>
              <p v-if="createError" class="text-xs text-destructive">{{ createError }}</p>
              <div class="flex justify-end gap-2 pt-1">
                <button type="button" class="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted" @click="showCreator = false">取消</button>
                <button type="submit" class="btn-primary text-sm" :disabled="creating">
                  {{ creating ? "创建中…" : "创建" }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 编辑部门弹窗 -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showEditor" class="fixed inset-0 z-50 flex items-center justify-center">
          <div class="absolute inset-0 bg-foreground/20 backdrop-blur-sm" @click="showEditor = false" />
          <div class="relative w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div class="mb-4 flex items-center justify-between">
              <h3 class="text-sm font-semibold">编辑部门</h3>
              <button class="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" @click="showEditor = false">
                <X class="h-4 w-4" :stroke-width="1.8" />
              </button>
            </div>
            <form class="space-y-3" @submit.prevent="saveDepartment">
              <div>
                <label class="mb-1 block text-xs font-medium text-muted-foreground">部门名称 <span class="text-destructive">*</span></label>
                <input
                  v-model="editForm.name"
                  class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                  autofocus
                />
              </div>
              <div>
                <label class="mb-1 block text-xs font-medium text-muted-foreground">描述（可选）</label>
                <input
                  v-model="editForm.description"
                  class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                />
              </div>
              <p v-if="saveError" class="text-xs text-destructive">{{ saveError }}</p>
              <div class="flex justify-end gap-2 pt-1">
                <button type="button" class="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted" @click="showEditor = false">取消</button>
                <button type="submit" class="btn-primary text-sm" :disabled="saving">
                  {{ saving ? "保存中…" : "保存" }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 删除确认弹窗 -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="deletingDept" class="fixed inset-0 z-50 flex items-center justify-center">
          <div class="absolute inset-0 bg-foreground/20 backdrop-blur-sm" @click="deletingDept = null" />
          <div class="relative w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <h3 class="mb-1 text-sm font-semibold">删除部门</h3>
            <p class="mb-4 text-sm text-muted-foreground">
              确认删除部门「<strong class="text-foreground">{{ deletingDept.name }}</strong>」？此操作不可恢复，也将同步删除所有子部门。
            </p>
            <p v-if="deleteError" class="mb-3 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">{{ deleteError }}</p>
            <div class="flex justify-end gap-2">
              <button class="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted" @click="deletingDept = null; deleteError = ''">取消</button>
              <button
                class="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                :disabled="deleting"
                @click="deleteDepartment"
              >
                {{ deleting ? "删除中…" : "确认删除" }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
