<script setup lang="ts">
import {
  ShieldCheck, Users, Key, FileText, AlertTriangle,
  Clock, Activity, Database, Download, Plus, Edit, ChevronRight,
  Trash2, KeyRound, Upload
} from "lucide-vue-next";
import {
  type RoleItem, type PermissionGroup, type AuditLogItem, type DataPolicyItem,
  INITIAL_ROLES, INITIAL_PERMISSION_GROUPS, INITIAL_AUDIT_LOGS, INITIAL_DATA_POLICIES,
  RESULT_STYLES, LEVEL_STYLES, LEVEL_LABELS
} from "./security-mock";

const roles = ref<RoleItem[]>([...INITIAL_ROLES]);
const permissionGroups = ref<PermissionGroup[]>(INITIAL_PERMISSION_GROUPS);
const auditLogs = ref<AuditLogItem[]>(INITIAL_AUDIT_LOGS);
const dataPolicies = ref<DataPolicyItem[]>([...INITIAL_DATA_POLICIES]);

// ------------------- Secrets 类型与数据 -------------------

type SecretItem = {
  id: string;
  key: string;
  maskedValue: string;
  scope: string;
  description: string;
  createdAt: string;
  updatedAt: string;
};

const secrets = ref<SecretItem[]>([]);
const secretsLoading = ref(false);
const showSecretModal = ref(false);
const secretModalMode = ref<"add" | "edit">("add");
const editingSecretKey = ref("");
const secretForm = reactive({
  key: "",
  value: "",
  scope: "global",
  description: ""
});
const showDeleteConfirm = ref(false);
const deletingSecretKey = ref("");

// ------------------- 批量导入 -------------------
const showBulkImportModal = ref(false);
const bulkImportText = ref("");
const bulkImportScope = ref("global");
const bulkImportLoading = ref(false);
const bulkImportResult = ref<{ results: Array<{ key: string; status: string; error?: string }>; summary: { total: number; created: number; updated: number; skipped: number } } | null>(null);

function openBulkImport() {
  bulkImportText.value = "";
  bulkImportScope.value = "global";
  bulkImportLoading.value = false;
  bulkImportResult.value = null;
  showBulkImportModal.value = true;
}

const bulkImportParsed = computed(() => {
  const lines = bulkImportText.value.split("\n");
  const items: Array<{ key: string; value: string }> = [];
  const errors: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? "").trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx <= 0) {
      errors.push(`第 ${i + 1} 行格式错误：${line.slice(0, 40)}`);
      continue;
    }
    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim();
    if (!key || !value) {
      errors.push(`第 ${i + 1} 行 key 或 value 为空`);
      continue;
    }
    items.push({ key, value });
  }
  return { items, errors };
});

async function executeBulkImport() {
  const { items } = bulkImportParsed.value;
  if (items.length === 0) return;
  bulkImportLoading.value = true;
  try {
    const res = await $fetch<{ ok: boolean; data: { results: Array<{ key: string; status: string; error?: string }>; summary: { total: number; created: number; updated: number; skipped: number } } }>("/api/secrets/bulk", {
      method: "POST",
      body: { items: items.map((item) => ({ ...item, scope: bulkImportScope.value })) }
    });
    bulkImportResult.value = res.data;
    await fetchSecrets();
  } finally {
    bulkImportLoading.value = false;
  }
}

async function fetchSecrets() {
  secretsLoading.value = true;
  try {
    const res = await $fetch<{ ok: boolean; data: SecretItem[] }>("/api/secrets");
    secrets.value = res.data ?? [];
  } catch {
    secrets.value = [];
  } finally {
    secretsLoading.value = false;
  }
}

function openAddSecret() {
  secretModalMode.value = "add";
  secretForm.key = "";
  secretForm.value = "";
  secretForm.scope = "global";
  secretForm.description = "";
  showSecretModal.value = true;
}

function openEditSecret(s: SecretItem) {
  secretModalMode.value = "edit";
  editingSecretKey.value = s.key;
  secretForm.key = s.key;
  secretForm.value = "";
  secretForm.scope = s.scope;
  secretForm.description = s.description;
  showSecretModal.value = true;
}

async function saveSecret() {
  if (secretModalMode.value === "add") {
    if (!secretForm.key.trim() || !secretForm.value) return;
    await $fetch("/api/secrets", {
      method: "POST",
      body: { key: secretForm.key.trim(), value: secretForm.value, scope: secretForm.scope, description: secretForm.description }
    });
  } else {
    await $fetch(`/api/secrets/${editingSecretKey.value}`, {
      method: "PATCH",
      body: { value: secretForm.value || undefined, description: secretForm.description }
    });
  }
  showSecretModal.value = false;
  await fetchSecrets();
}

function confirmDeleteSecret(key: string) {
  deletingSecretKey.value = key;
  showDeleteConfirm.value = true;
}

async function deleteSecret() {
  await $fetch(`/api/secrets/${deletingSecretKey.value}`, { method: "DELETE" });
  showDeleteConfirm.value = false;
  await fetchSecrets();
}

// ------------------- 状态管理 -------------------

const activeTab = ref<"permissions" | "audit" | "data-security" | "secrets">("permissions");
const selectedRoleId = ref<string | null>("r3");
const showAddRoleModal = ref(false);
const newRoleName = ref("");
const newRoleDesc = ref("");
const auditFilter = ref<"all" | "success" | "failure" | "warning">("all");

const tabs = [
  { key: "permissions" as const, label: "权限管理", icon: Key },
  { key: "secrets" as const, label: "密钥管理", icon: KeyRound },
  { key: "audit" as const, label: "操作审计", icon: FileText },
  { key: "data-security" as const, label: "数据安全", icon: Database }
];

watch(activeTab, (tab) => {
  if (tab === "secrets") fetchSecrets();
});

const selectedRole = computed(() => roles.value.find((r) => r.id === selectedRoleId.value) ?? null);

const filteredLogs = computed(() => {
  if (auditFilter.value === "all") return auditLogs.value;
  return auditLogs.value.filter((l) => l.result === auditFilter.value);
});

const securityStats = computed(() => ({
  roles: roles.value.length,
  activePolicies: dataPolicies.value.filter((p) => p.status === "active").length,
  totalPolicies: dataPolicies.value.length,
  recentEvents: auditLogs.value.length,
  failedEvents: auditLogs.value.filter((l) => l.result === "failure").length
}));

function selectRole(id: string) {
  selectedRoleId.value = id;
}

function togglePolicy(id: string) {
  const p = dataPolicies.value.find((p) => p.id === id);
  if (p && !isHighPolicy(p)) {
    p.status = p.status === "active" ? "inactive" : "active";
  }
}

function isHighPolicy(p: DataPolicyItem) {
  return p.level === "high";
}

function addRole() {
  if (!newRoleName.value.trim()) return;
  roles.value.push({
    id: `r${Date.now()}`,
    name: newRoleName.value.trim(),
    description: newRoleDesc.value.trim() || "自定义角色",
    permissions: [],
    memberCount: 0,
    isSystem: false
  });
  newRoleName.value = "";
  newRoleDesc.value = "";
  showAddRoleModal.value = false;
}

function exportAuditLog() {
  // 纯前端 CSV 导出示例
  const header = "时间,操作者,操作,对象,IP,结果\n";
  const rows = filteredLogs.value
    .map((l) => `${l.time},${l.operator},${l.action},${l.target},${l.ip},${l.result}`)
    .join("\n");
  const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const resultStyles = RESULT_STYLES;
const levelStyles = LEVEL_STYLES;
const levelLabels = LEVEL_LABELS;
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6 p-6 lg:p-8">
    <!-- Header -->
    <header class="hero-section">
      <div class="relative space-y-3">
        <span class="section-label">安全中心</span>
        <h1 class="font-display text-3xl font-bold tracking-tight lg:text-4xl">
          权限管理与数据安全
        </h1>
        <p class="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          管理成员角色与访问权限，监控操作行为，保障平台数据合规与安全。
        </p>
      </div>
    </header>

    <!-- 安全概览指标 -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="card-elevated flex flex-col gap-1.5 p-4">
        <div class="flex items-center gap-2">
          <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Users class="h-4 w-4 text-primary" :stroke-width="1.8" />
          </span>
          <span class="text-xs text-muted-foreground">角色数量</span>
        </div>
        <p class="text-2xl font-bold text-foreground">{{ securityStats.roles }}</p>
      </div>
      <div class="card-elevated flex flex-col gap-1.5 p-4">
        <div class="flex items-center gap-2">
          <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <ShieldCheck class="h-4 w-4 text-primary" :stroke-width="1.8" />
          </span>
          <span class="text-xs text-muted-foreground">启用策略</span>
        </div>
        <p class="text-2xl font-bold text-foreground">
          {{ securityStats.activePolicies }}
          <span class="text-sm font-normal text-muted-foreground"> / {{ securityStats.totalPolicies }}</span>
        </p>
      </div>
      <div class="card-elevated flex flex-col gap-1.5 p-4">
        <div class="flex items-center gap-2">
          <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Activity class="h-4 w-4 text-muted-foreground" :stroke-width="1.8" />
          </span>
          <span class="text-xs text-muted-foreground">近期操作</span>
        </div>
        <p class="text-2xl font-bold text-foreground">{{ securityStats.recentEvents }}</p>
      </div>
      <div class="card-elevated flex flex-col gap-1.5 p-4">
        <div class="flex items-center gap-2">
          <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
            <AlertTriangle class="h-4 w-4 text-destructive" :stroke-width="1.8" />
          </span>
          <span class="text-xs text-muted-foreground">异常事件</span>
        </div>
        <p class="text-2xl font-bold text-destructive">{{ securityStats.failedEvents }}</p>
      </div>
    </div>

    <!-- Tab 切换 -->
    <div class="flex gap-1 rounded-xl border border-border bg-muted/40 p-1">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-150"
        :class="activeTab === tab.key
          ? 'bg-card shadow-sm text-foreground'
          : 'text-muted-foreground hover:text-foreground'"
        @click="activeTab = tab.key"
      >
        <component :is="tab.icon" class="h-4 w-4" :stroke-width="1.8" />
        {{ tab.label }}
      </button>
    </div>

    <!-- ===== 权限管理 ===== -->
    <div v-if="activeTab === 'permissions'" class="grid gap-5 lg:grid-cols-[280px_1fr]">
      <!-- 角色列表 -->
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold text-foreground">角色列表</h2>
          <button
            class="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
            @click="showAddRoleModal = true"
          >
            <Plus class="h-3.5 w-3.5" />
            新建角色
          </button>
        </div>

        <div class="space-y-2">
          <button
            v-for="role in roles"
            :key="role.id"
            class="w-full rounded-xl border p-3 text-left transition-all duration-150"
            :class="selectedRoleId === role.id
              ? 'border-primary/30 bg-primary/5 shadow-sm'
              : 'border-border bg-card hover:border-primary/20 hover:bg-muted/30'"
            @click="selectRole(role.id)"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="flex items-center gap-1.5">
                  <span class="truncate text-sm font-medium text-foreground">{{ role.name }}</span>
                  <span v-if="role.isSystem" class="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium bg-primary/10 text-primary">系统</span>
                </div>
                <p class="mt-0.5 truncate text-xs text-muted-foreground">{{ role.description }}</p>
              </div>
              <ChevronRight class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" :stroke-width="1.8" />
            </div>
            <div class="mt-2 flex items-center gap-2">
              <span class="flex items-center gap-1 text-xs text-muted-foreground">
                <Users class="h-3 w-3" />
                {{ role.memberCount }} 人
              </span>
              <span class="text-xs text-muted-foreground">·</span>
              <span class="text-xs text-muted-foreground">{{ role.permissions.length }} 项权限</span>
            </div>
          </button>
        </div>
      </div>

      <SecurityPermissionDetail :role="selectedRole" :permission-groups="permissionGroups" />
    </div>

    <!-- ===== 操作审计 ===== -->
    <div v-if="activeTab === 'audit'" class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <span class="text-sm font-semibold text-foreground">操作日志</span>
          <span class="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">{{ filteredLogs.length }} 条</span>
        </div>
        <div class="flex items-center gap-2">
          <!-- 筛选 -->
          <div class="flex gap-1 rounded-lg border border-border bg-card p-1">
            <button
              v-for="f in [
                { key: 'all', label: '全部' },
                { key: 'success', label: '成功' },
                { key: 'failure', label: '失败' },
                { key: 'warning', label: '警告' }
              ]"
              :key="f.key"
              class="rounded-md px-3 py-1 text-xs font-medium transition-colors"
              :class="auditFilter === f.key
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'"
              @click="auditFilter = (f.key as any)"
            >
              {{ f.label }}
            </button>
          </div>
          <button class="btn-ghost text-xs" @click="exportAuditLog">
            <Download class="h-3.5 w-3.5" />
            导出 CSV
          </button>
        </div>
      </div>

      <!-- 日志表格 -->
      <div class="card-elevated overflow-hidden rounded-xl">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-border bg-muted/30">
              <th class="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">时间</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">操作者</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">操作</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">对象</th>
              <th class="hidden px-4 py-3 text-left text-xs font-semibold text-muted-foreground sm:table-cell">IP</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">结果</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="log in filteredLogs"
              :key="log.id"
              class="border-b border-border/50 transition-colors last:border-0 hover:bg-muted/20"
            >
              <td class="px-4 py-3">
                <span class="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock class="h-3.5 w-3.5 shrink-0" />
                  {{ log.time }}
                </span>
              </td>
              <td class="px-4 py-3">
                <span class="text-sm font-medium text-foreground">{{ log.operator }}</span>
              </td>
              <td class="px-4 py-3">
                <span class="text-sm text-foreground">{{ log.action }}</span>
              </td>
              <td class="px-4 py-3">
                <span class="text-xs text-muted-foreground">{{ log.target }}</span>
              </td>
              <td class="hidden px-4 py-3 sm:table-cell">
                <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">{{ log.ip }}</code>
              </td>
              <td class="px-4 py-3">
                <span
                  class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                  :class="resultStyles[log.result]?.badge"
                >
                  <component :is="resultStyles[log.result]?.icon" class="h-3 w-3" :stroke-width="2" />
                  {{ { success: '成功', failure: '失败', warning: '警告' }[log.result] }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="filteredLogs.length === 0" class="py-12 text-center text-sm text-muted-foreground">
          暂无相关日志记录
        </div>
      </div>
    </div>

    <!-- ===== 数据安全 ===== -->
    <div v-if="activeTab === 'data-security'" class="space-y-5">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-sm font-semibold text-foreground">安全策略</h2>
          <p class="mt-0.5 text-xs text-muted-foreground">管理平台数据保护与访问控制策略</p>
        </div>
        <div class="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
          <span class="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
            <ShieldCheck class="h-4 w-4 text-primary" :stroke-width="1.8" />
          </span>
          <div>
            <p class="text-xs font-medium text-foreground">安全评分</p>
            <p class="text-xs text-primary font-semibold">{{ Math.round((securityStats.activePolicies / securityStats.totalPolicies) * 100) }}%</p>
          </div>
        </div>
      </div>

      <div class="space-y-3">
        <div
          v-for="policy in dataPolicies"
          :key="policy.id"
          class="card-elevated flex items-center gap-4 rounded-xl p-4 transition-all"
          :class="policy.status === 'inactive' && 'opacity-60'"
        >
          <div
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            :class="policy.status === 'active' ? 'bg-primary/10' : 'bg-muted'"
          >
            <ShieldCheck
              class="h-5 w-5"
              :class="policy.status === 'active' ? 'text-primary' : 'text-muted-foreground'"
              :stroke-width="1.8"
            />
          </div>

          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium text-foreground">{{ policy.description }}</span>
              <span
                class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                :class="levelStyles[policy.level]"
              >
                {{ levelLabels[policy.level] }}级
              </span>
            </div>
            <p class="mt-0.5 text-xs text-muted-foreground">{{ policy.category }}</p>
          </div>

          <div class="flex items-center gap-3 shrink-0">
            <span
              class="text-xs font-medium"
              :class="policy.status === 'active' ? 'text-primary' : 'text-muted-foreground'"
            >
              {{ policy.status === 'active' ? '已启用' : '已停用' }}
            </span>
            <!-- 高级策略不允许手动关闭 -->
            <button
              class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200"
              :class="[
                policy.status === 'active' ? 'bg-primary' : 'bg-border',
                isHighPolicy(policy) && 'cursor-not-allowed opacity-60'
              ]"
              :disabled="isHighPolicy(policy)"
              :title="isHighPolicy(policy) ? '高级策略不允许停用' : ''"
              @click="togglePolicy(policy.id)"
            >
              <span
                class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-200"
                :class="policy.status === 'active' ? 'translate-x-[18px]' : 'translate-x-0.5'"
              />
            </button>
          </div>
        </div>
      </div>

      <!-- 安全提示 -->
      <div class="rounded-xl border border-warning/30 bg-warning/5 px-4 py-3">
        <div class="flex items-start gap-2.5">
          <AlertTriangle class="mt-0.5 h-4 w-4 shrink-0 text-warning" :stroke-width="1.8" />
          <div>
            <p class="text-sm font-medium text-warning-foreground">注意</p>
            <p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              高级策略（MFA、加密、TLS）为平台基础安全保障，不建议停用。如需调整，请联系系统管理员。
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== 密钥管理 ===== -->
    <div v-if="activeTab === 'secrets'" class="space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-sm font-semibold text-foreground">密钥管理</h2>
          <p class="mt-0.5 text-xs text-muted-foreground">管理 Skill 脚本运行时所需的凭证与密钥，值以 AES-256 加密存储。</p>
        </div>
        <div class="flex items-center gap-2">
          <button
            class="btn-ghost text-xs"
            @click="openBulkImport"
          >
            <Upload class="h-3.5 w-3.5" />
            批量导入
          </button>
          <button
            class="btn-primary text-xs"
            @click="openAddSecret"
          >
            <Plus class="h-3.5 w-3.5" />
            添加密钥
          </button>
        </div>
      </div>

      <div v-if="secretsLoading" class="py-12 text-center text-sm text-muted-foreground">加载中...</div>

      <div v-else-if="secrets.length === 0" class="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 py-16 text-center">
        <KeyRound class="mb-3 h-8 w-8 text-muted-foreground/40" :stroke-width="1.5" />
        <p class="text-sm font-medium text-muted-foreground">暂无密钥</p>
        <p class="mt-1 text-xs text-muted-foreground">点击"添加密钥"创建第一个密钥，Skill 脚本可通过 process.env 读取。</p>
      </div>

      <div v-else class="space-y-2">
        <div
          v-for="s in secrets"
          :key="s.id"
          class="card-elevated flex items-center gap-4 rounded-xl p-4"
        >
          <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Key class="h-4 w-4 text-primary" :stroke-width="1.8" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <code class="text-sm font-semibold text-foreground">{{ s.key }}</code>
              <span class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-muted text-muted-foreground">
                {{ s.scope === 'global' ? '全局' : s.scope }}
              </span>
            </div>
            <div class="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
              <span class="font-mono">{{ s.maskedValue }}</span>
              <span v-if="s.description">· {{ s.description }}</span>
            </div>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <button
              class="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="编辑"
              @click="openEditSecret(s)"
            >
              <Edit class="h-3.5 w-3.5" :stroke-width="1.8" />
            </button>
            <button
              class="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              title="删除"
              @click="confirmDeleteSecret(s.key)"
            >
              <Trash2 class="h-3.5 w-3.5" :stroke-width="1.8" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 密钥添加/编辑弹窗 -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="showSecretModal"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          @click.self="showSecretModal = false"
        >
          <div class="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <h2 class="mb-4 text-base font-semibold text-foreground">
              {{ secretModalMode === 'add' ? '添加密钥' : '编辑密钥' }}
            </h2>
            <div class="space-y-3">
              <div>
                <label class="mb-1.5 block text-xs font-medium text-muted-foreground">Key（环境变量名）</label>
                <input
                  v-model="secretForm.key"
                  type="text"
                  class="input-field font-mono"
                  placeholder="如 DINGTALK_APP_KEY"
                  :disabled="secretModalMode === 'edit'"
                  :class="secretModalMode === 'edit' && 'opacity-60 cursor-not-allowed'"
                />
              </div>
              <div>
                <label class="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Value{{ secretModalMode === 'edit' ? '（留空则不更新）' : '' }}
                </label>
                <input
                  v-model="secretForm.value"
                  type="password"
                  class="input-field font-mono"
                  placeholder="输入密钥值"
                  autocomplete="off"
                />
              </div>
              <div>
                <label class="mb-1.5 block text-xs font-medium text-muted-foreground">作用域</label>
                <select v-model="secretForm.scope" class="input-field">
                  <option value="global">全局（所有员工可用）</option>
                </select>
              </div>
              <div>
                <label class="mb-1.5 block text-xs font-medium text-muted-foreground">描述（可选）</label>
                <input
                  v-model="secretForm.description"
                  type="text"
                  class="input-field"
                  placeholder="备注说明"
                />
              </div>
            </div>
            <div class="mt-5 flex justify-end gap-2">
              <button class="btn-ghost text-sm" @click="showSecretModal = false">取消</button>
              <button
                class="btn-primary text-sm"
                :disabled="secretModalMode === 'add' && (!secretForm.key.trim() || !secretForm.value)"
                @click="saveSecret"
              >
                {{ secretModalMode === 'add' ? '添加' : '保存' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 批量导入弹窗 -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="showBulkImportModal"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          @click.self="showBulkImportModal = false"
        >
          <div class="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <h2 class="mb-1 text-base font-semibold text-foreground">批量导入密钥</h2>
            <p class="mb-4 text-xs text-muted-foreground">每行一条，格式：<code class="rounded bg-muted px-1 py-0.5 font-mono">KEY=VALUE</code>，支持 <code class="rounded bg-muted px-1 py-0.5 font-mono">#</code> 注释行，已存在的 key 将更新值。</p>

            <div v-if="!bulkImportResult" class="space-y-3">
              <div>
                <label class="mb-1.5 block text-xs font-medium text-muted-foreground">粘贴密钥内容</label>
                <textarea
                  v-model="bulkImportText"
                  class="input-field resize-none font-mono text-xs"
                  rows="10"
                  placeholder="# 示例（# 开头为注释）&#10;DINGTALK_APP_KEY=dingxxxxxx&#10;DINGTALK_APP_SECRET=xxxxxx&#10;OPENAI_API_KEY=sk-xxxxxx"
                  :disabled="bulkImportLoading"
                />
              </div>
              <div v-if="bulkImportParsed.errors.length > 0" class="rounded-lg bg-destructive/10 px-3 py-2">
                <p class="mb-1 text-xs font-medium text-destructive">格式错误（{{ bulkImportParsed.errors.length }} 行将被跳过）</p>
                <ul class="space-y-0.5">
                  <li v-for="(e, i) in bulkImportParsed.errors" :key="i" class="text-xs text-destructive">{{ e }}</li>
                </ul>
              </div>
              <div>
                <label class="mb-1.5 block text-xs font-medium text-muted-foreground">作用域</label>
                <select v-model="bulkImportScope" class="input-field" :disabled="bulkImportLoading">
                  <option value="global">全局（所有员工可用）</option>
                </select>
              </div>
              <p class="text-xs text-muted-foreground">
                解析到 <span class="font-semibold text-foreground">{{ bulkImportParsed.items.length }}</span> 条有效密钥
              </p>
            </div>

            <!-- 导入结果 -->
            <div v-else class="space-y-3">
              <div class="grid grid-cols-3 gap-2 text-center">
                <div class="rounded-lg bg-primary/10 p-3">
                  <p class="text-lg font-bold text-primary">{{ bulkImportResult.summary.created }}</p>
                  <p class="text-xs text-muted-foreground">新增</p>
                </div>
                <div class="rounded-lg bg-warning/10 p-3">
                  <p class="text-lg font-bold text-warning-foreground">{{ bulkImportResult.summary.updated }}</p>
                  <p class="text-xs text-muted-foreground">更新</p>
                </div>
                <div class="rounded-lg bg-muted p-3">
                  <p class="text-lg font-bold text-muted-foreground">{{ bulkImportResult.summary.skipped }}</p>
                  <p class="text-xs text-muted-foreground">跳过</p>
                </div>
              </div>
              <div v-if="bulkImportResult.results.some(r => r.status === 'skipped')" class="max-h-40 overflow-y-auto rounded-lg border border-border bg-muted/30 p-2">
                <p class="mb-1 text-xs font-medium text-muted-foreground">跳过详情</p>
                <ul class="space-y-0.5">
                  <li
                    v-for="r in bulkImportResult.results.filter(r => r.status === 'skipped')"
                    :key="r.key"
                    class="font-mono text-xs text-destructive"
                  >
                    {{ r.key }}{{ r.error ? ` — ${r.error}` : '' }}
                  </li>
                </ul>
              </div>
            </div>

            <div class="mt-5 flex justify-end gap-2">
              <button class="btn-ghost text-sm" @click="showBulkImportModal = false">{{ bulkImportResult ? '关闭' : '取消' }}</button>
              <button
                v-if="!bulkImportResult"
                class="btn-primary text-sm"
                :disabled="bulkImportParsed.items.length === 0 || bulkImportLoading"
                @click="executeBulkImport"
              >
                {{ bulkImportLoading ? '导入中...' : `导入 ${bulkImportParsed.items.length} 条` }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 删除确认弹窗 -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="showDeleteConfirm"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          @click.self="showDeleteConfirm = false"
        >
          <div class="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <h2 class="mb-2 text-base font-semibold text-foreground">确认删除</h2>
            <p class="text-sm text-muted-foreground">
              确定删除密钥 <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{{ deletingSecretKey }}</code> 吗？删除后 Skill 脚本将无法通过 process.env 读取该值。
            </p>
            <div class="mt-5 flex justify-end gap-2">
              <button class="btn-ghost text-sm" @click="showDeleteConfirm = false">取消</button>
              <button class="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors" @click="deleteSecret">删除</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 新建角色弹窗 -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="showAddRoleModal"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          @click.self="showAddRoleModal = false"
        >
          <div class="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <h2 class="mb-4 text-base font-semibold text-foreground">新建角色</h2>
            <div class="space-y-3">
              <div>
                <label class="mb-1.5 block text-xs font-medium text-muted-foreground">角色名称</label>
                <input
                  v-model="newRoleName"
                  type="text"
                  class="input-field"
                  placeholder="如：内容审核员"
                  maxlength="20"
                />
              </div>
              <div>
                <label class="mb-1.5 block text-xs font-medium text-muted-foreground">角色描述</label>
                <textarea
                  v-model="newRoleDesc"
                  class="input-field resize-none"
                  rows="2"
                  placeholder="简要说明该角色的职责范围"
                  maxlength="100"
                />
              </div>
            </div>
            <div class="mt-5 flex justify-end gap-2">
              <button class="btn-ghost text-sm" @click="showAddRoleModal = false">取消</button>
              <button class="btn-primary text-sm" :disabled="!newRoleName.trim()" @click="addRole">创建角色</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
