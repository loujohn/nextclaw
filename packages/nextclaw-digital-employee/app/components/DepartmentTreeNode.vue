<script setup lang="ts">
import { ChevronRight, ChevronDown, Plus, Pencil, Trash2, Folder, FolderOpen } from "lucide-vue-next";
import type { DepartmentTreeNode } from "./DepartmentTree.vue";

const props = defineProps<{
  node: DepartmentTreeNode;
  selectedId: string | null;
  expanded: Set<string>;
  depth: number;
}>();

const emit = defineEmits<{
  select: [id: string];
  toggle: [id: string];
  addChild: [parentId: string];
  edit: [dept: DepartmentTreeNode];
  delete: [dept: DepartmentTreeNode];
}>();

const hasChildren = computed(() => props.node.children.length > 0);
const isOpen = computed(() => props.expanded.has(props.node.id));
const isSelected = computed(() => props.selectedId === props.node.id);
</script>

<template>
  <div>
    <div
      class="group flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition-colors"
      :style="{ paddingLeft: `${(depth * 12) + 8}px` }"
      :class="isSelected ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted hover:text-foreground'"
      @click="emit('select', node.id)"
    >
      <!-- 展开/折叠按钮 -->
      <button
        class="flex h-4 w-4 shrink-0 items-center justify-center rounded transition-colors hover:bg-muted"
        :class="!hasChildren && 'invisible'"
        @click.stop="emit('toggle', node.id)"
      >
        <ChevronDown v-if="isOpen" class="h-3 w-3" :stroke-width="2" />
        <ChevronRight v-else class="h-3 w-3" :stroke-width="2" />
      </button>

      <!-- 图标 -->
      <FolderOpen v-if="isOpen || isSelected" class="h-4 w-4 shrink-0" :stroke-width="1.8" />
      <Folder v-else class="h-4 w-4 shrink-0" :stroke-width="1.8" />

      <!-- 名称 -->
      <span class="flex-1 truncate text-[13px]">{{ node.name }}</span>

      <!-- 员工数量 -->
      <span v-if="node.employeeCount > 0" class="text-[10px] font-mono opacity-60">{{ node.employeeCount }}</span>

      <!-- 操作按钮（hover 时显示） -->
      <div class="ml-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100" @click.stop>
        <button
          class="rounded p-0.5 hover:bg-primary/10 hover:text-primary"
          title="添加子部门"
          @click="emit('addChild', node.id)"
        >
          <Plus class="h-3 w-3" :stroke-width="2.2" />
        </button>
        <button
          class="rounded p-0.5 hover:bg-muted hover:text-foreground"
          title="编辑"
          @click="emit('edit', node)"
        >
          <Pencil class="h-3 w-3" :stroke-width="1.8" />
        </button>
        <button
          class="rounded p-0.5 hover:bg-destructive/10 hover:text-destructive"
          title="删除"
          @click="emit('delete', node)"
        >
          <Trash2 class="h-3 w-3" :stroke-width="1.8" />
        </button>
      </div>
    </div>

    <!-- 子节点 -->
    <Transition name="tree-expand">
      <div v-if="isOpen && hasChildren">
        <DepartmentTreeNode
          v-for="child in node.children"
          :key="child.id"
          :node="child"
          :selected-id="selectedId"
          :expanded="expanded"
          :depth="depth + 1"
          @select="emit('select', $event)"
          @toggle="emit('toggle', $event)"
          @add-child="emit('addChild', $event)"
          @edit="emit('edit', $event)"
          @delete="emit('delete', $event)"
        />
      </div>
    </Transition>
  </div>
</template>
