<script setup lang="ts">
type IntegrationPayload = {
  ok: boolean;
  data: Array<{
    id: string;
    title: string;
    statusLabel: string;
    description: string;
    detail: string;
    actionLabel: string;
    tone: "teal" | "amber" | "slate";
  }>;
};

const { data } = await useFetch<IntegrationPayload>("/api/integrations");
</script>

<template>
  <main class="app-shell">
    <AppNav />
    <section class="page-panel integration-page-shell">
      <div class="page-heading">
        <div>
          <p class="eyebrow">Integrations</p>
          <h1>先把模型、禅道和钉钉这些关键链路配置好，员工才能形成业务闭环</h1>
          <p class="hero-copy compact">当前页面先聚焦连接状态和下一步动作，后续再补完整 CRUD 与验证动作。</p>
        </div>
      </div>

      <div class="integration-grid">
        <article v-for="card in data?.data ?? []" :key="card.id" class="integration-card" :data-tone="card.tone">
          <div class="card-row">
            <div>
              <p class="eyebrow">Connection</p>
              <h2>{{ card.title }}</h2>
            </div>
            <StatusBadge :label="card.statusLabel" :tone="card.tone" />
          </div>
          <p class="integration-description">{{ card.description }}</p>
          <p class="integration-detail">{{ card.detail }}</p>
          <button class="ghost-link button-reset" type="button">{{ card.actionLabel }}</button>
        </article>
      </div>
    </section>
  </main>
</template>
