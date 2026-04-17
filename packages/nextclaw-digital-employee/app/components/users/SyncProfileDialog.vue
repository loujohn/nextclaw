<script setup lang="ts">
import type { UserView } from "../../../shared/auth-types";

const props = defineProps<{
  open: boolean;
  user: UserView | null;
}>();

const emit = defineEmits<{
  close: [];
}>();

const rows = computed(() => {
  if (!props.user) return [];
  return [
    { label: "外部 ID", value: props.user.externalUserId },
    { label: "外部用户名", value: props.user.externalUserName },
    { label: "外部姓名", value: props.user.externalName },
    { label: "岗位", value: props.user.externalPostName },
    { label: "外部角色", value: props.user.externalRoleName },
    { label: "用户类型", value: props.user.externalUserType },
    { label: "手机号", value: props.user.externalPhone },
    { label: "钉钉标识", value: props.user.externalDingTalkId },
    { label: "最近同步", value: formatDateTime(props.user.lastSyncedAt) },
  ];
});

function formatText(value: string | null | undefined): string {
  return value && value.trim() ? value : "-";
}

function formatDateTime(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : "-";
}
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
    <div class="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h3 class="text-base font-semibold text-foreground">同步资料</h3>
          <p class="mt-1 text-sm text-muted-foreground">
            {{ user?.displayName || "-" }} 的外部同步详情
          </p>
        </div>
        <button class="rounded px-2 py-1 text-sm text-muted-foreground hover:bg-muted" @click="emit('close')">
          关闭
        </button>
      </div>

      <div class="mt-5 grid gap-3 sm:grid-cols-2">
        <div
          v-for="item in rows"
          :key="item.label"
          class="rounded-xl border border-border bg-muted/20 px-4 py-3"
        >
          <div class="text-xs text-muted-foreground">{{ item.label }}</div>
          <div class="mt-1 break-all text-sm font-medium text-foreground">{{ formatText(item.value) }}</div>
        </div>
      </div>

      <div class="mt-5 flex justify-end">
        <button class="btn-primary text-sm" @click="emit('close')">我知道了</button>
      </div>
    </div>
  </div>
</template>
