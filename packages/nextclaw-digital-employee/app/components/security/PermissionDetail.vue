<script setup lang="ts">
import { Lock, Edit, CheckCircle2, XCircle } from "lucide-vue-next";
import type { RoleItem, PermissionGroup } from "~/pages/security/security-mock";

defineProps<{
  role: RoleItem | null;
  permissionGroups: PermissionGroup[];
}>();

function hasPermission(role: RoleItem, key: string): boolean {
  return role.permissions.includes(key) || role.permissions.includes(key.split(":")[0] + ":*");
}
</script>

<template>
  <div class="space-y-4">
    <template v-if="role">
      <div class="flex items-start justify-between">
        <div>
          <h2 class="text-base font-semibold text-foreground">
            {{ role.name }}
            <span v-if="role.isSystem" class="ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium bg-primary/10 text-primary">系统角色</span>
          </h2>
          <p class="mt-0.5 text-sm text-muted-foreground">{{ role.description }}</p>
        </div>
        <button v-if="!role.isSystem" class="btn-ghost text-xs">
          <Edit class="h-3.5 w-3.5" />
          编辑角色
        </button>
      </div>

      <div class="space-y-4">
        <div
          v-for="group in permissionGroups"
          :key="group.group"
          class="card-elevated rounded-xl p-4"
        >
          <h3 class="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {{ group.group }}
          </h3>
          <div class="space-y-2">
            <div
              v-for="perm in group.items"
              :key="perm.key"
              class="flex items-center justify-between rounded-lg px-3 py-2 transition-colors"
              :class="hasPermission(role, perm.key) ? 'bg-primary/5' : 'bg-muted/30'"
            >
              <div class="flex items-center gap-2">
                <span
                  class="flex h-5 w-5 items-center justify-center rounded-full"
                  :class="hasPermission(role, perm.key) ? 'bg-primary/10' : 'bg-border'"
                >
                  <CheckCircle2 v-if="hasPermission(role, perm.key)" class="h-3.5 w-3.5 text-primary" :stroke-width="2" />
                  <XCircle v-else class="h-3.5 w-3.5 text-muted-foreground/50" :stroke-width="2" />
                </span>
                <span class="text-sm text-foreground">{{ perm.label }}</span>
              </div>
              <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{{ perm.key }}</code>
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
