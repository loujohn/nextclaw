<script setup lang="ts">
defineProps<{
  total: number;
  pageSize: number;
  currentPage: number;
  totalPages: number;
  loading: boolean;
}>();

const emit = defineEmits<{
  change: [page: number];
}>();
</script>

<template>
  <div class="flex items-center justify-between border-t border-border bg-background px-4 py-3 text-xs text-muted-foreground">
    <div>共 {{ total }} 位用户，每页 {{ pageSize }} 条</div>
    <div class="flex items-center gap-2">
      <button
        class="rounded border border-border px-3 py-1 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="loading || currentPage <= 1"
        @click="emit('change', currentPage - 1)"
      >
        上一页
      </button>
      <span>第 {{ total === 0 ? 0 : currentPage }} / {{ total === 0 ? 0 : totalPages }} 页</span>
      <button
        class="rounded border border-border px-3 py-1 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="loading || currentPage >= totalPages"
        @click="emit('change', currentPage + 1)"
      >
        下一页
      </button>
    </div>
  </div>
</template>
