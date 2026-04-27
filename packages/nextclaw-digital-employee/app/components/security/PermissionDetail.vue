<script setup lang="ts">
import { Lock, CheckCircle2, XCircle } from "lucide-vue-next";
import type {
  PlatformPermissionKey,
  RolePermissionGroup as PermissionGroup,
  RolePermissionView as RoleItem
} from "../../../shared/role-permissions";

const props = withDefaults(defineProps<{
  role: RoleItem | null;
  permissionGroups: PermissionGroup[];
  editable?: boolean;
  savingPermissionKey?: string | null;
}>(), {
  editable: false,
  savingPermissionKey: null
});

const emit = defineEmits<{
  togglePermission: [payload: { key: PlatformPermissionKey; enabled: boolean }];
}>();

function hasPermission(role: RoleItem, key: string): boolean {
  return role.permissions.includes(key as PlatformPermissionKey) || role.permissions.includes(`${key.split(":")[0]}:*` as PlatformPermissionKey);
}

function togglePermission(role: RoleItem, key: PlatformPermissionKey) {
  emit("togglePermission", {
    key,
    enabled: !hasPermission(role, key)
  });
}
</script>

<template>
  <div class="space-y-4">
    <template v-if="role">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2 class="text-base font-semibold text-foreground">
            {{ role.name }}
            <span v-if="role.isSystem" class="ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium bg-primary/10 text-primary">系统角色</span>
          </h2>
          <p class="mt-0.5 text-sm text-muted-foreground">{{ role.description }}</p>
        </div>
        <div class="text-right text-xs text-muted-foreground">
          当前角色已启用 {{ role.permissions.length }} 项权限
        </div>
      </div>

      <div class="space-y-4">
        <div v-if="permissionGroups.length === 0" class="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
          当前筛选条件下没有匹配到可配置权限。
        </div>

        <div
          v-for="group in permissionGroups"
          :key="group.group"
          class="card-elevated rounded-xl p-4"
        >
          <h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {{ group.group }}
          </h3>
          <p v-if="group.description" class="mb-3 mt-1 text-xs text-muted-foreground">
            {{ group.description }}
          </p>
          <div class="space-y-2">
            <div
              v-for="perm in group.items"
              :key="perm.key"
              class="flex items-start justify-between gap-3 rounded-lg px-3 py-2 transition-colors"
              :class="hasPermission(role, perm.key) ? 'bg-primary/5' : 'bg-muted/30'"
            >
              <div class="flex items-start gap-2">
                <span
                  class="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full"
                  :class="hasPermission(role, perm.key) ? 'bg-primary/10' : 'bg-border'"
                >
                  <CheckCircle2 v-if="hasPermission(role, perm.key)" class="h-3.5 w-3.5 text-primary" :stroke-width="2" />
                  <XCircle v-else class="h-3.5 w-3.5 text-muted-foreground/50" :stroke-width="2" />
                </span>
                <div>
                  <p class="text-sm text-foreground">{{ perm.label }}</p>
                  <p class="mt-0.5 text-xs text-muted-foreground">{{ perm.description }}</p>
                </div>
              </div>
              <div class="flex shrink-0 items-center gap-2">
                <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{{ perm.key }}</code>
                <button
                  v-if="props.editable"
                  class="rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                  :class="hasPermission(role, perm.key)
                    ? 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/15'
                    : 'border-border bg-card text-muted-foreground hover:text-foreground'"
                  :disabled="props.savingPermissionKey === perm.key"
                  @click="togglePermission(role, perm.key)"
                >
                  {{ props.savingPermissionKey === perm.key ? '保存中...' : (hasPermission(role, perm.key) ? '已允许' : '已限制') }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <div v-else class="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 py-16 text-center">
      <Lock class="mb-3 h-8 w-8 text-muted-foreground/40" :stroke-width="1.5" />
      <p class="text-sm text-muted-foreground">请从左侧选择一个角色查看权限</p>
    </div>
  </div>
</template>
