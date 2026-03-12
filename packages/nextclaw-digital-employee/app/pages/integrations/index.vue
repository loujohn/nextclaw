<script setup lang="ts">
import { Sparkles, CheckCircle2, AlertCircle, Brain, MessageSquare, ListChecks } from "lucide-vue-next";

type IntegrationItem = {
  id: string;
  title: string;
  statusLabel: string;
  description: string;
  detail: string;
  actionLabel: string;
  tone: "teal" | "amber" | "slate";
};

type IntegrationPayload = { ok: boolean; data: IntegrationItem[] };

const { data } = await useFetch<IntegrationPayload>("/api/integrations");

const integrations = computed(() => data.value?.data ?? []);
const configuredCount = computed(() => integrations.value.filter((i) => i.tone === "teal").length);

const toneClasses: Record<string, { border: string; badge: string; iconBg: string }> = {
  teal: { border: "border-primary/20", badge: "bg-primary/10 text-primary", iconBg: "bg-primary/10" },
  amber: { border: "border-amber-200", badge: "bg-amber-50 text-amber-600", iconBg: "bg-amber-50" },
  slate: { border: "border-border", badge: "bg-muted text-muted-foreground", iconBg: "bg-muted" }
};

const iconMap: Record<string, typeof Brain> = {
  "模型提供商": Brain,
  "禅道": ListChecks,
  "钉钉": MessageSquare
};
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6 p-6 lg:p-8">
    <div class="hero-section">
      <div class="relative space-y-1">
        <span class="section-label">外部连接</span>
        <h1 class="font-display text-3xl font-bold tracking-tight">集成中心</h1>
        <p class="max-w-2xl text-sm text-muted-foreground">
          配置模型、禅道和钉钉等关键链路，让员工能形成业务闭环。
        </p>
      </div>
    </div>

    <!-- Progress -->
    <div class="flex items-center gap-4">
      <div class="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          class="h-full rounded-full bg-primary transition-all duration-500"
          :style="{ width: integrations.length ? (configuredCount / integrations.length * 100) + '%' : '0%' }"
        />
      </div>
      <span class="shrink-0 text-sm text-muted-foreground">
        <strong class="text-foreground">{{ configuredCount }}</strong> / {{ integrations.length }} 已配置
      </span>
    </div>

    <!-- Integration Cards -->
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <article
        v-for="card in integrations"
        :key="card.id"
        class="group rounded-xl border bg-card p-5 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
        :class="toneClasses[card.tone]?.border"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" :class="toneClasses[card.tone]?.iconBg">
              <component :is="iconMap[card.title] ?? Sparkles" class="h-5 w-5" :class="card.tone === 'teal' ? 'text-primary' : 'text-muted-foreground'" :stroke-width="1.8" />
            </div>
            <div>
              <h2 class="text-base font-semibold">{{ card.title }}</h2>
            </div>
          </div>
          <span class="shrink-0 flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold" :class="toneClasses[card.tone]?.badge">
            <CheckCircle2 v-if="card.tone === 'teal'" class="h-3 w-3" :stroke-width="2" />
            <AlertCircle v-else class="h-3 w-3" :stroke-width="2" />
            {{ card.statusLabel }}
          </span>
        </div>
        <p class="mt-3 text-sm text-muted-foreground">{{ card.description }}</p>
        <p class="mt-2 rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground font-mono">{{ card.detail }}</p>
        <button class="btn-ghost mt-3 w-full justify-center">
          {{ card.actionLabel }}
        </button>
      </article>
    </div>

    <div
      v-if="integrations.length === 0"
      class="flex flex-col items-center rounded-2xl border border-dashed border-border bg-muted/10 px-6 py-12 text-center"
    >
      <div class="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/5">
        <Sparkles class="h-7 w-7 text-primary/30" :stroke-width="1.5" />
      </div>
      <p class="font-medium">还没有配置集成</p>
      <p class="mt-1 max-w-xs text-sm text-muted-foreground">集成配置完成后，员工才能调用模型和外部服务。</p>
    </div>
  </div>
</template>
