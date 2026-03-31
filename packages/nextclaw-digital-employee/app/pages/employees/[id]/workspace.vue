<script setup lang="ts">
import { FileText, Download, Eye, Pencil, Save, RefreshCw, Lock } from "lucide-vue-next";
import { renderMarkdown } from "~/lib/utils";

const route = useRoute();
const employeeId = computed(() => String(route.params.id));

type WorkspaceFile = {
  filename: string;
  exists: boolean;
  sizeBytes: number;
  writable: boolean;
};

type FileListPayload = {
  ok: boolean;
  data: { files: WorkspaceFile[] };
};

type FileContentPayload = {
  ok: boolean;
  data: { filename: string; content: string };
};

// ── File list ──────────────────────────────────────────────────────────────────
const { data: listData, refresh: refreshList, pending: listPending } = await useFetch<FileListPayload>(
  () => `/api/employees/${employeeId.value}/workspace`,
  { key: computed(() => `employee-workspace-list:${employeeId.value}`) }
);

const files = computed(() => listData.value?.data.files ?? []);

// ── Selected file ──────────────────────────────────────────────────────────────
const selectedFilename = ref<string | null>(null);
const mode = ref<"preview" | "edit">("preview");
const editorContent = ref("");
const saving = ref(false);
const saveError = ref<string | null>(null);
const saveSuccess = ref(false);

const { data: fileData, refresh: refreshFile, pending: filePending } = await useFetch<FileContentPayload>(
  () => selectedFilename.value ? `/api/employees/${employeeId.value}/workspace/${selectedFilename.value}` : null,
  {
    key: computed(() => `employee-workspace-file:${employeeId.value}:${selectedFilename.value ?? ""}`),
    watch: [selectedFilename]
  }
);

const fileContent = computed(() => fileData.value?.data.content ?? "");
const selectedFile = computed(() => files.value.find((f) => f.filename === selectedFilename.value) ?? null);
const isEditable = computed(() => selectedFile.value?.writable ?? false);

watch(fileContent, (val) => {
  editorContent.value = val;
});

watch(selectedFilename, () => {
  mode.value = "preview";
  saveError.value = null;
  saveSuccess.value = false;
});

function selectFile(filename: string) {
  if (selectedFilename.value === filename) return;
  selectedFilename.value = filename;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

// ── Save ───────────────────────────────────────────────────────────────────────
async function saveFile() {
  if (!selectedFilename.value || !isEditable.value) return;
  saving.value = true;
  saveError.value = null;
  saveSuccess.value = false;
  try {
    await $fetch(`/api/employees/${employeeId.value}/workspace/${selectedFilename.value}`, {
      method: "PUT",
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

// ── Download ───────────────────────────────────────────────────────────────────
function downloadFile() {
  if (!selectedFilename.value) return;
  const content = mode.value === "edit" ? editorContent.value : fileContent.value;
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = selectedFilename.value;
  a.click();
  URL.revokeObjectURL(url);
}

// Auto-select first existing file
watchEffect(() => {
  if (!selectedFilename.value && files.value.length > 0) {
    const first = files.value.find((f) => f.exists);
    if (first) selectedFilename.value = first.filename;
  }
});
</script>

<template>
  <div class="flex gap-6 min-h-[540px]">
    <!-- Left: file list -->
    <aside class="w-64 shrink-0 space-y-2">
      <div class="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div class="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <p class="section-label">核心文件</p>
            <p class="text-xs text-muted-foreground mt-0.5">引导角色、身份和工具指南。</p>
          </div>
          <button
            class="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            :class="{ 'animate-spin': listPending }"
            @click="refreshList()"
            title="刷新"
          >
            <RefreshCw class="h-3.5 w-3.5" />
          </button>
        </div>
        <ul class="divide-y divide-border">
          <li
            v-for="file in files"
            :key="file.filename"
            class="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors"
            :class="selectedFilename === file.filename
              ? 'bg-primary/8 border-l-2 border-l-primary'
              : 'hover:bg-secondary/60'"
            @click="selectFile(file.filename)"
          >
            <FileText
              class="h-4 w-4 shrink-0"
              :class="selectedFilename === file.filename ? 'text-primary' : 'text-muted-foreground'"
            />
            <div class="min-w-0 flex-1">
              <p
                class="text-sm font-medium truncate"
                :class="selectedFilename === file.filename ? 'text-primary' : 'text-foreground'"
              >
                {{ file.filename }}
              </p>
              <p class="text-[11px] text-muted-foreground">
                {{ file.exists ? formatBytes(file.sizeBytes) : '空文件' }}
              </p>
            </div>
            <Lock v-if="!file.writable" class="h-3 w-3 shrink-0 text-muted-foreground/50" title="只读" />
          </li>
        </ul>
      </div>
    </aside>

    <!-- Right: content panel -->
    <div class="flex-1 min-w-0">
      <!-- Empty state -->
      <div
        v-if="!selectedFilename"
        class="flex h-full items-center justify-center rounded-xl border border-border bg-card shadow-sm"
      >
        <div class="text-center space-y-2 py-12 px-6">
          <FileText class="h-10 w-10 mx-auto text-muted-foreground/40" />
          <p class="text-sm text-muted-foreground">选择左侧文件以预览或编辑</p>
        </div>
      </div>

      <!-- File panel -->
      <div v-else class="rounded-xl border border-border bg-card shadow-sm overflow-hidden flex flex-col h-full">
        <!-- Toolbar -->
        <div class="flex items-center justify-between gap-3 px-4 py-3 border-b border-border shrink-0">
          <div class="flex items-center gap-2 min-w-0">
            <FileText class="h-4 w-4 text-primary shrink-0" />
            <span class="font-mono text-sm font-semibold truncate">{{ selectedFilename }}</span>
            <span
              v-if="!isEditable"
              class="text-[10px] font-medium rounded-full bg-muted px-2 py-0.5 text-muted-foreground shrink-0"
            >只读</span>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <!-- Preview / Edit toggle -->
            <div class="flex rounded-lg border border-border overflow-hidden text-xs font-medium">
              <button
                class="px-3 py-1.5 transition-colors"
                :class="mode === 'preview' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'"
                @click="mode = 'preview'"
              >
                <span class="flex items-center gap-1"><Eye class="h-3 w-3" />预览</span>
              </button>
              <button
                class="px-3 py-1.5 transition-colors"
                :class="mode === 'edit'
                  ? 'bg-primary text-primary-foreground'
                  : isEditable ? 'text-muted-foreground hover:bg-secondary' : 'text-muted-foreground/40 cursor-not-allowed'"
                :disabled="!isEditable"
                @click="isEditable && (mode = 'edit')"
              >
                <span class="flex items-center gap-1"><Pencil class="h-3 w-3" />编辑</span>
              </button>
            </div>
            <!-- Download -->
            <button
              class="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              @click="downloadFile"
              title="下载文件"
            >
              <Download class="h-3.5 w-3.5" />
              下载
            </button>
            <!-- Save -->
            <button
              v-if="mode === 'edit'"
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
              {{ saving ? '保存中…' : saveSuccess ? '已保存' : '保存' }}
            </button>
          </div>
        </div>

        <!-- Error -->
        <div v-if="saveError" class="mx-4 mt-3 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive shrink-0">
          {{ saveError }}
        </div>

        <!-- Loading -->
        <div v-if="filePending" class="flex-1 flex items-center justify-center">
          <p class="text-sm text-muted-foreground animate-pulse">加载中…</p>
        </div>

        <!-- Preview mode -->
        <div
          v-else-if="mode === 'preview'"
          class="flex-1 overflow-auto px-6 py-5 prose prose-sm max-w-none"
        >
          <div
            v-if="fileContent"
            class="markdown-body text-sm leading-relaxed text-foreground"
            v-html="renderMarkdown(fileContent)"
          />
          <p v-else class="text-sm text-muted-foreground italic">该文件为空。</p>
        </div>

        <!-- Edit mode -->
        <div v-else-if="mode === 'edit'" class="flex-1 flex flex-col min-h-0 p-4">
          <textarea
            v-model="editorContent"
            class="flex-1 w-full resize-none rounded-lg border border-input bg-background px-3 py-3 font-mono text-sm leading-relaxed text-foreground focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground min-h-[420px]"
            placeholder="文件内容为空，在此处输入内容后保存…"
            spellcheck="false"
          />
        </div>
      </div>
    </div>
  </div>
</template>
