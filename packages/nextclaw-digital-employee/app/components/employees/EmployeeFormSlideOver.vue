<script setup lang="ts">
import { ref, computed, watch, reactive } from "vue";
import { Search, ChevronRight, ChevronLeft, Sparkles, X, ChevronDown } from "lucide-vue-next";

type SkillOption = {
  name: string;
  nameZh?: string;
  purpose: string;
  categoryLabel: string;
};

type DeptOption = { id: string; label: string };

type FormData = {
  id?: string;
  name: string;
  code: string;
  description: string;
  systemPrompt: string;
  model: string;
  departmentId: string | null;
  heartbeatContent: string;
  userContent: string;
  bootContent: string;
  agentsContent: string;
  skillNames: string[];
  scheduleKind: string;
  cronExpr: string;
  everyMs: number;
};

const props = defineProps<{
  mode: "create" | "edit";
  visible: boolean;
  form: FormData;
  skills: SkillOption[];
  deptTreeOptions: DeptOption[];
  saving: boolean;
  error: string;
  loading?: boolean;
}>();

const emit = defineEmits<{
  "update:visible": [value: boolean];
  submit: [];
}>();

const SKILL_CATEGORIES = ["项目管理类", "经营管理类", "产品研发类", "市场营销类", "解决方案类", "通用能力类"];
const SKILL_PAGE_SIZE = 8;

const STEPS = [
  { title: "基础信息", desc: "定义员工的身份与角色" },
  { title: "工作设定", desc: "模型与行为偏好" },
  { title: "能力配置", desc: "选择员工可使用的技能" },
  { title: "自动任务", desc: "定义周期性执行策略" },
];

const currentStep = ref(0);
const showAdvanced = ref(false);
const touched = reactive({ name: false, departmentId: false });

const skillSearch = ref("");
const skillCategory = ref<string | null>(null);
const skillPage = ref(1);

const filteredSkills = computed(() => {
  let items = props.skills;
  if (skillCategory.value) items = items.filter(s => s.categoryLabel === skillCategory.value);
  const kw = skillSearch.value.trim().toLowerCase();
  if (kw) items = items.filter(s =>
    s.name.toLowerCase().includes(kw) || (s.nameZh ?? "").toLowerCase().includes(kw) || s.purpose.toLowerCase().includes(kw)
  );
  return items;
});

watch([filteredSkills], () => {
  skillPage.value = 1;
});

const skillTotalPages = computed(() => Math.max(1, Math.ceil(filteredSkills.value.length / SKILL_PAGE_SIZE)));
const paginatedSkills = computed(() => {
  const start = (skillPage.value - 1) * SKILL_PAGE_SIZE;
  return filteredSkills.value.slice(start, start + SKILL_PAGE_SIZE);
});

const title = computed(() => props.mode === "create" ? "新建员工" : "编辑员工");
const subtitle = computed(() => props.mode === "create" ? "三步创建" : "更新员工信息");
const submitLabel = computed(() => {
  if (props.saving) return props.mode === "create" ? "创建中..." : "保存中...";
  return props.mode === "create" ? "创建并进入工作台" : "保存修改";
});

watch(() => props.visible, (val) => {
  if (val) {
    currentStep.value = 0;
    showAdvanced.value = false;
    Object.assign(touched, { name: false, departmentId: false });
    skillSearch.value = "";
    skillCategory.value = null;
    skillPage.value = 1;
  }
});

function close() { emit("update:visible", false); }

function onFormSubmit() {
  if (currentStep.value < STEPS.length - 1) {
    currentStep.value++;
    return;
  }
  touched.departmentId = true;
  if (!props.form.departmentId) {
    currentStep.value = 0;
    return;
  }
  emit("submit");
}
</script>

<template>
  <Teleport to="body">
    <Transition name="slide-over">
      <div v-if="visible" class="fixed inset-0 z-50 flex justify-end">
        <div class="absolute inset-0 bg-foreground/20 backdrop-blur-sm" @click="close" />
        <div class="slide-over-panel relative w-full max-w-md overflow-y-auto bg-card shadow-2xl">
          <div class="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/95 px-6 py-4 backdrop-blur-sm">
            <div>
              <span class="section-label">{{ title }}</span>
              <h2 class="mt-0.5 text-lg font-semibold">{{ subtitle }}</h2>
            </div>
            <button class="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" @click="close">
              <X class="h-5 w-5" :stroke-width="1.8" />
            </button>
          </div>

          <div class="p-6">
            <div v-if="mode === 'edit' && loading" class="rounded-lg bg-muted/50 px-3 py-3 text-sm text-muted-foreground">
              加载员工信息中...
            </div>

            <template v-else>
              <div class="mb-6 flex gap-2">
                <button
                  v-for="(s, i) in STEPS" :key="s.title" type="button"
                  class="flex flex-1 flex-col items-center gap-1 rounded-lg p-2.5 text-center transition-all"
                  :class="currentStep === i ? 'bg-primary/5 ring-1 ring-primary/20' : 'hover:bg-muted/50'"
                  @click="currentStep = i"
                >
                  <span
                    class="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold"
                    :class="currentStep === i ? 'bg-primary text-primary-foreground' : currentStep > i ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'"
                  >{{ i + 1 }}</span>
                  <span class="text-[11px] font-medium" :class="currentStep === i ? 'text-foreground' : 'text-muted-foreground'">{{ s.title }}</span>
                </button>
              </div>

              <form class="space-y-4" @submit.prevent="onFormSubmit">
                <!-- Step 0: 基础信息 -->
                <div v-if="currentStep === 0" class="space-y-3">
                  <label v-if="mode === 'edit'" class="block space-y-1.5">
                    <span class="text-sm font-medium">编码</span>
                    <input :value="form.code" class="input-field bg-muted/50 text-muted-foreground" disabled />
                    <p class="text-[11px] text-muted-foreground">编码不可修改</p>
                  </label>

                  <label class="block space-y-1.5">
                    <span class="text-sm font-medium">名称 <span class="text-destructive">*</span></span>
                    <input
                      v-model="form.name" required placeholder="例如：项目管理助手" class="input-field"
                      :class="mode === 'create' && touched.name && !form.name.trim() && 'border-destructive/50 focus:border-destructive focus:ring-destructive/10'"
                      @blur="touched.name = true"
                    />
                    <p v-if="mode === 'create' && touched.name && !form.name.trim()" class="text-xs text-destructive">请输入名称</p>
                    <p v-if="mode === 'create'" class="text-[11px] text-muted-foreground">给这位员工起一个容易识别的名字</p>
                  </label>

                  <label class="block space-y-1.5">
                    <span class="text-sm font-medium">所属部门 <span class="text-destructive">*</span></span>
                    <select
                      v-model="form.departmentId" class="input-field"
                      :class="touched.departmentId && !form.departmentId && 'border-destructive/50 focus:border-destructive focus:ring-destructive/10'"
                      @change="touched.departmentId = true"
                    >
                      <option :value="null">— 请选择部门 —</option>
                      <option v-for="opt in deptTreeOptions" :key="opt.id" :value="opt.id">{{ opt.label }}</option>
                    </select>
                    <p v-if="touched.departmentId && !form.departmentId" class="text-xs text-destructive">请选择所属部门</p>
                    <p v-else class="text-[11px] text-muted-foreground">将员工归入某个组织部门</p>
                  </label>

                  <label v-if="mode === 'create'" class="block space-y-1.5">
                    <span class="text-sm font-medium">编码<span class="ml-1 text-xs text-muted-foreground">可选</span></span>
                    <input v-model="form.code" placeholder="默认按名称自动生成" class="input-field" />
                    <p class="text-[11px] text-muted-foreground">系统内唯一标识，留空则自动生成</p>
                  </label>

                  <label class="block space-y-1.5">
                    <span class="text-sm font-medium">职责描述</span>
                    <textarea v-model="form.description" rows="2" placeholder="描述它负责哪些业务结果…" class="input-field" />
                    <p class="text-[11px] text-muted-foreground">帮助团队理解这位员工的核心职责</p>
                  </label>

                  <label class="block space-y-1.5">
                    <span class="text-sm font-medium">角色设定</span>
                    <textarea v-model="form.systemPrompt" rows="4" placeholder="定义角色人格、行为风格、输出边界和工作原则…" class="input-field" />
                    <p class="text-[11px] text-muted-foreground">定义这位员工的性格特征、行为准则和工作方式</p>
                  </label>
                </div>

                <!-- Step 1: 工作设定 -->
                <div v-else-if="currentStep === 1" class="space-y-3">
                  <label class="block space-y-1.5">
                    <span class="text-sm font-medium">使用模型</span>
                    <input v-model="form.model" placeholder="留空使用系统默认模型" class="input-field" :list="`${mode}-model-suggestions`" />
                    <datalist :id="`${mode}-model-suggestions`">
                      <option value="openai/gpt-4.1" />
                      <option value="openai/gpt-4.1-mini" />
                      <option value="openai/gpt-4.1-nano" />
                      <option value="openai/o3" />
                      <option value="openai/o4-mini" />
                      <option value="anthropic/claude-sonnet-4-20250514" />
                      <option value="anthropic/claude-haiku-3.5" />
                    </datalist>
                    <p class="text-[11px] text-muted-foreground">指定该员工使用的 AI 模型，格式为 <code class="rounded bg-muted px-1 py-0.5 text-[10px]">provider/model</code></p>
                  </label>

                  <label class="block space-y-1.5">
                    <span class="text-sm font-medium">服务对象</span>
                    <textarea v-model="form.userContent" rows="3" placeholder="名称、称呼方式、时区、关注重点…" class="input-field" />
                    <p class="text-[11px] text-muted-foreground">描述这位员工服务的用户或团队，帮助它更好地理解上下文</p>
                  </label>

                  <label class="block space-y-1.5">
                    <span class="text-sm font-medium">心跳巡检内容</span>
                    <textarea v-model="form.heartbeatContent" rows="3" :placeholder="mode === 'create' ? '定期检查的事项，如监控指标、待办进度、数据同步状态…' : '定期检查的事项…'" class="input-field" />
                    <p class="text-[11px] text-muted-foreground">心跳模式下，员工会按周期执行这些检查任务</p>
                  </label>

                  <!-- Create: advanced toggle for boot & agents -->
                  <template v-if="mode === 'create'">
                    <button
                      type="button"
                      class="flex w-full items-center gap-1.5 rounded-lg px-1 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                      @click="showAdvanced = !showAdvanced"
                    >
                      <ChevronDown class="h-3.5 w-3.5 transition-transform" :class="showAdvanced && 'rotate-180'" />
                      {{ showAdvanced ? '收起高级设定' : '展开高级设定' }}
                    </button>
                    <template v-if="showAdvanced">
                      <label class="block space-y-1.5">
                        <span class="text-sm font-medium">启动任务</span>
                        <textarea v-model="form.bootContent" rows="3" placeholder="员工启动时自动执行的指令，如发送问候、读取最新数据…" class="input-field" />
                        <p class="text-[11px] text-muted-foreground">每次启动时首先执行的操作清单</p>
                      </label>
                      <label class="block space-y-1.5">
                        <span class="text-sm font-medium">操作规则</span>
                        <textarea v-model="form.agentsContent" rows="4" placeholder="自定义工作规则：记忆管理、安全策略、沟通方式…" class="input-field" />
                        <p class="text-[11px] text-muted-foreground">覆盖或补充默认的工作行为规范</p>
                      </label>
                    </template>
                  </template>

                  <!-- Edit: always show boot & agents -->
                  <template v-if="mode === 'edit'">
                    <label class="block space-y-1.5">
                      <span class="text-sm font-medium">启动任务</span>
                      <textarea v-model="form.bootContent" rows="3" placeholder="员工启动时自动执行的指令…" class="input-field" />
                      <p class="text-[11px] text-muted-foreground">每次启动时首先执行的操作清单</p>
                    </label>
                    <label class="block space-y-1.5">
                      <span class="text-sm font-medium">操作规则</span>
                      <textarea v-model="form.agentsContent" rows="4" placeholder="自定义工作规则：记忆管理、安全策略、沟通方式…" class="input-field" />
                      <p class="text-[11px] text-muted-foreground">覆盖或补充默认的工作行为规范</p>
                    </label>
                  </template>
                </div>

                <!-- Step 2: 能力配置 -->
                <div v-else-if="currentStep === 2" class="space-y-3">
                  <div class="flex items-start gap-2 rounded-lg bg-primary/5 p-3 text-sm text-primary">
                    <Sparkles class="mt-0.5 h-4 w-4 shrink-0" :stroke-width="1.8" />
                    <p>优先选择已启用且职责明确的技能。</p>
                  </div>
                  <div class="space-y-2">
                    <label class="flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10">
                      <Search class="h-3.5 w-3.5 shrink-0 text-muted-foreground" :stroke-width="1.8" />
                      <input v-model="skillSearch" placeholder="按名称搜索技能…" class="w-full border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
                    </label>
                    <div class="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        class="rounded-full px-2.5 py-1 text-xs font-medium transition-all"
                        :class="skillCategory === null ? 'bg-primary text-primary-foreground' : 'bg-muted/60 text-muted-foreground hover:bg-muted'"
                        @click="skillCategory = null"
                      >全部</button>
                      <button
                        v-for="cat in SKILL_CATEGORIES" :key="cat" type="button"
                        class="rounded-full px-2.5 py-1 text-xs font-medium transition-all"
                        :class="skillCategory === cat ? 'bg-primary text-primary-foreground' : 'bg-muted/60 text-muted-foreground hover:bg-muted'"
                        @click="skillCategory = skillCategory === cat ? null : cat"
                      >{{ cat }}</button>
                    </div>
                  </div>
                  <label
                    v-for="skill in paginatedSkills" :key="skill.name"
                    class="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 transition-all hover:bg-muted/30"
                    :class="form.skillNames.includes(skill.name) && 'border-primary/30 bg-primary/5'"
                  >
                    <input v-model="form.skillNames" type="checkbox" :value="skill.name" class="mt-0.5 h-4 w-4 accent-primary" />
                    <div class="min-w-0">
                      <div class="flex items-center gap-2">
                        <p class="text-sm font-medium">{{ skill.nameZh || skill.name }}</p>
                        <span class="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{{ skill.categoryLabel }}</span>
                      </div>
                      <p class="mt-0.5 text-xs text-muted-foreground">{{ skill.purpose }}</p>
                    </div>
                  </label>
                  <!-- 技能分页 -->
                  <div v-if="skillTotalPages > 1" class="flex items-center justify-between border-t border-border pt-2">
                    <span class="text-xs text-muted-foreground">{{ filteredSkills.length }} 个技能 · 第 {{ skillPage }}/{{ skillTotalPages }} 页</span>
                    <div class="flex items-center gap-1">
                      <button
                        type="button"
                        class="rounded border border-border px-2 py-1 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-40"
                        :disabled="skillPage === 1"
                        @click="skillPage--"
                      >上一页</button>
                      <button
                        type="button"
                        class="rounded border border-border px-2 py-1 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-40"
                        :disabled="skillPage === skillTotalPages"
                        @click="skillPage++"
                      >下一页</button>
                    </div>
                  </div>
                </div>

                <!-- Step 3: 自动任务 -->
                <div v-else-if="currentStep === 3" class="space-y-3">
                  <div class="grid gap-2">
                    <label
                      v-for="opt in [
                        { value: 'none', title: '仅手动触发', desc: '不创建自动任务，需要时手动运行' },
                        { value: 'cron', title: '每日定时', desc: '适合日报、巡检、总结和推送' },
                        { value: 'every', title: '固定间隔', desc: '适合持续巡检或短周期同步' },
                        { value: 'heartbeat', title: '心跳巡检', desc: '适合轻量检查和持续状态感知' }
                      ]" :key="opt.value"
                      class="flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 transition-all"
                      :class="form.scheduleKind === opt.value ? 'border-primary/30 bg-primary/5' : 'border-border hover:bg-muted/30'"
                    >
                      <input v-model="form.scheduleKind" type="radio" :value="opt.value" class="mt-0.5 h-4 w-4 accent-primary" />
                      <div>
                        <p class="text-sm font-medium">{{ opt.title }}</p>
                        <p class="text-xs text-muted-foreground">{{ opt.desc }}</p>
                      </div>
                    </label>
                  </div>
                  <label v-if="form.scheduleKind === 'cron'" class="block space-y-1.5">
                    <span class="text-sm font-medium">Cron 表达式</span>
                    <input v-model="form.cronExpr" class="input-field font-mono" />
                  </label>
                  <label v-else-if="form.scheduleKind === 'every' || form.scheduleKind === 'heartbeat'" class="block space-y-1.5">
                    <span class="text-sm font-medium">间隔毫秒</span>
                    <input v-model.number="form.everyMs" type="number" min="1000" class="input-field" />
                  </label>
                </div>

                <p v-if="error" class="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{{ error }}</p>

                <div class="flex items-center justify-between gap-2 border-t border-border pt-4">
                  <button v-if="currentStep > 0" type="button" class="btn-ghost" @click="currentStep--">
                    <ChevronLeft class="h-3.5 w-3.5" />
                    上一步
                  </button>
                  <span v-else />
                  <button class="btn-primary" :disabled="saving || (currentStep === 0 && !form.name.trim())">
                    {{ currentStep === STEPS.length - 1 ? submitLabel : '下一步' }}
                    <ChevronRight v-if="currentStep < STEPS.length - 1" class="h-3.5 w-3.5" />
                  </button>
                </div>
              </form>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
