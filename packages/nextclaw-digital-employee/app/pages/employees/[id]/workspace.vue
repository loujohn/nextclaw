<script setup lang="ts">
import { ChevronDown, ChevronRight, Download, Eye, FileText, FolderOpen, Lock, Pencil, RefreshCw, Save } from "lucide-vue-next";
import type {
  FileContentPayload,
  FileListPayload,
  UploadWorkspaceFileNode,
  UploadWorkspaceTreeNode,
  UploadedWorkspaceFilePayload
} from "~~/shared/api-types";
import { renderMarkdown } from "~/lib/utils";

type WorkspaceSelection =
  | { type: "core"; filename: string }
  | { type: "upload"; path: string };

function findUploadFileNode(nodes: UploadWorkspaceTreeNode[], relativePath: string): UploadWorkspaceFileNode | null {
  for (const node of nodes) {
    if (node.kind === "file" && node.relativePath === relativePath) {
      return node;
    }
    if (node.kind !== "file") {
      const match = findUploadFileNode(node.children, relativePath);
      if (match) {
        return match;
      }
    }
  }
  return null;
}

function createUploadExpandKeys(relativePath: string): string[] {
  const dateLabel = relativePath.split("/")[1] ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateLabel)) {
    return [];
  }
  const [year, month, day] = dateLabel.split("-");
  return [`year:${year}`, `month:${year}-${month}`, `day:${dateLabel}`];
}

function isMarkdownFile(filename: string): boolean {
  return filename.toLowerCase().endsWith(".md");
}

const route = useRoute();
const employeeId = computed(() => String(route.params.id));
const selection = ref<WorkspaceSelection | null>(null);
const mode = ref<"preview" | "edit">("preview");
const editorContent = ref("");
const saving = ref(false);
const saveError = ref<string | null>(null);
const saveSuccess = ref(false);
const sectionOpen = ref({ core: true, uploads: false });
const expandedUploadGroups = ref<Set<string>>(new Set());

const { data: listData, refresh: refreshList, pending: listPending } = useLazyFetch<FileListPayload>(
  () => `/api/employees/${employeeId.value}/workspace`,
  { key: computed(() => `employee-workspace-list:${employeeId.value}`) }
);

const coreFiles = computed(() => listData.value?.data.coreFiles ?? []);
const uploadedFilesTree = computed(() => listData.value?.data.uploadedFilesTree ?? []);
const uploadFileCount = computed(() => {
  const walk = (nodes: UploadWorkspaceTreeNode[]): number => nodes.reduce((count, node) => {
    if (node.kind === "file") {
      return count + 1;
    }
    return count + walk(node.children);
  }, 0);
  return walk(uploadedFilesTree.value);
});

const selectedCoreSelection = computed(() => selection.value?.type === "core" ? selection.value : null);
const selectedUploadSelection = computed(() => selection.value?.type === "upload" ? selection.value : null);

const selectedCoreFile = computed(() => selectedCoreSelection.value
  ? coreFiles.value.find((file) => file.filename === selectedCoreSelection.value?.filename) ?? null
  : null);
const selectedUploadFile = computed(() => selectedUploadSelection.value
  ? findUploadFileNode(uploadedFilesTree.value, selectedUploadSelection.value.path)
  : null);

const coreFileUrl = computed(() => selectedCoreSelection.value
  ? `/api/employees/${employeeId.value}/workspace/${selectedCoreSelection.value.filename}`
  : `/api/employees/${employeeId.value}/workspace/_`);
const uploadFileUrl = computed(() => selectedUploadSelection.value
  ? `/api/employees/${employeeId.value}/workspace/uploaded?path=${encodeURIComponent(selectedUploadSelection.value.path)}`
  : `/api/employees/${employeeId.value}/workspace/uploaded?path=_`);

const { data: coreFileData, refresh: refreshCoreFile, pending: coreFilePending } = useLazyFetch<FileContentPayload>(
  coreFileUrl,
  {
    key: computed(() => `employee-workspace-core:${employeeId.value}:${selectedCoreSelection.value?.filename ?? ""}`),
    watch: false,
    immediate: false
  }
);
const { data: uploadFileData, refresh: refreshUploadFile, pending: uploadFilePending } = useLazyFetch<UploadedWorkspaceFilePayload>(
  uploadFileUrl,
  {
    key: computed(() => `employee-workspace-upload:${employeeId.value}:${selectedUploadSelection.value?.path ?? ""}`),
    watch: false,
    immediate: false
  }
);

const coreFileContent = computed(() => coreFileData.value?.data.content ?? "");
const uploadPayload = computed(() => uploadFileData.value?.data ?? null);
const isEditable = computed(() => selectedCoreFile.value?.writable ?? false);
const isUploadSelection = computed(() => selection.value?.type === "upload");
const activeTitle = computed(() => {
  if (selection.value?.type === "core") {
    return selection.value.filename;
  }
  return uploadPayload.value?.filename ?? selectedUploadFile.value?.originalName ?? "";
});
const activeLoading = computed(() => selection.value?.type === "upload" ? uploadFilePending.value : coreFilePending.value);

watch(coreFileContent, (value) => {
  if (selection.value?.type === "core") {
    editorContent.value = value;
  }
});

watch(selection, (nextSelection) => {
  mode.value = "preview";
  saveError.value = null;
  saveSuccess.value = false;
  if (!nextSelection) {
    return;
  }
  if (nextSelection.type === "core") {
    void refreshCoreFile();
    return;
  }
  void refreshUploadFile();
}, { deep: true });

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function toggleSection(kind: "core" | "uploads") {
  sectionOpen.value = {
    ...sectionOpen.value,
    [kind]: !sectionOpen.value[kind]
  };
}

function isUploadGroupExpanded(key: string): boolean {
  return expandedUploadGroups.value.has(key);
}

function toggleUploadGroup(key: string) {
  const next = new Set(expandedUploadGroups.value);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  expandedUploadGroups.value = next;
}

function expandUploadPath(relativePath: string) {
  const next = new Set(expandedUploadGroups.value);
  createUploadExpandKeys(relativePath).forEach((key) => next.add(key));
  expandedUploadGroups.value = next;
}

function selectCoreFile(filename: string) {
  if (selection.value?.type === "core" && selection.value.filename === filename) {
    return;
  }
  sectionOpen.value.core = true;
  selection.value = { type: "core", filename };
}

function selectUploadFile(relativePath: string) {
  if (selection.value?.type === "upload" && selection.value.path === relativePath) {
    return;
  }
  sectionOpen.value.uploads = true;
  expandUploadPath(relativePath);
  selection.value = { type: "upload", path: relativePath };
}

async function saveFile() {
  if (!selectedCoreSelection.value || !isEditable.value) {
    return;
  }
  saving.value = true;
  saveError.value = null;
  saveSuccess.value = false;
  try {
    await $fetch(`/api/employees/${employeeId.value}/workspace/${selectedCoreSelection.value.filename}` as string, {
      method: "PUT" as any,
      body: { content: editorContent.value }
    });
    saveSuccess.value = true;
    await refreshCoreFile();
    await refreshList();
    setTimeout(() => {
      saveSuccess.value = false;
    }, 2500);
  } catch (error: unknown) {
    saveError.value = error instanceof Error ? error.message : "保存失败";
  } finally {
    saving.value = false;
  }
}

function downloadFile() {
  if (!selection.value) {
    return;
  }
  if (selection.value.type === "upload") {
    const url = uploadPayload.value?.downloadUrl ?? uploadPayload.value?.rawUrl;
    if (!url) {
      return;
    }
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = activeTitle.value;
    anchor.target = "_blank";
    anchor.rel = "noopener";
    anchor.click();
    return;
  }
  const blob = new Blob([mode.value === "edit" ? editorContent.value : coreFileContent.value], {
    type: "text/markdown;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = selection.value.filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function applyDefaultSelection() {
  const queryType = typeof route.query.type === "string" ? route.query.type : "";
  const queryPath = typeof route.query.path === "string" ? route.query.path : "";
  const currentCoreSelection = selectedCoreSelection.value;
  const currentUploadSelection = selectedUploadSelection.value;
  if (queryType === "upload" && queryPath) {
    const matchedUpload = findUploadFileNode(uploadedFilesTree.value, queryPath);
    if (matchedUpload) {
      selectUploadFile(matchedUpload.relativePath);
      return;
    }
  }
  if (currentCoreSelection && coreFiles.value.some((file) => file.filename === currentCoreSelection.filename)) {
    return;
  }
  if (currentUploadSelection && findUploadFileNode(uploadedFilesTree.value, currentUploadSelection.path)) {
    return;
  }
  const firstCoreFile = coreFiles.value.find((file) => file.exists) ?? coreFiles.value[0];
  if (firstCoreFile) {
    selectCoreFile(firstCoreFile.filename);
  }
}

watch([
  coreFiles,
  uploadedFilesTree,
  () => route.query.type,
  () => route.query.path
], () => {
  applyDefaultSelection();
}, { immediate: true, deep: true });

watch(() => employeeId.value, () => {
  selection.value = null;
  expandedUploadGroups.value = new Set();
  sectionOpen.value = { core: true, uploads: false };
});
</script>

<template>
  <div class="flex min-h-[540px] gap-6">
    <aside class="w-80 shrink-0 space-y-3">
      <div class="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div class="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <p class="section-label">工作空间</p>
            <p class="text-xs text-muted-foreground mt-0.5">核心文件与聊天上传文件统一查看。</p>
          </div>
          <button
            class="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            :class="{ 'animate-spin': listPending }"
            title="刷新"
            @click="refreshList()"
          >
            <RefreshCw class="h-3.5 w-3.5" />
          </button>
        </div>

        <div class="border-b border-border">
          <button class="flex w-full items-center gap-2 px-4 py-3 text-left" @click="toggleSection('core')">
            <component :is="sectionOpen.core ? ChevronDown : ChevronRight" class="h-4 w-4 text-muted-foreground" />
            <span class="text-sm font-semibold text-foreground">核心文件</span>
            <span class="ml-auto text-[11px] text-muted-foreground">{{ coreFiles.length }}</span>
          </button>
          <ul v-if="sectionOpen.core" class="divide-y divide-border">
            <li
              v-for="file in coreFiles"
              :key="file.filename"
              class="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors"
              :class="selection?.type === 'core' && selection.filename === file.filename
                ? 'bg-primary/8 border-l-2 border-l-primary'
                : 'hover:bg-secondary/60'"
              @click="selectCoreFile(file.filename)"
            >
              <FileText class="h-4 w-4 shrink-0" :class="selection?.type === 'core' && selection.filename === file.filename ? 'text-primary' : 'text-muted-foreground'" />
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium" :class="selection?.type === 'core' && selection.filename === file.filename ? 'text-primary' : 'text-foreground'">
                  {{ file.filename }}
                </p>
                <p class="text-[11px] text-muted-foreground">{{ file.exists ? formatBytes(file.sizeBytes) : '空文件' }}</p>
              </div>
              <Lock v-if="!file.writable" class="h-3 w-3 shrink-0 text-muted-foreground/50" />
            </li>
          </ul>
        </div>

        <div>
          <button class="flex w-full items-center gap-2 px-4 py-3 text-left" @click="toggleSection('uploads')">
            <component :is="sectionOpen.uploads ? ChevronDown : ChevronRight" class="h-4 w-4 text-muted-foreground" />
            <span class="text-sm font-semibold text-foreground">上传文件</span>
            <span class="ml-auto text-[11px] text-muted-foreground">{{ uploadFileCount }}</span>
          </button>
          <div v-if="sectionOpen.uploads" class="border-t border-border px-3 py-2">
            <div v-if="uploadedFilesTree.length === 0" class="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
              暂无聊天上传文件。
            </div>
            <div v-else class="space-y-2">
              <template v-for="yearNode in uploadedFilesTree" :key="`${yearNode.kind}:${yearNode.label}`">
                <div v-if="yearNode.kind === 'year'" class="rounded-xl border border-border/70 bg-muted/20">
                  <button class="flex w-full items-center gap-2 px-3 py-2 text-left" @click="toggleUploadGroup(`year:${yearNode.label}`)">
                    <component :is="isUploadGroupExpanded(`year:${yearNode.label}`) ? ChevronDown : ChevronRight" class="h-3.5 w-3.5 text-muted-foreground" />
                    <span class="text-sm font-medium text-foreground">{{ yearNode.label }} 年</span>
                  </button>
                  <div v-if="isUploadGroupExpanded(`year:${yearNode.label}`)" class="space-y-2 px-2 pb-2">
                    <template v-for="monthNode in yearNode.children" :key="`${monthNode.kind}:${yearNode.label}-${monthNode.label}`">
                      <div v-if="monthNode.kind === 'month'" class="rounded-lg border border-border/60 bg-card/80">
                        <button class="flex w-full items-center gap-2 px-3 py-2 text-left" @click="toggleUploadGroup(`month:${yearNode.label}-${monthNode.label}`)">
                          <component :is="isUploadGroupExpanded(`month:${yearNode.label}-${monthNode.label}`) ? ChevronDown : ChevronRight" class="h-3.5 w-3.5 text-muted-foreground" />
                          <span class="text-xs font-semibold text-foreground">{{ monthNode.label }} 月</span>
                        </button>
                        <div v-if="isUploadGroupExpanded(`month:${yearNode.label}-${monthNode.label}`)" class="space-y-2 px-2 pb-2">
                          <template v-for="dayNode in monthNode.children" :key="`${dayNode.kind}:${yearNode.label}-${monthNode.label}-${dayNode.label}`">
                            <div v-if="dayNode.kind === 'day'" class="rounded-lg border border-border/60 bg-muted/10">
                              <button class="flex w-full items-center gap-2 px-3 py-2 text-left" @click="toggleUploadGroup(`day:${yearNode.label}-${monthNode.label}-${dayNode.label}`)">
                                <component :is="isUploadGroupExpanded(`day:${yearNode.label}-${monthNode.label}-${dayNode.label}`) ? ChevronDown : ChevronRight" class="h-3.5 w-3.5 text-muted-foreground" />
                                <span class="text-xs font-medium text-foreground">{{ dayNode.label }} 日</span>
                              </button>
                              <div v-if="isUploadGroupExpanded(`day:${yearNode.label}-${monthNode.label}-${dayNode.label}`)" class="space-y-1 px-2 pb-2">
                                <button
                                  v-for="fileNode in dayNode.children"
                                  :key="fileNode.kind === 'file' ? fileNode.relativePath : `${fileNode.kind}:${fileNode.label}`"
                                  class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors"
                                  :class="fileNode.kind === 'file' && selection?.type === 'upload' && selection.path === fileNode.relativePath
                                    ? 'bg-primary/8 text-primary'
                                    : 'hover:bg-secondary/50 text-foreground'"
                                  @click="fileNode.kind === 'file' && selectUploadFile(fileNode.relativePath)"
                                >
                                  <FolderOpen class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                  <div v-if="fileNode.kind === 'file'" class="min-w-0 flex-1">
                                    <p class="truncate text-xs font-medium">{{ fileNode.originalName }}</p>
                                    <p class="text-[10px] text-muted-foreground">{{ formatBytes(fileNode.size) }}</p>
                                  </div>
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

    <div class="min-w-0 flex-1">
      <div v-if="!selection" class="flex h-full items-center justify-center rounded-xl border border-border bg-card shadow-sm">
        <div class="space-y-2 px-6 py-12 text-center">
          <FileText class="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p class="text-sm text-muted-foreground">选择左侧文件以预览或编辑</p>
        </div>
      </div>

      <div v-else class="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div class="flex items-center justify-between gap-3 border-b border-border px-4 py-3 shrink-0">
          <div class="min-w-0 flex items-center gap-2">
            <FileText class="h-4 w-4 shrink-0 text-primary" />
            <span class="truncate text-sm font-semibold">{{ activeTitle }}</span>
            <span v-if="isUploadSelection || !isEditable" class="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">只读</span>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <div class="flex overflow-hidden rounded-lg border border-border text-xs font-medium">
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
                  : isEditable ? 'text-muted-foreground hover:bg-secondary' : 'cursor-not-allowed text-muted-foreground/40'"
                :disabled="!isEditable"
                @click="isEditable && (mode = 'edit')"
              >
                <span class="flex items-center gap-1"><Pencil class="h-3 w-3" />编辑</span>
              </button>
            </div>
            <button
              class="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              title="下载文件"
              @click="downloadFile"
            >
              <Download class="h-3.5 w-3.5" />
              下载
            </button>
            <button
              v-if="selection.type === 'core' && mode === 'edit'"
              class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
              :class="saving
                ? 'cursor-not-allowed bg-primary/60 text-primary-foreground'
                : saveSuccess
                  ? 'bg-primary/80 text-primary-foreground'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'"
              :disabled="saving"
              @click="saveFile"
            >
              <Save class="h-3.5 w-3.5" />
              {{ saving ? '保存中…' : saveSuccess ? '已保存' : '保存' }}
            </button>
          </div>
        </div>

        <div v-if="selection.type === 'upload' && uploadPayload?.source" class="border-b border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground shrink-0">
          <p>来源会话：{{ uploadPayload.source.sessionKey || '未记录' }}</p>
          <p>来源消息：{{ uploadPayload.source.messageId || '未记录' }}</p>
          <p v-if="uploadPayload.source.text" class="mt-1 leading-relaxed text-foreground/80">发送文本：{{ uploadPayload.source.text }}</p>
        </div>

        <div v-if="saveError" class="mx-4 mt-3 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive shrink-0">
          {{ saveError }}
        </div>

        <div v-if="activeLoading" class="flex flex-1 items-center justify-center">
          <p class="animate-pulse text-sm text-muted-foreground">加载中…</p>
        </div>

        <div v-else-if="selection.type === 'core' && mode === 'preview'" class="prose prose-sm max-w-none flex-1 overflow-auto px-6 py-5">
          <div
            v-if="coreFileContent"
            class="markdown-body text-sm leading-relaxed text-foreground"
            v-html="renderMarkdown(coreFileContent)"
          />
          <p v-else class="text-sm italic text-muted-foreground">该文件为空。</p>
        </div>

        <div v-else-if="selection.type === 'core' && mode === 'edit'" class="flex min-h-0 flex-1 flex-col p-4">
          <textarea
            v-model="editorContent"
            class="min-h-[420px] flex-1 resize-none rounded-lg border border-input bg-background px-3 py-3 font-mono text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="文件内容为空，在此处输入内容后保存…"
            spellcheck="false"
          />
        </div>

        <div v-else-if="selection.type === 'upload' && uploadPayload" class="flex-1 overflow-auto px-6 py-5">
          <div v-if="uploadPayload.previewType === 'text'" class="prose prose-sm max-w-none">
            <div
              v-if="uploadPayload.content && isMarkdownFile(uploadPayload.filename)"
              class="markdown-body text-sm leading-relaxed text-foreground"
              v-html="renderMarkdown(uploadPayload.content)"
            />
            <pre v-else-if="uploadPayload.content" class="whitespace-pre-wrap break-words rounded-2xl border border-border bg-muted/20 p-4 text-sm leading-relaxed text-foreground">{{ uploadPayload.content }}</pre>
            <p v-else class="text-sm italic text-muted-foreground">该文件为空。</p>
          </div>
          <div v-else-if="uploadPayload.previewType === 'image'" class="flex h-full items-center justify-center">
            <img :src="uploadPayload.rawUrl" :alt="uploadPayload.filename" class="max-h-[70vh] w-auto rounded-2xl border border-border object-contain shadow-sm" />
          </div>
          <div v-else-if="uploadPayload.previewType === 'pdf'" class="h-full min-h-[640px] overflow-hidden rounded-2xl border border-border">
            <iframe :src="uploadPayload.rawUrl" class="h-[70vh] w-full bg-white" title="PDF 预览" />
          </div>
          <div v-else class="flex h-full items-center justify-center">
            <div class="max-w-md rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-8 text-center">
              <p class="text-sm font-medium text-foreground">该文件类型暂不支持在线预览</p>
              <p class="mt-2 text-xs leading-relaxed text-muted-foreground">首期对 Office / 二进制文件提供来源信息和下载查看，后续可继续增强在线预览能力。</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
