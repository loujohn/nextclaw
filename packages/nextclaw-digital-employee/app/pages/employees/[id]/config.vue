<script setup lang="ts">
import { FileText, Download, Eye, Pencil, Save, RefreshCw, Lock, Bot, ChevronDown, ChevronRight, FolderOpen } from "lucide-vue-next";
import { renderMarkdown } from "~/lib/utils";

const route = useRoute();
const employeeId = computed(() => String(route.params.id));

// ── DingTalk Config ───────────────────────────────────────────────────────────
const { data: dingtalkConfig, refresh: refreshDingTalkConfig } = useLazyFetch<{
  ok: boolean;
  data: {
    channel: {
      enabled: boolean;
      defaultAccountId: string;
      accounts: Array<{ accountId: string }>;
    };
  };
}>("/api/integrations/dingtalk");

const { data: dingtalkBinding, refresh: refreshDingTalkBinding } = useLazyFetch<{
  ok: boolean;
  data: {
    employeeCode: string;
    directAccountIds: string[];
    groupBindings: Array<{
      groupId: string;
      accountId: string;
      allowCollaboration: boolean;
      allowedEmployeeCodes: string[];
    }>;
  };
}>(() => `/api/employees/${employeeId.value}/dingtalk-binding`);

const dingtalkForm = reactive({
  directAccountIds: [] as string[]
});

watchEffect(() => {
  dingtalkForm.directAccountIds = [...(dingtalkBinding.value?.data.directAccountIds ?? [])];
});

async function saveDingTalkBinding() {
  await $fetch(`/api/employees/${employeeId.value}/dingtalk-binding`, {
    method: "PUT",
    body: {
      directAccountIds: dingtalkForm.directAccountIds,
      groupBindings: dingtalkBinding.value?.data.groupBindings ?? []
    }
  });
  await Promise.all([refreshDingTalkBinding(), refreshDingTalkConfig()]);
}

// ── Workspace ─────────────────────────────────────────────────────────────────
import type {
  FileListPayload,
  FileContentPayload,
  UploadedWorkspaceFilePayload,
  UploadWorkspaceFileNode,
  UploadWorkspaceTreeNode
} from "~~/shared/api-types";

const { data: listData, refresh: refreshList, pending: listPending } = useLazyFetch<FileListPayload>(
  () => `/api/employees/${employeeId.value}/workspace`,
  { key: computed(() => `employee-workspace-list:${employeeId.value}`) }
);

type ConfigWorkspaceSelection =
  | { type: "core"; filename: string }
  | { type: "upload"; relativePath: string };

const files = computed(() => listData.value?.data.coreFiles ?? []);
const uploadedFilesTree = computed(() => listData.value?.data.uploadedFilesTree ?? []);
const workspaceSections = ref({ core: true, uploads: true });
const expandedUploadTreeKeys = ref<Set<string>>(new Set());

function findUploadedFileNode(nodes: UploadWorkspaceTreeNode[], relativePath: string): UploadWorkspaceFileNode | null {
  for (const node of nodes) {
    if (node.kind === "file" && node.relativePath === relativePath) {
      return node;
    }
    if (node.kind !== "file") {
      const match = findUploadedFileNode(node.children, relativePath);
      if (match) {
        return match;
      }
    }
  }
  return null;
}

function collectUploadTreeKeys(nodes: UploadWorkspaceTreeNode[], parentKey = ""): string[] {
  const keys: string[] = [];
  for (const node of nodes) {
    if (node.kind === "file") {
      continue;
    }
    const nodeKey = parentKey ? `${parentKey}/${node.label}` : `${node.kind}:${node.label}`;
    keys.push(nodeKey, ...collectUploadTreeKeys(node.children, nodeKey));
  }
  return keys;
}

const selectedEntry = ref<ConfigWorkspaceSelection | null>(null);
const mode = ref<"preview" | "edit">("preview");
const editorContent = ref("");
const saving = ref(false);
const saveError = ref<string | null>(null);
const saveSuccess = ref(false);

const selectedCoreEntry = computed(() => selectedEntry.value?.type === "core" ? selectedEntry.value : null);
const selectedUploadEntry = computed(() => selectedEntry.value?.type === "upload" ? selectedEntry.value : null);

const fileUrl = computed(() =>
  selectedCoreEntry.value
    ? `/api/employees/${employeeId.value}/workspace/${selectedCoreEntry.value.filename}`
    : `/api/employees/${employeeId.value}/workspace/_`
);
const { data: fileData, refresh: refreshFile, pending: filePending } = useLazyFetch<FileContentPayload>(
  fileUrl,
  {
    key: computed(() => `employee-workspace-file:${employeeId.value}:${selectedCoreEntry.value?.filename ?? ""}`),
    watch: false,
    immediate: false,
  }
);

const uploadedFileUrl = computed(() =>
  selectedUploadEntry.value
    ? `/api/employees/${employeeId.value}/workspace/uploaded?path=${encodeURIComponent(selectedUploadEntry.value.relativePath)}`
    : `/api/employees/${employeeId.value}/workspace/uploaded?path=_`
);
const { data: uploadedFileData, refresh: refreshUploadedFile, pending: uploadedFilePending } = useLazyFetch<UploadedWorkspaceFilePayload>(
  uploadedFileUrl,
  {
    key: computed(() => `employee-workspace-uploaded:${employeeId.value}:${selectedUploadEntry.value?.relativePath ?? ""}`),
    watch: false,
    immediate: false,
  }
);

const fileContent = computed(() => fileData.value?.data.content ?? "");
const uploadedFileContent = computed(() => uploadedFileData.value?.data ?? null);
const selectedFile = computed(() => selectedCoreEntry.value
  ? files.value.find((file) => file.filename === selectedCoreEntry.value?.filename) ?? null
  : null);
const selectedUploadedFile = computed(() => selectedUploadEntry.value
  ? findUploadedFileNode(uploadedFilesTree.value, selectedUploadEntry.value.relativePath)
  : null);
const isEditable = computed(() => selectedFile.value?.writable ?? false);
const isUploadSelection = computed(() => selectedEntry.value?.type === "upload");
const activeLoading = computed(() => isUploadSelection.value ? uploadedFilePending.value : filePending.value);
const activeTitle = computed(() => {
  if (selectedCoreEntry.value) {
    return selectedCoreEntry.value.filename;
  }
  return uploadedFileContent.value?.filename ?? selectedUploadedFile.value?.originalName ?? "";
});

watch(fileContent, (val) => { editorContent.value = val; });
watch(selectedEntry, (value) => {
  mode.value = "preview";
  saveError.value = null;
  saveSuccess.value = false;
  if (!value) {
    return;
  }
  if (value.type === "core") {
    void refreshFile();
    return;
  }
  void refreshUploadedFile();
}, { deep: true });

function selectFile(filename: string) {
  if (selectedCoreEntry.value?.filename === filename) return;
  selectedEntry.value = { type: "core", filename };
}

function toggleWorkspaceSection(kind: "core" | "uploads") {
  workspaceSections.value = {
    ...workspaceSections.value,
    [kind]: !workspaceSections.value[kind]
  };
}

function isTreeExpanded(key: string): boolean {
  return expandedUploadTreeKeys.value.has(key);
}

function toggleTreeKey(key: string) {
  const next = new Set(expandedUploadTreeKeys.value);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  expandedUploadTreeKeys.value = next;
}

function selectUploadedFile(relativePath: string) {
  if (selectedUploadEntry.value?.relativePath === relativePath) {
    return;
  }
  selectedEntry.value = { type: "upload", relativePath };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function saveFile() {
  if (!selectedCoreEntry.value || !isEditable.value) return;
  saving.value = true;
  saveError.value = null;
  saveSuccess.value = false;
  try {
    await $fetch(`/api/employees/${employeeId.value}/workspace/${selectedCoreEntry.value.filename}` as string, {
      method: "PUT" as any,
      body: { content: editorContent.value }
    });
    saveSuccess.value = true;
    await refreshFile();
    await refreshList();
    setTimeout(() => { saveSuccess.value = false; }, 2500);
  } catch (e: unknown) {
    saveError.value = e instanceof Error ? e.message : "保存失败";
  } finally {
    saving.value = false;
  }
}

function downloadFile() {
  if (selectedUploadEntry.value) {
    const downloadUrl = uploadedFileContent.value?.downloadUrl ?? uploadedFileContent.value?.rawUrl;
    if (!downloadUrl) {
      return;
    }
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = uploadedFileContent.value?.filename ?? selectedUploadedFile.value?.originalName ?? "file";
    anchor.target = "_blank";
    anchor.rel = "noopener";
    anchor.click();
    return;
  }
  if (!selectedCoreEntry.value) return;
  const content = mode.value === "edit" ? editorContent.value : fileContent.value;
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = selectedCoreEntry.value.filename;
  a.click();
  URL.revokeObjectURL(url);
}

watchEffect(() => {
  if (expandedUploadTreeKeys.value.size === 0 && uploadedFilesTree.value.length > 0) {
    expandedUploadTreeKeys.value = new Set(collectUploadTreeKeys(uploadedFilesTree.value));
  }
  if (!selectedEntry.value && files.value.length > 0) {
    const first = files.value.find((f) => f.exists);
    if (first) selectedEntry.value = { type: "core", filename: first.filename };
  }
});

const configTab = ref<'dingtalk' | 'workspace'>('dingtalk');
</script>

<template>
  <div class="space-y-4">
    <!-- ── Tab 导航 ──────────────────────────────────────────────────── -->
    <nav class="flex gap-2">
      <button
        class="rounded-full px-4 py-2 text-sm font-medium transition-colors"
        :class="configTab === 'dingtalk' ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-muted-foreground hover:text-foreground'"
        @click="configTab = 'dingtalk'"
      >钉钉入口</button>
      <button
        class="rounded-full px-4 py-2 text-sm font-medium transition-colors"
        :class="configTab === 'workspace' ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-muted-foreground hover:text-foreground'"
        @click="configTab = 'workspace'"
      >工作空间</button>
    </nav>

    <!-- ── 钉钉配置 ──────────────────────────────────────────────────── -->
    <template v-if="configTab === 'dingtalk'">
    <section v-if="dingtalkConfig?.data && dingtalkBinding?.data" class="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div class="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <span class="section-label">钉钉入口</span>
          <h2 class="mt-0.5 text-base font-semibold">私聊绑定与群入口</h2>
        </div>
        <span
          class="rounded-full px-3 py-1 text-xs font-semibold"
          :class="dingtalkConfig.data.channel.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'"
        >
          {{ dingtalkConfig.data.channel.enabled ? "已启用" : "未启用" }}
        </span>
      </div>
      <div class="grid gap-5 p-5 lg:grid-cols-[320px_1fr]">
        <!-- 私聊绑定 -->
        <form class="space-y-3 rounded-xl border border-border bg-muted/30 p-4" @submit.prevent="saveDingTalkBinding">
          <div class="flex items-center gap-2 text-sm font-medium">
            <Bot class="h-4 w-4" :stroke-width="1.8" />
            默认私聊入口
          </div>
          <p class="text-xs text-muted-foreground">可同时勾选多个账号；这些机器人私聊都会默认交给该员工。</p>
          <div class="space-y-2 rounded-lg border border-border bg-background/80 p-3">
            <label v-for="account in dingtalkConfig.data.channel.accounts" :key="account.accountId" class="flex items-center gap-2 text-sm cursor-pointer">
              <input v-model="dingtalkForm.directAccountIds" type="checkbox" :value="account.accountId" class="h-4 w-4 rounded accent-primary" />
              <span>{{ account.accountId }}</span>
            </label>
            <p v-if="dingtalkConfig.data.channel.accounts.length === 0" class="text-xs text-muted-foreground">
              还没有可用账号，请先在集成中心配置钉钉机器人。
            </p>
          </div>
          <button class="btn-primary" type="submit">保存钉钉绑定</button>
        </form>

        <!-- 已接管群 -->
        <div class="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
          <div>
            <span class="section-label">已接管群</span>
            <h3 class="mt-0.5 text-sm font-semibold">当前群入口状态</h3>
          </div>
          <div v-if="dingtalkBinding.data.groupBindings.length === 0" class="rounded-lg bg-background/80 px-4 py-3 text-sm text-muted-foreground">
            当前还没有群绑定到这个员工。可在集成中心的"群路由"里指定。
          </div>
          <div v-for="group in dingtalkBinding.data.groupBindings" :key="group.groupId" class="rounded-lg border border-border bg-background/80 p-3">
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="text-sm font-semibold">{{ group.groupId }}</p>
                <p class="text-xs text-muted-foreground">入口账号：{{ group.accountId }}</p>
              </div>
              <span
                class="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                :class="group.allowCollaboration ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'"
              >
                {{ group.allowCollaboration ? "允许后台协作" : "单员工直出" }}
              </span>
            </div>
            <p class="mt-1.5 text-xs text-muted-foreground">
              协作者：{{ group.allowedEmployeeCodes.length > 0 ? group.allowedEmployeeCodes.join("、") : "未配置" }}
            </p>
          </div>
        </div>
      </div>
    </section>
    <div v-else class="rounded-xl border border-border bg-card shadow-sm px-6 py-10 text-center text-sm text-muted-foreground">
      钉钉渠道未配置，请先在集成中心启用钉钉机器人。
    </div>
    </template>

    <!-- ── 工作空间文件 ──────────────────────────────────────────────── -->
    <section v-if="configTab === 'workspace'" class="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div class="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <span class="section-label">工作空间</span>
          <h2 class="mt-0.5 text-base font-semibold">核心配置文件与上传文件</h2>
        </div>
        <button
          class="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          :class="{ 'animate-spin': listPending }"
          title="刷新"
          @click="refreshList()"
        >
          <RefreshCw class="h-4 w-4" />
        </button>
      </div>

      <div class="flex gap-0 min-h-[480px]">
        <!-- Left: file list -->
        <aside class="w-72 shrink-0 border-r border-border">
          <div class="divide-y divide-border">
            <div>
              <button class="flex w-full items-center gap-2 px-4 py-3 text-left" @click="toggleWorkspaceSection('core')">
                <component :is="workspaceSections.core ? ChevronDown : ChevronRight" class="h-4 w-4 text-muted-foreground" />
                <span class="text-sm font-semibold text-foreground">核心配置文件</span>
                <span class="ml-auto text-[11px] text-muted-foreground">{{ files.length }}</span>
              </button>
              <ul v-if="workspaceSections.core" class="divide-y divide-border">
                <li
                  v-for="file in files"
                  :key="file.filename"
                  class="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors"
                  :class="selectedCoreEntry?.filename === file.filename
                    ? 'bg-primary/8 border-l-2 border-l-primary'
                    : 'hover:bg-secondary/60'"
                  @click="selectFile(file.filename)"
                >
                  <FileText
                    class="h-4 w-4 shrink-0"
                    :class="selectedCoreEntry?.filename === file.filename ? 'text-primary' : 'text-muted-foreground'"
                  />
                  <div class="min-w-0 flex-1">
                    <p
                      class="text-sm font-medium truncate"
                      :class="selectedCoreEntry?.filename === file.filename ? 'text-primary' : 'text-foreground'"
                    >
                      {{ file.filename }}
                    </p>
                    <p class="text-[11px] text-muted-foreground">
                      {{ file.exists ? formatBytes(file.sizeBytes) : "空文件" }}
                    </p>
                  </div>
                  <Lock v-if="!file.writable" class="h-3 w-3 shrink-0 text-muted-foreground/50" title="只读" />
                </li>
              </ul>
            </div>

            <div>
              <button class="flex w-full items-center gap-2 px-4 py-3 text-left" @click="toggleWorkspaceSection('uploads')">
                <component :is="workspaceSections.uploads ? ChevronDown : ChevronRight" class="h-4 w-4 text-muted-foreground" />
                <span class="text-sm font-semibold text-foreground">上传文件</span>
                <span class="ml-auto text-[11px] text-muted-foreground">{{ uploadedFilesTree.length }}</span>
              </button>
              <div v-if="workspaceSections.uploads" class="border-t border-border/60 px-4 py-3">
                <div v-if="uploadedFilesTree.length === 0" class="py-4 text-xs text-muted-foreground">
                  暂无上传文件
                </div>
                <div v-else class="space-y-1 text-xs">
                  <template v-for="yearNode in uploadedFilesTree" :key="`${yearNode.kind}:${yearNode.label}`">
                    <div v-if="yearNode.kind === 'year'">
                      <button class="flex w-full items-center gap-2 py-1.5 text-left text-sm text-foreground" @click="toggleTreeKey(`year:${yearNode.label}`)">
                        <component :is="isTreeExpanded(`year:${yearNode.label}`) ? ChevronDown : ChevronRight" class="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{{ yearNode.label }} 年</span>
                      </button>
                      <div v-if="isTreeExpanded(`year:${yearNode.label}`)" class="ml-3 border-l border-border pl-3">
                        <template v-for="monthNode in yearNode.children" :key="`${yearNode.label}-${monthNode.label}`">
                          <div v-if="monthNode.kind === 'month'">
                            <button class="flex w-full items-center gap-2 py-1.5 text-left text-foreground/90" @click="toggleTreeKey(`year:${yearNode.label}/month:${monthNode.label}`)">
                              <component :is="isTreeExpanded(`year:${yearNode.label}/month:${monthNode.label}`) ? ChevronDown : ChevronRight" class="h-3.5 w-3.5 text-muted-foreground" />
                              <span>{{ monthNode.label }} 月</span>
                            </button>
                            <div v-if="isTreeExpanded(`year:${yearNode.label}/month:${monthNode.label}`)" class="ml-3 border-l border-border pl-3">
                              <template v-for="dayNode in monthNode.children" :key="`${yearNode.label}-${monthNode.label}-${dayNode.label}`">
                                <div v-if="dayNode.kind === 'day'">
                                  <button class="flex w-full items-center gap-2 py-1.5 text-left text-foreground/80" @click="toggleTreeKey(`year:${yearNode.label}/month:${monthNode.label}/day:${dayNode.label}`)">
                                    <component :is="isTreeExpanded(`year:${yearNode.label}/month:${monthNode.label}/day:${dayNode.label}`) ? ChevronDown : ChevronRight" class="h-3.5 w-3.5 text-muted-foreground" />
                                    <span>{{ dayNode.label }} 日</span>
                                  </button>
                                  <div v-if="isTreeExpanded(`year:${yearNode.label}/month:${monthNode.label}/day:${dayNode.label}`)" class="ml-3 border-l border-border pl-3">
                                    <button
                                      v-for="fileNode in dayNode.children"
                                      :key="fileNode.kind === 'file' ? fileNode.relativePath : `${fileNode.kind}:${fileNode.label}`"
                                      class="flex w-full items-center gap-2 py-1.5 text-left transition-colors"
                                      :class="fileNode.kind === 'file' && selectedUploadEntry?.relativePath === fileNode.relativePath ? 'text-primary' : 'text-foreground hover:text-primary'"
                                      @click="fileNode.kind === 'file' && selectUploadedFile(fileNode.relativePath)"
                                    >
                                      <FolderOpen class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                      <span v-if="fileNode.kind === 'file'" class="truncate">{{ fileNode.originalName }}</span>
                                    </button>
                                  </div>
                                </div>
                              </template>
                            </div>
                          </div>
                        </template>
                      </div>
                    </div>
                  </template>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <!-- Right: content panel -->
        <div class="flex-1 min-w-0 flex flex-col">
          <!-- Empty state -->
          <div
            v-if="!selectedEntry"
            class="flex flex-1 items-center justify-center"
          >
            <div class="text-center space-y-2 py-12 px-6">
              <FileText class="h-9 w-9 mx-auto text-muted-foreground/40" />
              <p class="text-sm text-muted-foreground">选择左侧文件以预览或编辑</p>
            </div>
          </div>

          <!-- File panel -->
          <div v-else class="flex flex-col flex-1 min-w-0">
            <!-- Toolbar -->
            <div class="flex items-center justify-between gap-3 px-4 py-3 border-b border-border shrink-0 bg-muted/20">
              <div class="flex items-center gap-2 min-w-0">
                <FileText class="h-4 w-4 text-primary shrink-0" />
                <span class="font-mono text-sm font-semibold truncate">{{ activeTitle }}</span>
                <span
                  v-if="isUploadSelection || !isEditable"
                  class="text-[10px] font-medium rounded-full bg-muted px-2 py-0.5 text-muted-foreground shrink-0"
                >只读</span>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <div class="flex rounded-lg border border-border overflow-hidden text-xs font-medium">
                  <button
                    class="px-3 py-1.5 transition-colors"
                    :class="mode === 'preview' || isUploadSelection ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'"
                    @click="mode = 'preview'"
                  >
                    <span class="flex items-center gap-1"><Eye class="h-3 w-3" />预览</span>
                  </button>
                  <button
                    class="px-3 py-1.5 transition-colors"
                    :class="mode === 'edit'
                      ? 'bg-primary text-primary-foreground'
                      : isEditable ? 'text-muted-foreground hover:bg-secondary' : 'text-muted-foreground/40 cursor-not-allowed'"
                    :disabled="!isEditable || isUploadSelection"
                    @click="isEditable && (mode = 'edit')"
                  >
                    <span class="flex items-center gap-1"><Pencil class="h-3 w-3" />编辑</span>
                  </button>
                </div>
                <button
                  class="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  title="下载文件"
                  @click="downloadFile"
                >
                  <Download class="h-3.5 w-3.5" />
                  下载
                </button>
                <button
                  v-if="mode === 'edit' && !isUploadSelection"
                  class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                  :class="saving
                    ? 'bg-primary/60 text-primary-foreground cursor-not-allowed'
                    : saveSuccess
                      ? 'bg-primary/80 text-primary-foreground'
                      : 'bg-primary text-primary-foreground hover:bg-primary/90'"
                  :disabled="saving"
                  @click="saveFile"
                >
                  <Save class="h-3.5 w-3.5" />
                  {{ saving ? "保存中…" : saveSuccess ? "已保存" : "保存" }}
                </button>
              </div>
            </div>

            <div v-if="saveError" class="mx-4 mt-3 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive shrink-0">
              {{ saveError }}
            </div>

            <div v-if="activeLoading" class="flex-1 flex items-center justify-center p-8">
              <p class="text-sm text-muted-foreground animate-pulse">加载中…</p>
            </div>

            <div
              v-else-if="!isUploadSelection && mode === 'preview'"
              class="flex-1 overflow-auto px-6 py-5 prose prose-sm max-w-none"
            >
              <div
                v-if="fileContent"
                class="markdown-body text-sm leading-relaxed text-foreground"
                v-html="renderMarkdown(fileContent)"
              />
              <p v-else class="text-sm text-muted-foreground italic">该文件为空。</p>
            </div>

            <div v-else-if="!isUploadSelection && mode === 'edit'" class="flex-1 flex flex-col min-h-0 p-4">
              <textarea
                v-model="editorContent"
                class="flex-1 w-full resize-none rounded-lg border border-input bg-background px-3 py-3 font-mono text-sm leading-relaxed text-foreground focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground min-h-[360px]"
                placeholder="文件内容为空，在此处输入内容后保存…"
                spellcheck="false"
              />
            </div>

            <div v-else-if="uploadedFileContent" class="flex-1 min-h-0 overflow-auto px-6 py-5">
              <div v-if="uploadedFileContent.source" class="mb-4 rounded-lg border border-border bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
                <p>来源会话：{{ uploadedFileContent.source.sessionKey || '未记录' }}</p>
                <p>来源消息：{{ uploadedFileContent.source.messageId || '未记录' }}</p>
                <p v-if="uploadedFileContent.source.text" class="mt-1 leading-relaxed text-foreground/80">发送文本：{{ uploadedFileContent.source.text }}</p>
              </div>

              <div v-if="uploadedFileContent.previewType === 'text'" class="prose prose-sm max-w-none">
                <div
                  v-if="uploadedFileContent.content && uploadedFileContent.filename.toLowerCase().endsWith('.md')"
                  class="markdown-body text-sm leading-relaxed text-foreground"
                  v-html="renderMarkdown(uploadedFileContent.content)"
                />
                <pre v-else-if="uploadedFileContent.content" class="whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/10 p-4 text-sm leading-relaxed text-foreground">{{ uploadedFileContent.content }}</pre>
                <p v-else class="text-sm italic text-muted-foreground">该文件为空。</p>
              </div>

              <div v-else-if="uploadedFileContent.previewType === 'image'" class="flex h-full items-center justify-center overflow-auto">
                <img :src="uploadedFileContent.rawUrl" :alt="uploadedFileContent.filename" class="max-h-[60vh] w-auto rounded-lg border border-border object-contain" />
              </div>

              <div v-else-if="uploadedFileContent.previewType === 'pdf'" class="h-[60vh] overflow-hidden rounded-lg border border-border bg-white">
                <iframe :src="uploadedFileContent.rawUrl" class="h-full w-full" title="上传文件 PDF 预览" />
              </div>

              <div v-else class="flex h-full min-h-[18rem] items-center justify-center">
                <div class="max-w-sm text-center">
                  <p class="text-sm font-medium text-foreground">当前项目暂不支持预览该文件类型</p>
                  <p class="mt-2 text-xs leading-relaxed text-muted-foreground">你仍然可以使用上方“下载”按钮查看原文件。首期对 Office / 二进制文件只提供只读下载能力。</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
