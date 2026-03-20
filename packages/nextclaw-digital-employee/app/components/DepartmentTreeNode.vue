<script setup lang="ts">
import { ChevronRight, ChevronDown, Folder, FolderOpen, Bot, User } from "lucide-vue-next";
import type { DepartmentTreeNode, HumanMemberBrief, DigitalMemberBrief } from "./DepartmentTree.vue";

const props = defineProps<{
  node: DepartmentTreeNode;
  selectedId: string | null;
  expanded: Set<string>;
  depth: number;
  humanMembers?: Record<string, HumanMemberBrief[]>;
  digitalMembers?: Record<string, DigitalMemberBrief[]>;
}>();

const emit = defineEmits<{
  select: [id: string];
  toggle: [id: string];
}>();

const hasChildren = computed(() => props.node.children.length > 0);
const isOpen = computed(() => props.expanded.has(props.node.id));
const isSelected = computed(() => props.selectedId === props.node.id);

const nodeHumanMembers = computed(() => props.humanMembers?.[props.node.id] ?? []);
const nodeDigitalMembers = computed(() => props.digitalMembers?.[props.node.id] ?? []);
const hasMemberChips = computed(() => isSelected.value && (nodeHumanMembers.value.length > 0 || nodeDigitalMembers.value.length > 0));
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

      <!-- 员工数量（数字员工数） -->
      <span v-if="node.employeeCount > 0" class="text-[10px] font-mono opacity-60">{{ node.employeeCount }}</span>
    </div>

    <!-- 选中时展示成员 chips -->
    <div
      v-if="hasMemberChips"
      class="flex flex-wrap gap-1 pb-1"
      :style="{ paddingLeft: `${(depth * 12) + 28}px` }"
    >
      <span
        v-for="m in nodeDigitalMembers"
        :key="'d-' + m.id"
        class="flex items-center gap-1 rounded-full bg-primary/5 border border-primary/10 px-1.5 py-0.5 text-[10px] text-primary"
        :title="m.name"
      >
        <Bot class="h-2.5 w-2.5 shrink-0" :stroke-width="1.8" />
        <span class="max-w-[56px] truncate">{{ m.name }}</span>
      </span>
      <span
        v-for="m in nodeHumanMembers"
        :key="'h-' + m.id"
        class="flex items-center gap-1 rounded-full bg-muted border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground"
        :title="m.name"
      >
        <User class="h-2.5 w-2.5 shrink-0" :stroke-width="1.8" />
        <span class="max-w-[56px] truncate">{{ m.name }}</span>
      </span>
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
          :human-members="humanMembers"
          :digital-members="digitalMembers"
          @select="emit('select', $event)"
          @toggle="emit('toggle', $event)"
        />
      </div>
    </Transition>
  </div>
</template>
