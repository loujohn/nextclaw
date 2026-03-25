<script setup lang="ts">
import { Search, FolderInput, GitBranch, Sparkles, Loader2, Plus, X, Download, Users, Zap, FolderOpen } from "lucide-vue-next";

type SkillItem = {
  name: string;
  source: string;
  sourceType: string;
  sourceUri: string | null;
  enabled: boolean;
  usageCount: number;
  usedBy: string[];
  statusLabel: string;
  purpose: string;
  categoryLabel: string;
};

type SkillListPayload = { ok: boolean; data: SkillItem[] };

const query = ref("");
const showImporter = ref(false);
const activeCategory = ref<string | null>(null);
const form = reactive({ sourceType: "local", source: "" });
const importing = ref(false);
const importError = ref("");
const togglingSkill = ref("");
const uploadingDir = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);

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
        content: await f.text()
      }))
    );
    await $fetch("/api/skills/upload", { method: "POST", body: { files } });
    showImporter.value = false;
    await refresh();
  } catch (error) {
    importError.value = error instanceof Error ? error.message : String(error);
  } finally {
    uploadingDir.value = false;
    // reset so same folder can be re-selected
    input.value = "";
  }
}
const { data, refresh } = await useFetch<SkillListPayload>("/api/skills");

const allSkills = computed(() => data.value?.data ?? []);
const categories = computed(() => {
  const map = new Map<string, SkillItem[]>();
  for (const s of allSkills.value) {
    const cat = s.categoryLabel || "其他";
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(s);
  }
  return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
});

const filteredSkills = computed(() => {
  let items = allSkills.value;
  if (activeCategory.value) items = items.filter((s) => s.categoryLabel === activeCategory.value);
  const kw = query.value.trim().toLowerCase();
  if (kw) items = items.filter((s) => [s.name, s.purpose, s.categoryLabel].some((v) => v.toLowerCase().includes(kw)));
  return items;
});

const stats = computed(() => ({
  total: allSkills.value.length,
  enabled: allSkills.value.filter((s) => s.enabled).length,
  inUse: allSkills.value.filter((s) => s.usageCount > 0).length
}));

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
  try {
    await $fetch(`/api/skills/${name}/state`, { method: "PATCH", body: { enabled } });
    await refresh();
  } finally {
    togglingSkill.value = "";
  }
}
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6 p-6 lg:p-8">
    <!-- Header -->
    <div class="hero-section flex items-start justify-between gap-4">
      <div class="relative space-y-1">
        <span class="section-label">能力管理</span>
        <h1 class="font-display text-3xl font-bold tracking-tight">技能中心</h1>
        <p class="text-sm text-muted-foreground">查看、导入和管理你的技能能力库。</p>
      </div>
      <button class="btn-primary shrink-0" @click="showImporter = true; importError = ''">
        <Download class="h-4 w-4" :stroke-width="2" />
        导入技能
      </button>
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

    <!-- Category Tabs + Search -->
    <div class="flex flex-wrap items-center gap-3">
      <button
        class="rounded-full px-3 py-1.5 text-sm font-medium transition-all"
        :class="activeCategory === null ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'"
        @click="activeCategory = null"
      >
        全部
      </button>
      <button
        v-for="[cat, items] in categories"
        :key="cat"
        class="rounded-full px-3 py-1.5 text-sm font-medium transition-all"
        :class="activeCategory === cat ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'"
        @click="activeCategory = activeCategory === cat ? null : cat"
      >
        {{ cat }} <span class="ml-1 opacity-60">{{ items.length }}</span>
      </button>
      <div class="ml-auto">
        <label class="flex items-center gap-2 rounded-lg border border-input bg-card px-3 py-2 transition-all duration-150 focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10">
          <Search class="h-4 w-4 text-muted-foreground" :stroke-width="1.8" />
          <input
            v-model="query"
            placeholder="搜索技能…"
            class="w-32 border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground lg:w-48"
          />
        </label>
      </div>
    </div>

    <!-- Skill List -->
    <div class="stagger-in space-y-2">
      <article
        v-for="skill in filteredSkills"
        :key="skill.name"
        class="flex items-center gap-4 rounded-xl border bg-card px-5 py-4 transition-all duration-150"
        :class="skill.enabled ? 'border-border hover:border-primary/20 hover:shadow-sm' : 'border-border/50 opacity-60 hover:opacity-80'"
      >
        <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" :class="skill.enabled ? 'bg-primary/10' : 'bg-muted'">
          <Zap class="h-5 w-5" :class="skill.enabled ? 'text-primary' : 'text-muted-foreground'" :stroke-width="1.8" />
        </div>

        <div class="min-w-0 flex-1">
          <div class="flex min-w-0 items-center gap-2">
            <h3 class="min-w-0 truncate text-sm font-semibold">{{ skill.name }}</h3>
            <span class="shrink-0 whitespace-nowrap rounded-full bg-primary/8 px-2 py-0.5 text-[10px] font-semibold text-primary">{{ skill.categoryLabel }}</span>
            <span v-if="skill.source !== 'builtin'" class="shrink-0 whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{{ skill.sourceType }}</span>
          </div>
          <p class="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{{ skill.purpose }}</p>
        </div>

        <div class="flex shrink-0 items-center gap-3">
          <span v-if="skill.usageCount > 0" class="text-xs text-muted-foreground">{{ skill.usageCount }} 名员工</span>
          <span
            class="w-20 shrink-0 whitespace-nowrap text-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
            :class="skill.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'"
          >
            {{ skill.statusLabel }}
          </span>
          <button
            v-if="skill.source !== 'builtin' || skill.sourceUri"
            class="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
            :disabled="togglingSkill === skill.name"
            @click="toggleSkill(skill.name, !skill.enabled)"
          >
            <Loader2 v-if="togglingSkill === skill.name" class="inline h-3 w-3 animate-spin" />
            {{ skill.enabled ? "停用" : "启用" }}
          </button>
        </div>
      </article>

      <div
        v-if="filteredSkills.length === 0"
        class="flex flex-col items-center rounded-2xl border border-dashed border-border bg-muted/10 px-6 py-12 text-center"
      >
        <div class="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/5">
          <Sparkles class="h-7 w-7 text-primary/30" :stroke-width="1.5" />
        </div>
        <p class="font-medium">没有符合条件的技能</p>
        <p class="mt-1 max-w-xs text-sm text-muted-foreground">修改搜索条件，或导入新技能。</p>
      </div>
    </div>

    <!-- Import Slide-over -->
    <Teleport to="body">
      <Transition name="slide-over">
        <div v-if="showImporter" class="fixed inset-0 z-50 flex justify-end">
          <div class="absolute inset-0 bg-foreground/20 backdrop-blur-sm" @click="showImporter = false" />
          <div class="slide-over-panel relative w-full max-w-md overflow-y-auto bg-card shadow-2xl">
            <div class="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/95 px-6 py-4 backdrop-blur-sm">
              <div>
                <span class="section-label">导入</span>
                <h2 class="mt-0.5 text-lg font-semibold">导入新技能</h2>
              </div>
              <button class="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" @click="showImporter = false">
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
                    <div class="flex flex-1 items-center gap-2 rounded-lg border border-input bg-background px-3 py-2.5">
                      <FolderInput v-if="form.sourceType === 'local'" class="h-4 w-4 shrink-0 text-muted-foreground" :stroke-width="1.8" />
                      <GitBranch v-else class="h-4 w-4 shrink-0 text-muted-foreground" :stroke-width="1.8" />
                      <input
                        v-model="form.source"
                        :placeholder="form.sourceType === 'local' ? '选择或输入本地目录路径' : 'Git 仓库地址'"
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
                        {{ uploadingDir ? '上传中...' : '浏览上传' }}
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
                <p v-if="importError" class="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{{ importError }}</p>
              </form>

              <div class="mt-8 rounded-lg bg-muted/30 p-4">
                <p class="text-sm font-medium">导入说明</p>
                <ul class="mt-2 space-y-1.5 text-xs text-muted-foreground">
                  <li>• <strong>本地目录</strong>：点击「浏览上传」从本机选取技能目录自动上传，或直接粘贴服务端绝对路径后点「导入技能」</li>
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
