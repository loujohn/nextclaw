<script setup lang="ts">
import type { ChatResultCardView } from "~~/shared/ui-models";

defineProps<{
  card: ChatResultCardView;
}>();
</script>

<template>
  <article class="result-card" :data-tone="card.tone">
    <div class="result-card-header">
      <p class="eyebrow">{{ card.title }}</p>
      <StatusBadge
        :label="
          card.kind === 'summary'
            ? '摘要'
            : card.kind === 'projects'
              ? '项目'
              : card.kind === 'owners'
                ? '成员'
                : card.kind === 'actions'
                  ? '动作'
                  : card.kind === 'error'
                    ? '异常'
                    : '详情'
        "
        :tone="card.tone === 'rose' ? 'danger' : card.tone"
      />
    </div>
    <p class="result-card-copy">{{ card.content }}</p>
    <ul v-if="card.items.length > 1" class="result-card-list">
      <li v-for="item in card.items.slice(1)" :key="item">{{ item }}</li>
    </ul>
  </article>
</template>
