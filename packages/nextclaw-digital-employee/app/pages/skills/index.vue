<script setup lang="ts">
type SkillListPayload = {
  ok: boolean;
  data: Array<{
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
  }>;
};

const query = ref("");
const form = reactive({
  sourceType: "local",
  source: ""
});
const importing = ref(false);
const importError = ref("");
const togglingSkill = ref("");
const { data, refresh } = await useFetch<SkillListPayload>("/api/skills");

const filteredSkills = computed(() => {
  const keyword = query.value.trim().toLowerCase();
  const items = data.value?.data ?? [];
  if (!keyword) {
    return items;
  }
  return items.filter((skill) =>
    [skill.name, skill.purpose, skill.categoryLabel].some((value) => value.toLowerCase().includes(keyword))
  );
});

async function importSkill() {
  importing.value = true;
  importError.value = "";
  try {
    await $fetch("/api/skills/import", {
      method: "POST",
      body: form
    });
    form.source = "";
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
    await $fetch(`/api/skills/${name}/state`, {
      method: "PATCH",
      body: { enabled }
    });
    await refresh();
  } finally {
    togglingSkill.value = "";
  }
}
</script>

<template>
  <main class="app-shell">
    <AppNav />
    <section class="page-panel skill-page-shell">
      <div class="page-heading">
        <div>
          <p class="eyebrow">Skill Center</p>
          <h1>先看技能目录和用途，再决定哪些能力应该分配给员工</h1>
          <p class="hero-copy compact">主视图只保留业务相关的信息：能力用途、引用关系、状态和来源类型，导入是次级动作。</p>
        </div>
      </div>

      <div class="skill-layout">
        <section class="stack-card skill-catalog-panel">
          <div class="section-header">
            <div>
              <p class="eyebrow">Catalog</p>
              <h2>技能目录</h2>
            </div>
            <label class="search-field">
              <AppIcon name="spark" :size="16" />
              <input v-model="query" placeholder="搜索技能名称、用途或分类" />
            </label>
          </div>

          <div class="skill-catalog">
            <article v-for="skill in filteredSkills" :key="skill.name" class="skill-catalog-card">
              <div class="card-row">
                <div>
                  <p class="eyebrow">Skill</p>
                  <h2>{{ skill.name }}</h2>
                </div>
                <StatusBadge :label="skill.statusLabel" :tone="skill.enabled ? 'teal' : 'amber'" />
              </div>

              <p class="skill-purpose">{{ skill.purpose }}</p>

              <div class="skill-catalog-meta">
                <span class="pill">{{ skill.categoryLabel }}</span>
                <span class="pill">来源：{{ skill.sourceType }}</span>
                <span class="pill">已被 {{ skill.usageCount }} 名员工使用</span>
              </div>

              <div class="tag-list">
                <span v-for="employeeName in skill.usedBy" :key="employeeName" class="tag-item">{{ employeeName }}</span>
                <span v-if="skill.usedBy.length === 0" class="muted">还没有员工使用这个技能</span>
              </div>

              <div class="card-row">
                <span class="muted">{{ skill.source === 'builtin' ? '内置技能' : '导入技能' }}</span>
                <button
                  v-if="skill.source !== 'builtin' || skill.sourceUri"
                  class="ghost-link button-reset"
                  :disabled="togglingSkill === skill.name"
                  @click="toggleSkill(skill.name, !skill.enabled)"
                >
                  {{ skill.enabled ? "停用" : "启用" }}
                </button>
              </div>
            </article>

            <EmptyState
              v-if="filteredSkills.length === 0"
              title="没有符合条件的技能"
              description="可以修改搜索条件，或者通过右侧导入新的技能。"
            />
          </div>
        </section>

        <aside class="stack-card import-panel">
          <div class="section-header">
            <div>
              <p class="eyebrow">Import</p>
              <h2>导入新技能</h2>
            </div>
          </div>

          <form class="stack-form" @submit.prevent="importSkill">
            <label>
              来源类型
              <select v-model="form.sourceType">
                <option value="local">本地目录</option>
                <option value="git">Git 仓库</option>
              </select>
            </label>

            <label>
              来源
              <input v-model="form.source" placeholder="本地路径或 Git 地址" />
            </label>

            <button class="primary-button" :disabled="importing">
              {{ importing ? "导入中..." : "导入技能" }}
            </button>
            <p v-if="importError" class="error-text">{{ importError }}</p>
          </form>
        </aside>
      </div>
    </section>
  </main>
</template>
