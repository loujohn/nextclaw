<script setup lang="ts">
defineProps<{
  integrations: Array<{
    name: string;
    type: string;
    isEnabled: boolean;
  }>;
}>();
</script>

<template>
  <section class="rounded-2xl border border-border/60 bg-card px-5 py-3.5 flex items-center gap-4">
    <p class="text-[11px] font-bold text-muted-foreground/80 whitespace-nowrap uppercase tracking-wider">已连接系统</p>
    <div class="flex flex-1 flex-wrap gap-2">
      <div
        v-for="integration in integrations"
        :key="integration.name"
        class="flex items-center gap-[6px] rounded-full border border-border/50 bg-muted/20 px-3 py-[5px] text-[11px] font-medium transition-all duration-200 hover:bg-muted/40 hover:border-border"
      >
        <span
          class="h-[6px] w-[6px] rounded-full ring-2"
          :class="integration.isEnabled ? 'bg-emerald-500 ring-emerald-200' : 'bg-muted-foreground/30 ring-muted-foreground/10'"
        />
        {{ integration.name }}
      </div>
      <div v-if="integrations.length === 0" class="text-[11px] text-muted-foreground/60">
        暂无集成
      </div>
    </div>
  </section>
</template>
