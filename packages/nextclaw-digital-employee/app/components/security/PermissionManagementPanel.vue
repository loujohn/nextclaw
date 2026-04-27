<script setup lang="ts">
import { computed, ref } from "vue";
import { ChevronRight, Search, Users } from "lucide-vue-next";
import { INITIAL_PERMISSION_GROUPS } from "../../pages/security/security-mock";
import type {
  PlatformPermissionKey,
  RolePermissionGroup as PermissionGroup,
  RolePermissionView as RoleItem
} from "../../../shared/role-permissions";

const props = defineProps<{
  roles: RoleItem[];
  selectedRoleId: string | null;
  permissionGroups: PermissionGroup[];
  permissionsLoading: boolean;
  permissionsError: string;
  savingPermissionKey?: string | null;
}>();

const emit = defineEmits<{
  selectRole: [id: string];
  retry: [];
  togglePermission: [payload: { key: PlatformPermissionKey; enabled: boolean }];
}>();

const permissionSearchQuery = ref("");

const selectedRole = computed(() => props.roles.find((role) => role.id === props.selectedRoleId) ?? null);

const filteredPermissionGroups = computed(() => {
  const keyword = permissionSearchQuery.value.trim().toLowerCase();
  if (!keyword) {
    return props.permissionGroups;
  }
  return props.permissionGroups
    .map((group) => {
      const groupMatched = group.group.toLowerCase().includes(keyword) || group.description.toLowerCase().includes(keyword);
      if (groupMatched) {
        return group;
      }
      return {
        ...group,
        items: group.items.filter((item) => {
          const description = item.description ?? "";
          return item.label.toLowerCase().includes(keyword)
            || item.key.toLowerCase().includes(keyword)
            || description.toLowerCase().includes(keyword);
        })
      };
    })
    .filter((group) => group.items.length > 0);
});

const filteredLegacyPermissionGroups = computed(() => {
  const keyword = permissionSearchQuery.value.trim().toLowerCase();
  if (!keyword) {
    return INITIAL_PERMISSION_GROUPS;
  }
  return INITIAL_PERMISSION_GROUPS
    .map((group) => {
      const groupMatched = group.group.toLowerCase().includes(keyword);
      if (groupMatched) {
        return group;
      }
      return {
        ...group,
        items: group.items.filter((item) => item.label.toLowerCase().includes(keyword) || item.key.toLowerCase().includes(keyword))
      };
    })
    .filter((group) => group.items.length > 0);
});

const configurablePermissionCount = computed(() => props.permissionGroups.reduce((total, group) => total + group.items.length, 0));
const legacyPermissionCount = computed(() => INITIAL_PERMISSION_GROUPS.reduce((total, group) => total + group.items.length, 0));

function selectRole(id: string) {
  emit("selectRole", id);
}

function retry() {
  emit("retry");
}

function togglePermission(payload: { key: PlatformPermissionKey; enabled: boolean }) {
  emit("togglePermission", payload);
}
</script>

<template>
  <div class="space-y-5">
    <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div class="card-elevated rounded-2xl p-4">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 class="text-sm font-semibold text-foreground">权限配置总览</h2>
            <p class="mt-1 text-xs leading-relaxed text-muted-foreground">
              已接入真实权限的项目继续支持在线开关；之前的权限目录内容保留为参考清单，避免历史设计信息丢失。
            </p>
          </div>
          <label class="relative block w-full lg:w-72">
            <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" :stroke-width="1.8" />
            <input
              v-model="permissionSearchQuery"
              type="search"
              class="input-field pl-9 text-sm"
              placeholder="搜索权限名称、分组或 key"
            />
          </label>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3 lg:grid-cols-1">
        <div class="card-elevated rounded-2xl p-4">
          <p class="text-xs text-muted-foreground">真实可配置权限</p>
          <p class="mt-1 text-2xl font-bold text-foreground">{{ configurablePermissionCount }}</p>
          <p class="mt-1 text-xs text-muted-foreground">当前已接入后端并支持在线切换</p>
        </div>
        <div class="card-elevated rounded-2xl p-4">
          <p class="text-xs text-muted-foreground">历史权限目录</p>
          <p class="mt-1 text-2xl font-bold text-foreground">{{ legacyPermissionCount }}</p>
          <p class="mt-1 text-xs text-muted-foreground">继续保留展示，便于权限规划与对照</p>
        </div>
      </div>
    </div>

    <div class="grid gap-5 lg:grid-cols-[280px_1fr]">
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold text-foreground">角色列表</h2>
          <span class="text-xs text-muted-foreground">真实配置 + 历史目录</span>
        </div>

        <div v-if="permissionsLoading" class="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
          正在加载角色权限配置...
        </div>

        <div v-else-if="permissionsError" class="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-4 text-sm text-destructive">
          <p>{{ permissionsError }}</p>
          <button class="mt-3 rounded-lg border border-destructive/20 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10" @click="retry">
            重新加载
          </button>
        </div>

        <div v-else class="space-y-2">
          <button
            v-for="role in roles"
            :key="role.id"
            class="w-full rounded-xl border p-3 text-left transition-all duration-150"
            :class="selectedRoleId === role.id
              ? 'border-primary/30 bg-primary/5 shadow-sm'
              : 'border-border bg-card hover:border-primary/20 hover:bg-muted/30'"
            @click="selectRole(role.id)"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="flex items-center gap-1.5">
                  <span class="truncate text-sm font-medium text-foreground">{{ role.name }}</span>
                  <span v-if="role.isSystem" class="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium bg-primary/10 text-primary">系统</span>
                </div>
                <p class="mt-0.5 truncate text-xs text-muted-foreground">{{ role.description }}</p>
              </div>
              <ChevronRight class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" :stroke-width="1.8" />
            </div>
            <div class="mt-2 flex items-center gap-2">
              <span class="flex items-center gap-1 text-xs text-muted-foreground">
                <Users class="h-3 w-3" />
                {{ role.memberCount }} 人
              </span>
              <span class="text-xs text-muted-foreground">·</span>
              <span class="text-xs text-muted-foreground">{{ role.permissions.length }} 项权限</span>
            </div>
          </button>

          <div v-if="roles.length === 0" class="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
            暂无可配置角色。
          </div>
        </div>
      </div>

      <div class="space-y-5">
        <SecurityPermissionDetail
          :role="selectedRole"
          :permission-groups="filteredPermissionGroups"
          :editable="true"
          :saving-permission-key="savingPermissionKey ?? null"
          @toggle-permission="togglePermission"
        />

        <section class="card-elevated rounded-2xl p-4">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 class="text-sm font-semibold text-foreground">历史权限目录</h3>
              <p class="mt-1 text-xs leading-relaxed text-muted-foreground">
                以下内容为此前权限模块中的权限目录，现阶段先保留展示，作为权限范围说明与后续细粒度接入的基线。
              </p>
            </div>
            <span class="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
              {{ filteredLegacyPermissionGroups.length }} 个分组
            </span>
          </div>

          <div v-if="filteredLegacyPermissionGroups.length === 0" class="mt-4 rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            没有匹配到历史权限目录项。
          </div>

          <div v-else class="mt-4 grid gap-4 xl:grid-cols-2">
            <div
              v-for="group in filteredLegacyPermissionGroups"
              :key="group.group"
              class="rounded-xl border border-border bg-muted/20 p-4"
            >
              <div class="flex items-center justify-between gap-3">
                <h4 class="text-sm font-semibold text-foreground">{{ group.group }}</h4>
                <span class="rounded-full bg-card px-2 py-0.5 text-[11px] text-muted-foreground">
                  {{ group.items.length }} 项
                </span>
              </div>

              <div class="mt-3 space-y-2">
                <div
                  v-for="item in group.items"
                  :key="item.key"
                  class="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-card px-3 py-2"
                >
                  <div class="min-w-0">
                    <p class="truncate text-sm text-foreground">{{ item.label }}</p>
                    <p class="mt-0.5 truncate text-[11px] text-muted-foreground">{{ item.key }}</p>
                  </div>
                  <span class="shrink-0 rounded-full px-2 py-0.5 text-[11px]"
                    :class="item.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'"
                  >
                    {{ item.enabled ? '历史默认开启' : '历史默认关闭' }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>