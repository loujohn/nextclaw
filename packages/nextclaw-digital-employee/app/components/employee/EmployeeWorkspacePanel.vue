<script setup lang="ts">
import { ChevronDown, ChevronRight, Download, Eye, FileImage, FileText, FolderOpen, Lock, Pencil, RefreshCw, Save } from "lucide-vue-next";
import type { WorkspaceFileNode, WorkspaceFilePayload, WorkspaceTreeNode, WorkspaceTreePayload } from "~~/shared/api-types";
import { formatDateTime } from "~~/shared/ui-models";
import { renderMarkdown } from "~/lib/utils";

type FlatTreeItem = {
  node: WorkspaceTreeNode;
  depth: number;
};

const props = withDefaults(defineProps<{
  employeeId: string;
  initialRelativePath?: string | null;
}>(), {
  initialRelativePath: null
});

const selectedPath = ref<string | null>(null);
const mode = ref<"preview" | "edit">("preview");
const editorContent = ref("");
const saveError = ref<string | null>(null);
const savingText = ref(false);
const textSaveSuccess = ref(false);
const expandedDirectories = ref<Set<string>>(new Set());

const { data: listData, refresh: refreshList, pending: listPending } = useLazyFetch<WorkspaceTreePayload>(
  () => `/api/employees/${props.employeeId}/workspace`,
  { key: computed(() => `employee-workspace-tree:${props.employeeId}`) }
);

const tree = computed(() => listData.value?.data.tree ?? []);

function findFileNode(nodes: WorkspaceTreeNode[], relativePath: string): WorkspaceFileNode | null {
  for (const node of nodes) {
    if (node.kind === "file" && node.relativePath === relativePath) {
      return node;
    }
    if (node.kind === "directory") {
      const match = findFileNode(node.children, relativePath);
      if (match) {
        return match;
      }
    }
  }
  return null;
}

function findFirstFile(nodes: WorkspaceTreeNode[]): WorkspaceFileNode | null {
  for (const node of nodes) {
    if (node.kind === "file") {
      return node;
    }
    const match = findFirstFile(node.children);
    if (match) {
      return match;
    }
  }
  return null;
}

function collectAncestorDirectories(
  nodes: WorkspaceTreeNode[],
  targetPath: string,
  ancestors: string[] = []
): string[] | null {
  for (const node of nodes) {
    if (node.kind === "file") {
      if (node.relativePath === targetPath) {
        return ancestors;
      }
      continue;
    }
    const match = collectAncestorDirectories(node.children, targetPath, [...ancestors, node.relativePath]);
    if (match) {
      return match;
    }
  }
  return null;
}

function flattenTree(nodes: WorkspaceTreeNode[], depth = 0): FlatTreeItem[] {
  return nodes.flatMap((node) => {
    if (node.kind === "file") {
      return [{ node, depth }];
    }
    const items: FlatTreeItem[] = [{ node, depth }];
    if (expandedDirectories.value.has(node.relativePath)) {
      items.push(...flattenTree(node.children, depth + 1));
    }
    return items;
  });
}

function countFiles(nodes: WorkspaceTreeNode[]): number {
  return nodes.reduce((count, node) => {
    if (node.kind === "file") {
      return count + 1;
    }
    return count + countFiles(node.children);
  }, 0);
}

function expandPath(relativePath: string) {
  const ancestors = collectAncestorDirectories(tree.value, relativePath);
  if (!ancestors) {
    return;
  }
  const next = new Set(expandedDirectories.value);
  ancestors.forEach((item) => next.add(item));
  expandedDirectories.value = next;
}

function applyDefaultSelection() {
  if (tree.value.length > 0 && expandedDirectories.value.size === 0) {
    expandedDirectories.value = new Set(
      tree.value.filter((node) => node.kind === "directory").map((node) => node.relativePath)
    );
  }

  const preferredPath = props.initialRelativePath?.trim() ?? "";
  if (preferredPath) {
    const matched = findFileNode(tree.value, preferredPath);
    if (matched) {
      expandPath(matched.relativePath);
      if (selectedPath.value !== matched.relativePath) {
        selectedPath.value = matched.relativePath;
      }
      return;
    }
  }

  if (selectedPath.value && findFileNode(tree.value, selectedPath.value)) {
    return;
  }

  const firstFile = findFirstFile(tree.value);
  if (firstFile) {
    expandPath(firstFile.relativePath);
    selectedPath.value = firstFile.relativePath;
  }
}

const flatTreeItems = computed(() => flattenTree(tree.value));
const totalFileCount = computed(() => countFiles(tree.value));
const selectedTreeNode = computed(() => selectedPath.value ? findFileNode(tree.value, selectedPath.value) : null);

const fileDetailUrl = computed(() => selectedPath.value
  ? `/api/employees/${props.employeeId}/workspace/file?path=${encodeURIComponent(selectedPath.value)}`
  : `/api/employees/${props.employeeId}/workspace/file?path=_`
);

const { data: fileData, refresh: refreshFile, pending: filePending } = useLazyFetch<WorkspaceFilePayload>(
  fileDetailUrl,
  {
    key: computed(() => `employee-workspace-file:${props.employeeId}:${selectedPath.value ?? ""}`),
    watch: false,
    immediate: false
  }
);

const detail = computed(() => fileData.value?.data ?? null);
const entry = computed(() => detail.value?.entry ?? selectedTreeNode.value ?? null);
const isMarkdownFile = computed(() => (entry.value?.name ?? "").toLowerCase().endsWith(".md"));
const canEditText = computed(() => detail.value?.entry.editableMode === "text");
const renderedMarkdown = computed(() => detail.value?.content ? renderMarkdown(detail.value.content) : "");
const currentImagePreviewUrl = computed(() => detail.value?.rawUrl ?? "");

watch(() => detail.value?.content, (value) => {
  if (typeof value === "string") {
    editorContent.value = value;
  }
});

watch(selectedPath, (nextPath) => {
  mode.value = "preview";
  saveError.value = null;
  textSaveSuccess.value = false;
  if (nextPath) {
    expandPath(nextPath);
    void refreshFile();
  }
});

watch([tree, () => props.initialRelativePath], () => {
  applyDefaultSelection();
}, { immediate: true, deep: true });

watch(() => props.employeeId, () => {
  selectedPath.value = null;
  expandedDirectories.value = new Set();
});

function toggleDirectory(relativePath: string) {
  const next = new Set(expandedDirectories.value);
  if (next.has(relativePath)) {
    next.delete(relativePath);
  } else {
    next.add(relativePath);
  }
  expandedDirectories.value = next;
}

function selectFile(relativePath: string) {
  if (selectedPath.value === relativePath) {
    return;
  }
  selectedPath.value = relativePath;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function refreshWorkspace() {
  await refreshList();
  if (selectedPath.value) {
    await refreshFile();
  }
}

async function saveTextFile() {
  if (!selectedPath.value || !canEditText.value) {
    return;
  }
  savingText.value = true;
  saveError.value = null;
  textSaveSuccess.value = false;
  try {
    await $fetch(`/api/employees/${props.employeeId}/workspace/file`, {
      method: "PUT",
      body: {
        path: selectedPath.value,
        content: editorContent.value
      }
    });
    textSaveSuccess.value = true;
    await refreshWorkspace();
    setTimeout(() => {
      textSaveSuccess.value = false;
    }, 2500);
  } catch (error: unknown) {
    saveError.value = error instanceof Error ? error.message : "保存失败";
  } finally {
    savingText.value = false;
  }
}

function downloadFile() {
  if (!detail.value || !entry.value) {
    return;
  }
  if (mode.value === "edit" && canEditText.value) {
    const blob = new Blob([editorContent.value], { type: "text/plain;charset=utf-8" });
    const blobUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = entry.value.name;
    anchor.click();
    URL.revokeObjectURL(blobUrl);
    return;
  }
  const anchor = document.createElement("a");
  anchor.href = detail.value.downloadUrl;
  anchor.download = entry.value.name;
  anchor.target = "_blank";
  anchor.rel = "noopener";
  anchor.click();
}

function fileSecondaryText(node: WorkspaceFileNode): string {
  if (node.origin === "upload") {
    return node.sourceLabel ?? "来源：聊天上传";
  }
  return node.relativePath;
}
</script>

<template>
  <section class="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
    <div class="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
      <div>
        <span class="section-label">工作空间</span>
        <h2 class="mt-0.5 text-base font-semibold">数字员工相关文件管理</h2>
        <p class="mt-1 text-xs text-muted-foreground">
          目录结构与数字员工目录保持一致，支持编辑保存下载。
        </p>
      </div>
      <button
        class="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        :class="{ 'animate-spin': listPending }"
        title="刷新工作空间"
        @click="refreshWorkspace"
      >
        <RefreshCw class="h-4 w-4" />
      </button>
    </div>

    <div class="flex min-h-[560px] gap-0">
      <aside class="w-80 shrink-0 border-r border-border bg-muted/10">
        <div class="border-b border-border px-4 py-3 text-xs text-muted-foreground">
          共 {{ totalFileCount }} 个文件
        </div>
        <div v-if="flatTreeItems.length === 0" class="px-4 py-8 text-center text-sm text-muted-foreground">
          当前工作空间暂无文件。
        </div>
        <div v-else class="max-h-[640px] overflow-y-auto px-2 py-2">
          <div
            v-for="item in flatTreeItems"
            :key="item.node.relativePath"
            class="mb-1"
          >
            <button
              v-if="item.node.kind === 'directory'"
              class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-secondary/70"
              :style="{ paddingLeft: `${12 + item.depth * 18}px` }"
              @click="toggleDirectory(item.node.relativePath)"
            >
              <component :is="expandedDirectories.has(item.node.relativePath) ? ChevronDown : ChevronRight" class="h-4 w-4 shrink-0 text-muted-foreground" />
              <FolderOpen class="h-4 w-4 shrink-0 text-muted-foreground" />
              <span class="truncate text-sm font-medium text-foreground">{{ item.node.name }}</span>
            </button>

            <button
              v-else
              class="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left transition-colors"
              :class="selectedPath === item.node.relativePath
                ? 'bg-primary/8 text-primary'
                : 'hover:bg-secondary/70 text-foreground'"
              :style="{ paddingLeft: `${44 + item.depth * 18}px` }"
              @click="selectFile(item.node.relativePath)"
            >
              <component :is="item.node.previewType === 'image' ? FileImage : FileText" class="mt-0.5 h-4 w-4 shrink-0" :class="selectedPath === item.node.relativePath ? 'text-primary' : 'text-muted-foreground'" />
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <p class="truncate text-sm font-medium">{{ item.node.name }}</p>
                  <Lock v-if="!item.node.editable" class="h-3 w-3 shrink-0 text-muted-foreground/60" />
                </div>
                <p class="truncate text-[11px] text-muted-foreground">{{ fileSecondaryText(item.node) }}</p>
              </div>
            </button>
          </div>
        </div>
      </aside>

      <div class="min-w-0 flex-1">
        <div v-if="!entry" class="flex h-full items-center justify-center px-6 py-16">
          <div class="space-y-2 text-center">
            <FileText class="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p class="text-sm text-muted-foreground">选择左侧文件以预览、下载或按权限保存。</p>
          </div>
        </div>

        <div v-else class="flex h-full flex-col">
          <div class="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span class="truncate text-sm font-semibold text-foreground">{{ entry.name }}</span>
                <span class="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {{ entry.origin === 'upload' ? '上传文件' : '工作空间文件' }}
                </span>
                <span v-if="entry.editableMode === 'text'" class="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                  可编辑
                </span>
                <span v-else class="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  只读
                </span>
              </div>
              <p class="mt-1 truncate text-xs text-muted-foreground">{{ entry.relativePath }} · {{ formatBytes(entry.sizeBytes) }}</p>
            </div>

            <div class="flex items-center gap-2">
              <div v-if="canEditText" class="flex overflow-hidden rounded-lg border border-border text-xs font-medium">
                <button
                  class="px-3 py-1.5 transition-colors"
                  :class="mode === 'preview' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'"
                  @click="mode = 'preview'"
                >
                  <span class="flex items-center gap-1"><Eye class="h-3 w-3" />预览</span>
                </button>
                <button
                  class="px-3 py-1.5 transition-colors"
                  :class="mode === 'edit' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'"
                  @click="mode = 'edit'"
                >
                  <span class="flex items-center gap-1"><Pencil class="h-3 w-3" />编辑</span>
                </button>
              </div>

              <button
                class="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                @click="downloadFile"
              >
                <Download class="h-3.5 w-3.5" />下载
              </button>

              <button
                v-if="canEditText && mode === 'edit'"
                class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                :class="savingText
                  ? 'cursor-not-allowed bg-primary/60 text-primary-foreground'
                  : textSaveSuccess
                    ? 'bg-primary/80 text-primary-foreground'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90'"
                :disabled="savingText"
                @click="saveTextFile"
              >
                <Save class="h-3.5 w-3.5" />
                {{ savingText ? '保存中…' : textSaveSuccess ? '已保存' : '保存文本' }}
              </button>

            </div>
          </div>

          <div v-if="detail?.source?.text || detail?.source?.createdAt" class="border-b border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
            <p v-if="detail?.source?.text" class="leading-relaxed text-foreground/80">发送文本：{{ detail.source.text }}</p>
            <p v-if="detail?.source?.createdAt" class="mt-1">发送时间：{{ formatDateTime(detail.source.createdAt) }}</p>
          </div>

          <div v-if="saveError" class="mx-4 mt-3 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {{ saveError }}
          </div>

          <div v-if="filePending" class="flex flex-1 items-center justify-center px-6 py-16 text-sm text-muted-foreground">
            正在加载文件内容…
          </div>

          <div v-else class="min-h-0 flex-1 overflow-auto p-4">
            <textarea
              v-if="mode === 'edit' && canEditText"
              v-model="editorContent"
              class="min-h-[440px] w-full rounded-xl border border-border bg-background px-4 py-3 font-mono text-sm outline-none transition-colors focus:border-primary"
              spellcheck="false"
            />

            <div
              v-else-if="detail?.previewNotice"
              class="rounded-xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground"
            >
              {{ detail.previewNotice }}
            </div>

            <div v-else-if="entry.previewType === 'image'" class="overflow-hidden rounded-xl border border-border bg-muted/10 p-3">
              <img :src="currentImagePreviewUrl" :alt="entry.name" class="mx-auto max-h-[520px] w-auto rounded-lg object-contain" >
            </div>

            <iframe
              v-else-if="entry.previewType === 'pdf'"
              :src="detail?.rawUrl"
              class="h-[560px] w-full rounded-xl border border-border bg-background"
              title="PDF preview"
            />

            <article
              v-else-if="detail?.content && isMarkdownFile"
              class="prose prose-slate max-w-none rounded-xl border border-border bg-background px-5 py-4"
              v-html="renderedMarkdown"
            />

            <pre
              v-else-if="detail?.content"
              class="overflow-x-auto rounded-xl border border-border bg-background px-4 py-3 font-mono text-sm leading-6 text-foreground"
            >{{ detail.content }}</pre>

            <div v-else class="rounded-xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">
              当前文件没有可展示内容，请下载后查看。
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>