<script setup lang="ts">
import { Building2, RefreshCcw, X, Check } from "lucide-vue-next";

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

export type HumanMemberBrief = { id: string; name: string; title?: string | null };
export type DigitalMemberBrief = { id: string; name: string };

const props = defineProps<{
  departments: DepartmentView[];
  employeeCounts: Record<string, number>;
  selectedId: string | null;
  totalCount: number;
  humanMembers?: Record<string, HumanMemberBrief[]>;
  digitalMembers?: Record<string, DigitalMemberBrief[]>;
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

// ---- Toast ----
type Toast = { id: number; type: "success" | "error"; message: string };
const toasts = ref<Toast[]>([]);
let _toastId = 0;
function showToast(type: "success" | "error", message: string) {
  const id = ++_toastId;
  toasts.value.push({ id, type, message });
  setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id); }, 3500);
}

// ---- 同步组织 ----
const showSyncConfirm = ref(false);
const syncing = ref(false);

async function runSync() {
  showSyncConfirm.value = false;
  syncing.value = true;
  try {
    await $fetch("/api/org/sync-trigger", { method: "POST" });
    emit("refresh");
    showToast("success", "组织同步成功");
  } catch (err: any) {
    const msg = err?.data?.statusMessage ?? err?.message ?? "同步失败";
    showToast("error", msg);
  } finally {
    syncing.value = false;
  }
}
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- 头部 -->
    <div class="flex items-center justify-between px-3 py-3 border-b border-border">
      <span class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">组织架构</span>
      <button
        class="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
        :disabled="syncing"
        title="同步钉钉组织"
        @click="showSyncConfirm = true"
      >
        <RefreshCcw class="h-3 w-3" :class="syncing && 'animate-spin'" :stroke-width="2.2" />
        {{ syncing ? "同步中…" : "同步" }}
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
        :human-members="humanMembers"
        :digital-members="digitalMembers"
        @select="emit('select', $event)"
        @toggle="toggleExpand"
      />

      <div v-if="tree.length === 0" class="px-4 py-6 text-center text-[12px] text-muted-foreground">
        <Building2 class="mx-auto mb-2 h-6 w-6 opacity-30" :stroke-width="1.5" />
        暂无组织，请点击"同步"从钉钉导入
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

    <!-- 同步确认弹窗 -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showSyncConfirm" class="fixed inset-0 z-50 flex items-center justify-center">
          <div class="absolute inset-0 bg-foreground/20 backdrop-blur-sm" @click="showSyncConfirm = false" />
          <div class="relative w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <h3 class="mb-1 text-sm font-semibold">同步组织架构</h3>
            <p class="mb-5 text-sm text-muted-foreground">
              将通过钉钉 API 拉取最新部门和人类员工数据，覆盖当前组织数据。数字员工不会受到影响。
            </p>
            <div class="flex justify-end gap-2">
              <button class="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted" @click="showSyncConfirm = false">取消</button>
              <button class="btn-primary text-sm" @click="runSync">确认同步</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
