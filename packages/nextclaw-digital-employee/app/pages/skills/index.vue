<script setup lang="ts">
import { ClipboardList, TrendingUp, FlaskConical, Megaphone, Lightbulb, Zap, ChevronRight } from "lucide-vue-next";

const SKILL_CATEGORIES = [
  {
    slug: "project-management",
    label: "项目管理类",
    icon: ClipboardList,
    desc: "项目计划、进度跟踪与协作管理",
    gradient: "from-blue-500 to-indigo-500",
    bgLight: "bg-blue-50 dark:bg-blue-950/30",
    iconColor: "text-blue-500",
  },
  {
    slug: "business-management",
    label: "经营管理类",
    icon: TrendingUp,
    desc: "经营分析、数据洞察与决策支持",
    gradient: "from-violet-500 to-purple-600",
    bgLight: "bg-violet-50 dark:bg-violet-950/30",
    iconColor: "text-violet-500",
  },
  {
    slug: "product-rd",
    label: "产品研发类",
    icon: FlaskConical,
    desc: "产品设计、技术研发与质量保障",
    gradient: "from-emerald-500 to-teal-500",
    bgLight: "bg-emerald-50 dark:bg-emerald-950/30",
    iconColor: "text-emerald-500",
  },
  {
    slug: "marketing",
    label: "市场营销类",
    icon: Megaphone,
    desc: "品牌推广、内容营销与用户增长",
    gradient: "from-orange-500 to-rose-500",
    bgLight: "bg-orange-50 dark:bg-orange-950/30",
    iconColor: "text-orange-500",
  },
  {
    slug: "solutions",
    label: "解决方案类",
    icon: Lightbulb,
    desc: "行业方案、场景化能力与定制集成",
    gradient: "from-amber-500 to-yellow-500",
    bgLight: "bg-amber-50 dark:bg-amber-950/30",
    iconColor: "text-amber-500",
  },
  {
    slug: "general",
    label: "通用能力类",
    icon: Zap,
    desc: "跨场景通用能力，可被任意员工调用",
    gradient: "from-primary to-emerald-500",
    bgLight: "bg-primary/5",
    iconColor: "text-primary",
  },
];

const skillsStore = useSkillsStore();
const pending = computed(() => skillsStore.pending);
const data = computed(() => skillsStore.data);
const allSkills = computed(() => skillsStore.list);

const countByLabel = computed(() => {
  const map = new Map<string, number>();
  for (const s of allSkills.value) {
    const cat = s.categoryLabel || "通用能力";
    map.set(cat, (map.get(cat) ?? 0) + 1);
  }
  return map;
});

const totalSkills = computed(() => allSkills.value.length);
const enabledSkills = computed(() => allSkills.value.filter((s) => s.enabled).length);
</script>

<template>
  <PageSkeleton v-if="pending && !data" />
  <div v-else class="mx-auto max-w-6xl space-y-8 p-6 lg:p-8">
    <!-- Header -->
    <div class="space-y-1">
      <span class="section-label">能力管理</span>
      <h1 class="font-display text-3xl font-bold tracking-tight">技能中心</h1>
      <p class="text-sm text-muted-foreground">选择技能分类，查看和管理对应领域的能力库。</p>
    </div>

    <!-- Stats Strip -->
    <div class="flex gap-6 text-sm">
      <div class="flex items-center gap-2 text-muted-foreground">
        <Zap class="h-4 w-4 text-primary" :stroke-width="1.8" />
        <span><strong class="text-foreground">{{ totalSkills }}</strong> 个技能</span>
      </div>
      <div class="flex items-center gap-2 text-muted-foreground">
        <ChevronRight class="h-4 w-4 text-primary" :stroke-width="1.8" />
        <span><strong class="text-foreground">{{ enabledSkills }}</strong> 已启用</span>
      </div>
    </div>

    <!-- Category Cards Grid -->
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <NuxtLink
        v-for="cat in SKILL_CATEGORIES"
        :key="cat.slug"
        :to="`/skills/${cat.slug}`"
        class="group relative overflow-hidden rounded-2xl border border-border bg-card p-6 transition-all duration-200 hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5 cursor-pointer"
      >
        <!-- Icon & Count Row -->
        <div class="mb-4 flex items-start justify-between">
          <div :class="[cat.bgLight, 'flex h-12 w-12 items-center justify-center rounded-xl']">
            <component :is="cat.icon" :class="[cat.iconColor, 'h-6 w-6']" :stroke-width="1.8" />
          </div>
          <span
            v-if="countByLabel.get(cat.label)"
            class="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary"
          >
            {{ countByLabel.get(cat.label) }} 个
          </span>
          <span
            v-else
            class="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
          >
            暂无
          </span>
        </div>

        <!-- Content -->
        <h3 class="text-lg font-semibold tracking-tight">{{ cat.label }}</h3>
        <p class="mt-1 text-sm text-muted-foreground leading-relaxed">{{ cat.desc }}</p>

        <!-- Enter CTA -->
        <div class="mt-4 flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors group-hover:text-primary">
          <span>查看技能</span>
          <ChevronRight class="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" :stroke-width="2" />
        </div>

        <!-- Bottom gradient accent -->
        <div :class="['absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r opacity-0 transition-opacity group-hover:opacity-100', cat.gradient]" />
      </NuxtLink>
    </div>
  </div>
</template>
