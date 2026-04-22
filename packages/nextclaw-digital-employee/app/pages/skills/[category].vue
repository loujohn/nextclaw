<script setup lang="ts">
import {
  Search,
  FolderInput,
  GitBranch,
  Sparkles,
  Loader2,
  Download,
  Zap,
  FolderOpen,
  X,
  ArrowLeft,
  ClipboardList,
  TrendingUp,
  FlaskConical,
  Megaphone,
  Lightbulb,
  Users,
} from "lucide-vue-next";

const SKILL_CATEGORIES = [
  {
    slug: "project-management",
    label: "项目管理类",
    icon: ClipboardList,
    desc: "项目计划、进度跟踪与协作管理",
    bgLight: "bg-blue-50 dark:bg-blue-950/30",
    iconColor: "text-blue-500",
  },
  {
    slug: "business-management",
    label: "经营管理类",
    icon: TrendingUp,
    desc: "经营分析、数据洞察与决策支持",
    bgLight: "bg-violet-50 dark:bg-violet-950/30",
    iconColor: "text-violet-500",
  },
  {
    slug: "product-rd",
    label: "产品研发类",
    icon: FlaskConical,
    desc: "产品设计、技术研发与质量保障",
    bgLight: "bg-emerald-50 dark:bg-emerald-950/30",
    iconColor: "text-emerald-500",
  },
  {
    slug: "marketing",
    label: "市场营销类",
    icon: Megaphone,
    desc: "品牌推广、内容营销与用户增长",
    bgLight: "bg-orange-50 dark:bg-orange-950/30",
    iconColor: "text-orange-500",
  },
  {
    slug: "solutions",
    label: "解决方案类",
    icon: Lightbulb,
    desc: "行业方案、场景化能力与定制集成",
    bgLight: "bg-amber-50 dark:bg-amber-950/30",
    iconColor: "text-amber-500",
  },
  {
    slug: "general",
    label: "通用能力类",
    icon: Zap,
    desc: "跨场景通用能力，可被任意员工调用",
    bgLight: "bg-primary/5",
    iconColor: "text-primary",
  },
];

const route = useRoute();
const categorySlug = computed(() => route.params.category as string);
const currentCat = computed(() => SKILL_CATEGORIES.find((c) => c.slug === categorySlug.value));

// Redirect to index if category slug is invalid
if (!SKILL_CATEGORIES.find((c) => c.slug === route.params.category)) {
  await navigateTo("/skills");
}

const PAGE_SIZE = 12;
const query = ref("");
const currentPage = ref(1);
const showImporter = ref(false);
const form = reactive({ sourceType: "local", source: "" });
const importing = ref(false);
const importError = ref("");
const togglingSkill = ref("");
const toggleError = ref("");
const uploadingDir = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);

const skillsStore = useSkillsStore();
const refresh = () => skillsStore.refresh();
const allSkills = computed(() => skillsStore.list);

watch(categorySlug, () => {
  query.value = "";
  currentPage.value = 1;
  toggleError.value = "";
});

const categorySkills = computed(() => {
  const cat = currentCat.value;
  if (!cat) return [];
  return allSkills.value.filter((s) => s.categoryLabel === cat.label);
});

const filteredSkills = computed(() => {
  let items = categorySkills.value;
  const kw = query.value.trim().toLowerCase();
  if (kw) {
    items = items.filter((s) =>
      [s.name, s.nameZh, s.purpose].some((v) => v?.toLowerCase().includes(kw))
    );
  }
  return items;
});

watch(filteredSkills, () => {
  currentPage.value = 1;
});

const totalPages = computed(() => Math.max(1, Math.ceil(filteredSkills.value.length / PAGE_SIZE)));
const paginatedSkills = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE;
  return filteredSkills.value.slice(start, start + PAGE_SIZE);
});

const visiblePages = computed(() => {
  const tp = totalPages.value;
  const cp = currentPage.value;
  if (tp <= 7) return Array.from({ length: tp }, (_, i) => i + 1);
  const pages: (number | "...")[] = [1];
  if (cp > 3) pages.push("...");
  for (let p = Math.max(2, cp - 1); p <= Math.min(tp - 1, cp + 1); p++) pages.push(p);
  if (cp < tp - 2) pages.push("...");
  pages.push(tp);
  return pages;
});

const stats = computed(() => ({
  total: categorySkills.value.length,
  enabled: categorySkills.value.filter((s) => s.enabled).length,
  inUse: categorySkills.value.filter((s) => s.usageCount > 0).length,
}));

async function handleDirUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const fileList = input.files;
  if (!fileList || fileList.length === 0) return;

  uploadingDir.value = true;
  importError.value = "";
  try {
    const files = await Promise.all(
      Array.from(fileList).map(async (f) => ({
        path: f.webkitRelativePath || f.name,
        content: await f.text(),
      }))
    );
    await $fetch("/api/skills/upload", { method: "POST", body: { files } });
    showImporter.value = false;
    await refresh();
  } catch (error) {
    importError.value = error instanceof Error ? error.message : String(error);
  } finally {
    uploadingDir.value = false;
    input.value = "";
  }
}

async function importSkill() {
  importing.value = true;
  importError.value = "";
  try {
    await $fetch("/api/skills/import", { method: "POST", body: form });
    form.source = "";
    showImporter.value = false;
    await refresh();
  } catch (error) {
    importError.value = error instanceof Error ? error.message : String(error);
  } finally {
    importing.value = false;
  }
}

async function toggleSkill(name: string, enabled: boolean) {
  togglingSkill.value = name;
  toggleError.value = "";
  try {
    await skillsStore.toggleSkill(name, enabled);
  } catch (err) {
    toggleError.value = err instanceof Error ? err.message : String(err);
  } finally {
    togglingSkill.value = "";
  }
}
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6 p-6 lg:p-8">
    <!-- Back + Header -->
    <div class="space-y-3">
      <NuxtLink
        to="/skills"
        class="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft class="h-4 w-4" :stroke-width="1.8" />
        技能中心
      </NuxtLink>

      <div class="flex items-start justify-between gap-4">
        <div class="flex items-center gap-3">
          <div
            v-if="currentCat"
            :class="[currentCat.bgLight, 'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl']"
          >
            <component
              :is="currentCat.icon"
              :class="[currentCat.iconColor, 'h-5 w-5']"
              :stroke-width="1.8"
            />
          </div>
          <div>
            <span class="section-label">能力管理</span>
            <h1 class="font-display text-2xl font-bold tracking-tight">
              {{ currentCat?.label ?? '技能列表' }}
            </h1>
            <p class="text-sm text-muted-foreground">{{ currentCat?.desc }}</p>
          </div>
        </div>
        <button
          class="btn-primary shrink-0"
          @click="showImporter = true; importError = ''"
        >
          <Download class="h-4 w-4" :stroke-width="2" />
          导入技能
        </button>
      </div>
    </div>

    <!-- Stats Strip -->
    <div class="flex gap-6 text-sm">
      <div class="flex items-center gap-2 text-muted-foreground">
        <Zap class="h-4 w-4 text-primary" :stroke-width="1.8" />
        <span><strong class="text-foreground">{{ stats.total }}</strong> 个技能</span>
      </div>
      <div class="flex items-center gap-2 text-muted-foreground">
        <Sparkles class="h-4 w-4 text-primary" :stroke-width="1.8" />
        <span><strong class="text-foreground">{{ stats.enabled }}</strong> 已启用</span>
      </div>
      <div class="flex items-center gap-2 text-muted-foreground">
        <Users class="h-4 w-4 text-primary" :stroke-width="1.8" />
        <span><strong class="text-foreground">{{ stats.inUse }}</strong> 被使用</span>
      </div>
    </div>

    <!-- Search Bar -->
    <div>
      <label class="inline-flex items-center gap-2 rounded-lg border border-input bg-card px-3 py-2 transition-all duration-150 focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10">
        <Search class="h-4 w-4 text-muted-foreground" :stroke-width="1.8" />
        <input
          v-model="query"
          placeholder="搜索技能…"
          class="w-48 border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground lg:w-64"
        />
      </label>
    </div>

    <!-- Toggle Error -->
    <p
      v-if="toggleError"
      class="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      操作失败：{{ toggleError }}
    </p>

    <!-- Skill Cards Grid -->
    <div class="stagger-in grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div
        v-for="skill in paginatedSkills"
        :key="skill.name"
        class="flex flex-col rounded-2xl border bg-card p-5 transition-all duration-150"
        :class="
          skill.enabled
            ? 'border-border hover:border-primary/20 hover:shadow-md hover:shadow-primary/5'
            : 'border-border/50 opacity-60 hover:opacity-80'
        "
      >
        <!-- Card Top: Icon + Status -->
        <div class="mb-3 flex items-start justify-between">
          <div
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            :class="skill.enabled ? 'bg-primary/10' : 'bg-muted'"
          >
            <Zap
              class="h-5 w-5"
              :class="skill.enabled ? 'text-primary' : 'text-muted-foreground'"
              :stroke-width="1.8"
            />
          </div>
          <span
            class="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
            :class="skill.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'"
          >
            {{ skill.statusLabel }}
          </span>
        </div>

        <!-- Name + Source -->
        <div class="mb-1 flex min-w-0 items-center gap-2">
          <h3 class="min-w-0 truncate text-sm font-semibold">{{ skill.nameZh || skill.name }}</h3>
          <span
            v-if="skill.nameZh"
            class="shrink-0 whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
          >
            {{ skill.name }}
          </span>
          <span
            v-else-if="skill.source !== 'builtin'"
            class="shrink-0 whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground"
          >
            {{ skill.sourceType }}
          </span>
        </div>

        <!-- Purpose Description -->
        <p class="line-clamp-2 flex-1 text-xs leading-relaxed text-muted-foreground">
          {{ skill.purpose }}
        </p>

        <!-- Card Footer: Usage + Toggle -->
        <div class="mt-4 flex items-center justify-between gap-2 border-t border-border/50 pt-3">
          <span v-if="skill.usageCount > 0" class="text-xs text-muted-foreground">
            {{ skill.usageCount }} 名员工使用
          </span>
          <span v-else class="text-xs text-muted-foreground/50">暂未被使用</span>

          <button
            v-if="skill.source !== 'builtin' || skill.sourceUri"
            class="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
            :disabled="togglingSkill === skill.name"
            @click="toggleSkill(skill.name, !skill.enabled)"
          >
            <Loader2 v-if="togglingSkill === skill.name" class="inline h-3 w-3 animate-spin" />
            {{ skill.enabled ? "停用" : "启用" }}
          </button>
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="flex items-center justify-between border-t border-border pt-4">
      <p class="text-sm text-muted-foreground">
        共 <strong class="text-foreground">{{ filteredSkills.length }}</strong> 个技能，第 {{ currentPage }} / {{ totalPages }} 页
      </p>
      <div class="flex items-center gap-1">
        <button
          class="rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-40"
          :disabled="currentPage === 1"
          @click="currentPage--"
        >上一页</button>
        <template v-for="p in visiblePages" :key="String(p)">
          <span v-if="p === '...'" class="px-1 text-muted-foreground">…</span>
          <button
            v-else
            class="min-w-[2rem] rounded-lg border px-2 py-1.5 text-sm font-medium transition-colors"
            :class="p === currentPage ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted'"
            @click="currentPage = p"
          >{{ p }}</button>
        </template>
        <button
          class="rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-40"
          :disabled="currentPage === totalPages"
          @click="currentPage++"
        >下一页</button>
      </div>
    </div>

    <!-- Empty State -->
    <div
      v-if="filteredSkills.length === 0"
      class="flex flex-col items-center rounded-2xl border border-dashed border-border bg-muted/10 px-6 py-16 text-center"
    >
      <div class="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/5">
        <Sparkles class="h-7 w-7 text-primary/30" :stroke-width="1.5" />
      </div>
      <p class="font-medium">该分类下暂无技能</p>
      <p class="mt-1 max-w-xs text-sm text-muted-foreground">
        {{ query ? '修改搜索条件，或导入新技能。' : '点击「导入技能」将技能添加到此分类。' }}
      </p>
      <button
        v-if="!query"
        class="btn-primary mt-4"
        @click="showImporter = true; importError = ''"
      >
        <Download class="h-4 w-4" :stroke-width="2" />
        导入技能
      </button>
    </div>

    <!-- Import Slide-over -->
    <Teleport to="body">
      <Transition name="slide-over">
        <div v-if="showImporter" class="fixed inset-0 z-50 flex justify-end">
          <div
            class="absolute inset-0 bg-foreground/20 backdrop-blur-sm"
            @click="showImporter = false"
          />
          <div class="slide-over-panel relative w-full max-w-md overflow-y-auto bg-card shadow-2xl">
            <div
              class="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/95 px-6 py-4 backdrop-blur-sm"
            >
              <div>
                <span class="section-label">导入</span>
                <h2 class="mt-0.5 text-lg font-semibold">导入新技能</h2>
              </div>
              <button
                class="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                @click="showImporter = false"
              >
                <X class="h-5 w-5" :stroke-width="1.8" />
              </button>
            </div>

            <div class="p-6">
              <form class="space-y-4" @submit.prevent="importSkill">
                <label class="block space-y-1.5">
                  <span class="text-sm font-medium">来源类型</span>
                  <select v-model="form.sourceType" class="input-field">
                    <option value="local">本地目录</option>
                    <option value="git">Git 仓库</option>
                  </select>
                </label>
                <label class="block space-y-1.5">
                  <span class="text-sm font-medium">来源地址</span>
                  <div class="flex gap-2">
                    <div
                      class="flex flex-1 items-center gap-2 rounded-lg border border-input bg-background px-3 py-2.5"
                    >
                      <FolderInput
                        v-if="form.sourceType === 'local'"
                        class="h-4 w-4 shrink-0 text-muted-foreground"
                        :stroke-width="1.8"
                      />
                      <GitBranch
                        v-else
                        class="h-4 w-4 shrink-0 text-muted-foreground"
                        :stroke-width="1.8"
                      />
                      <input
                        v-model="form.source"
                        :placeholder="
                          form.sourceType === 'local' ? '选择或输入本地目录路径' : 'Git 仓库地址'
                        "
                        class="w-full border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                      />
                    </div>
                    <template v-if="form.sourceType === 'local'">
                      <input
                        ref="fileInputRef"
                        type="file"
                        webkitdirectory
                        class="sr-only"
                        @change="handleDirUpload"
                      />
                      <button
                        type="button"
                        class="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                        :disabled="uploadingDir"
                        @click="fileInputRef?.click()"
                      >
                        <Loader2 v-if="uploadingDir" class="h-4 w-4 animate-spin" />
                        <FolderOpen v-else class="h-4 w-4" :stroke-width="1.8" />
                        {{ uploadingDir ? "上传中..." : "浏览上传" }}
                      </button>
                    </template>
                  </div>
                </label>
                <button
                  class="btn-primary w-full justify-center"
                  :disabled="importing || !form.source.trim()"
                >
                  <Loader2 v-if="importing" class="mr-1.5 inline h-3.5 w-3.5 animate-spin" />
                  {{ importing ? "导入中..." : "导入技能" }}
                </button>
                <p
                  v-if="importError"
                  class="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {{ importError }}
                </p>
              </form>

              <div class="mt-8 rounded-lg bg-muted/30 p-4">
                <p class="text-sm font-medium">导入说明</p>
                <ul class="mt-2 space-y-1.5 text-xs text-muted-foreground">
                  <li>
                    • <strong>本地目录</strong>：点击「浏览上传」从本机选取技能目录自动上传，或直接粘贴服务端绝对路径后点「导入技能」
                  </li>
                  <li>• <strong>Git 仓库</strong>：支持 HTTPS 或 SSH 格式的仓库地址</li>
                  <li>• 导入后技能默认处于停用状态，需手动启用</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
