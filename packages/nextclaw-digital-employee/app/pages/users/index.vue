<script setup lang="ts">
import { Search, Link2, Unlink, Plus, Pencil, KeyRound, Trash2, RefreshCw } from "lucide-vue-next";
import type { UserView, UserRole, UpdateUserInput } from "../../../shared/auth-types";

const { getAccessToken, user: currentUser } = useAuth();

const toast = useToast();
const { loading, execute } = useApiCall({ toast: { composable: toast, prefix: "操作失败" } });

const users = ref<UserView[]>([]);
const search = ref("");

const filteredUsers = computed(() => {
  if (!search.value) return users.value;
  const q = search.value.toLowerCase();
  return users.value.filter(
    (u) =>
      u.displayName.toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.externalUserId?.toLowerCase().includes(q) ||
      u.externalUserName.toLowerCase().includes(q) ||
      u.externalName.toLowerCase().includes(q) ||
      u.externalPostName.toLowerCase().includes(q) ||
      u.externalRoleName.toLowerCase().includes(q) ||
      u.externalDingTalkId.toLowerCase().includes(q)
  );
});

function authProviderLabel(user: UserView): string {
  return user.authProvider === "local" ? "本地登录" : "Keycloak";
}

function sourceBadgeClass(user: UserView): string {
  return user.userSource === "sync" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700";
}

function sourceLabel(user: UserView): string {
  return user.userSource === "sync" ? "外部同步" : "系统创建";
}

function authHeaders(): Record<string, string> {
  const t = getAccessToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function loadUsers() {
  const res = await execute(() =>
    $fetch<{ ok: boolean; data: UserView[] }>("/api/users", { headers: authHeaders() })
  );
  if (res?.ok) users.value = res.data;
}

async function syncUsers() {
  const confirmed = window.confirm(
    "将从外部接口同步人员到用户表。\n\n已存在用户会更新资料，不存在用户会新增，系统已有但外部未返回的用户不会被删除。\n\n确定继续同步？"
  );
  if (!confirmed) return;

  const res = await execute(() =>
    $fetch<{ ok: boolean; data: { total: number; created: number; updated: number; skipped: number; failed: number; summary: string } }>(
      "/api/users/sync-trigger",
      {
        method: "POST",
        headers: authHeaders(),
      }
    )
  );

  if (res?.ok) {
    toast.showToast(
      "success",
      `${res.data.summary}：新增 ${res.data.created}，更新 ${res.data.updated}，跳过 ${res.data.skipped}`
    );
    await loadUsers();
  }
}

async function updateUser(id: string, input: UpdateUserInput) {
  const res = await execute(() =>
    $fetch<{ ok: boolean; data: UserView }>(`/api/users/${id}`, {
      method: "PATCH",
      body: input,
      headers: authHeaders(),
    })
  );
  if (res?.ok) {
    const idx = users.value.findIndex((u) => u.id === id);
    if (idx !== -1) users.value[idx] = res.data;
    toast.showToast("success", "已更新");
  }
}

const roleOptions: { value: UserRole; label: string }[] = [
  { value: "admin", label: "管理员" },
  { value: "manager", label: "部门管理员" },
  { value: "user", label: "普通成员" },
];

const bindDialogOpen = ref(false);
const bindTargetUser = ref<UserView | null>(null);
const humanEmployees = ref<Array<{ id: string; name: string; title: string; avatar: string }>>([]);
const selectedHumanEmployeeId = ref<string>("");
const bindSearch = ref("");

const filteredHumanEmployees = computed(() => {
  const bound = new Set(users.value.filter((u) => u.humanEmployeeId).map((u) => u.humanEmployeeId));
  let list = humanEmployees.value.filter((he) => !bound.has(he.id));
  if (bindSearch.value) {
    const q = bindSearch.value.toLowerCase();
    list = list.filter((he) => he.name.toLowerCase().includes(q) || he.title.toLowerCase().includes(q));
  }
  return list;
});

function openBindDialog(u: UserView) {
  bindTargetUser.value = u;
  selectedHumanEmployeeId.value = "";
  bindSearch.value = "";
  bindDialogOpen.value = true;
  loadHumanEmployees();
}

async function loadHumanEmployees() {
  try {
    const res = await $fetch<{ ok: boolean; data: Array<{ id: string; name: string; title: string; avatar: string }> }>(
      "/api/org/human-employees",
      { headers: authHeaders() }
    );
    if (res?.ok) humanEmployees.value = res.data;
  } catch {
    humanEmployees.value = [];
  }
}

function getHumanEmployeeName(id: string | null): string {
  if (!id) return "";
  return humanEmployees.value.find((he) => he.id === id)?.name ?? "";
}

async function confirmBind() {
  if (!bindTargetUser.value || !selectedHumanEmployeeId.value) return;
  await updateUser(bindTargetUser.value.id, { humanEmployeeId: selectedHumanEmployeeId.value });
  bindDialogOpen.value = false;
}

function handleRoleChange(u: UserView, newRole: UserRole, event: Event) {
  const isSelf = currentUser.value?.id === u.id;
  if (isSelf && newRole !== "admin") {
    const confirmed = window.confirm("你正在修改自己的角色，这将导致你失去管理员权限。确定继续？");
    if (!confirmed) {
      (event.target as HTMLSelectElement).value = u.role;
      return;
    }
  }
  updateUser(u.id, { role: newRole });
}

const createDialogOpen = ref(false);
const newUser = ref({ username: "", displayName: "", password: "", role: "user" as UserRole });
const createFormError = ref("");

async function createLocalUser() {
  if (!newUser.value.username || !newUser.value.displayName || !newUser.value.password) {
    createFormError.value = "请填写所有必填字段";
    return;
  }
  createFormError.value = "";
  const res = await execute(() =>
    $fetch<{ ok: boolean }>("/api/users/create", {
      method: "POST",
      body: newUser.value,
      headers: authHeaders(),
    })
  );
  if (res?.ok) {
    toast.showToast("success", "用户已创建");
    createDialogOpen.value = false;
    newUser.value = { username: "", displayName: "", password: "", role: "user" };
    await loadUsers();
  }
}

const editDialogOpen = ref(false);
const editTarget = ref<UserView | null>(null);
const editForm = ref({ username: "", displayName: "", email: "" });

function openEditDialog(u: UserView) {
  editTarget.value = u;
  editForm.value = { username: u.username, displayName: u.displayName, email: u.email };
  editDialogOpen.value = true;
}

async function saveEdit() {
  if (!editTarget.value) return;
  const changes: UpdateUserInput = {};
  if (editForm.value.username !== editTarget.value.username) changes.username = editForm.value.username;
  if (editForm.value.displayName !== editTarget.value.displayName) changes.displayName = editForm.value.displayName;
  if (editForm.value.email !== editTarget.value.email) changes.email = editForm.value.email;
  if (!changes.username && !changes.displayName && !changes.email) {
    editDialogOpen.value = false;
    return;
  }
  await updateUser(editTarget.value.id, changes);
  editDialogOpen.value = false;
}

const resetPwDialogOpen = ref(false);
const resetPwTarget = ref<UserView | null>(null);
const newPassword = ref("");
const resetPwError = ref("");

function openResetPwDialog(u: UserView) {
  resetPwTarget.value = u;
  newPassword.value = "";
  resetPwError.value = "";
  resetPwDialogOpen.value = true;
}

async function confirmResetPassword() {
  if (!resetPwTarget.value) return;
  if (newPassword.value.length < 6) {
    resetPwError.value = "密码至少 6 位";
    return;
  }
  const res = await execute(() =>
    $fetch<{ ok: boolean }>(`/api/users/${resetPwTarget.value!.id}/reset-password`, {
      method: "POST",
      body: { password: newPassword.value },
      headers: authHeaders(),
    })
  );
  if (res?.ok) {
    toast.showToast("success", "密码已重置");
    resetPwDialogOpen.value = false;
  }
}

async function deleteUser(u: UserView) {
  if (u.id === currentUser.value?.id) {
    toast.showToast("error", "不能删除自己");
    return;
  }
  const confirmed = window.confirm(`确定删除用户 ${u.displayName} (${u.username || u.email}) ？此操作不可撤销。`);
  if (!confirmed) return;
  const res = await execute(() =>
    $fetch<{ ok: boolean }>(`/api/users/${u.id}`, {
      method: "DELETE",
      headers: authHeaders(),
    })
  );
  if (res?.ok) {
    users.value = users.value.filter((x) => x.id !== u.id);
    toast.showToast("success", "用户已删除");
  }
}

onMounted(() => {
  loadUsers();
  loadHumanEmployees();
});
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6 p-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold text-foreground">用户管理</h1>
        <p class="text-sm text-muted-foreground">管理平台用户角色与权限</p>
      </div>
      <div class="flex items-center gap-2">
        <button
          class="flex items-center gap-1.5 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="loading"
          @click="syncUsers"
        >
          <RefreshCw class="h-4 w-4" :class="loading ? 'animate-spin' : ''" /> 同步人员
        </button>
        <button
          class="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
          @click="createDialogOpen = true"
        >
          <Plus class="h-4 w-4" /> 新建用户
        </button>
      </div>
    </div>

    <div class="relative">
      <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        v-model="search"
        class="w-full rounded-lg border border-border bg-background py-2 pl-10 pr-4 text-sm outline-none transition focus:border-primary focus:ring-1 focus:ring-primary/20"
        placeholder="搜索姓名、用户名、邮箱、外部 ID、岗位..."
      />
    </div>

    <div class="overflow-x-auto rounded-lg border border-border">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-border bg-muted/50">
            <th class="px-4 py-3 text-left font-medium text-muted-foreground">用户</th>
            <th class="px-4 py-3 text-left font-medium text-muted-foreground">标识</th>
            <th class="px-4 py-3 text-left font-medium text-muted-foreground">角色</th>
            <th class="px-4 py-3 text-left font-medium text-muted-foreground">状态</th>
            <th class="px-4 py-3 text-left font-medium text-muted-foreground">来源</th>
            <th class="px-4 py-3 text-left font-medium text-muted-foreground">同步资料</th>
            <th class="px-4 py-3 text-left font-medium text-muted-foreground">关联员工</th>
            <th class="px-4 py-3 text-left font-medium text-muted-foreground">最后登录</th>
            <th class="px-4 py-3 text-right font-medium text-muted-foreground">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="u in filteredUsers"
            :key="u.id"
            class="border-b border-border last:border-0 hover:bg-muted/30 transition"
          >
            <td class="px-4 py-3">
              <div class="flex items-center gap-2">
                <div class="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                  {{ u.displayName?.charAt(0) ?? "?" }}
                </div>
                <div class="min-w-0">
                  <div class="font-medium">{{ u.displayName }}</div>
                  <div v-if="u.externalName && u.externalName !== u.displayName" class="text-xs text-muted-foreground">
                    外部姓名：{{ u.externalName }}
                  </div>
                </div>
              </div>
            </td>
            <td class="px-4 py-3 text-muted-foreground">
              <div class="space-y-1">
                <div>{{ u.username || "-" }}</div>
                <div class="text-xs">{{ u.email }}</div>
              </div>
            </td>
            <td class="px-4 py-3">
              <select
                :value="u.role"
                class="rounded border border-border bg-background px-2 py-1 text-xs outline-none"
                @change="handleRoleChange(u, ($event.target as HTMLSelectElement).value as UserRole, $event)"
              >
                <option v-for="opt in roleOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </td>
            <td class="px-4 py-3">
              <button
                class="rounded px-2 py-0.5 text-xs font-medium"
                :class="u.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'"
                @click="updateUser(u.id, { isActive: !u.isActive })"
              >
                {{ u.isActive ? "启用" : "禁用" }}
              </button>
            </td>
            <td class="px-4 py-3">
              <div class="space-y-1">
                <span class="rounded px-2 py-0.5 text-xs font-medium" :class="sourceBadgeClass(u)">
                  {{ sourceLabel(u) }}
                </span>
                <div class="text-xs text-muted-foreground">{{ authProviderLabel(u) }}</div>
              </div>
            </td>
            <td class="px-4 py-3">
              <div v-if="u.userSource === 'sync'" class="min-w-[220px] space-y-1 text-xs text-muted-foreground">
                <div>外部 ID：{{ u.externalUserId || '-' }}</div>
                <div>外部用户名：{{ u.externalUserName || '-' }}</div>
                <div>岗位：{{ u.externalPostName || '-' }}</div>
                <div>外部角色：{{ u.externalRoleName || '-' }}</div>
                <div>用户类型：{{ u.externalUserType || '-' }}</div>
                <div>钉钉标识：{{ u.externalDingTalkId || '-' }}</div>
                <div>最近同步：{{ u.lastSyncedAt ? new Date(u.lastSyncedAt).toLocaleString() : '-' }}</div>
              </div>
              <span v-else class="text-xs text-muted-foreground">-</span>
            </td>
            <td class="px-4 py-3">
              <span v-if="u.humanEmployeeId" class="inline-flex items-center gap-1 text-xs text-emerald-700">
                <Link2 class="h-3 w-3" />
                {{ getHumanEmployeeName(u.humanEmployeeId) || "已关联" }}
                <button
                  class="ml-1 text-muted-foreground hover:text-destructive"
                  title="解除关联"
                  @click="updateUser(u.id, { humanEmployeeId: null })"
                >
                  <Unlink class="h-3 w-3" />
                </button>
              </span>
              <button
                v-else
                class="text-xs text-primary hover:underline"
                @click="openBindDialog(u)"
              >
                手动关联
              </button>
            </td>
            <td class="px-4 py-3">
              <span class="text-xs text-muted-foreground">
                {{ u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "未登录" }}
              </span>
            </td>
            <td class="px-4 py-3 text-right">
              <div class="flex items-center justify-end gap-1">
                <button
                  class="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="编辑"
                  @click="openEditDialog(u)"
                >
                  <Pencil class="h-3.5 w-3.5" />
                </button>
                <button
                  v-if="u.authProvider === 'local'"
                  class="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="重置密码"
                  @click="openResetPwDialog(u)"
                >
                  <KeyRound class="h-3.5 w-3.5" />
                </button>
                <button
                  v-if="u.id !== currentUser?.id"
                  class="rounded p-1.5 text-muted-foreground hover:bg-red-50 hover:text-destructive"
                  title="删除"
                  @click="deleteUser(u)"
                >
                  <Trash2 class="h-3.5 w-3.5" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-if="filteredUsers.length === 0" class="py-12 text-center text-sm text-muted-foreground">
        {{ search ? "未找到匹配用户" : "暂无用户" }}
      </div>
    </div>

    <Teleport to="body">
      <div v-if="createDialogOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div class="w-full max-w-md rounded-lg bg-background p-6 shadow-xl">
          <h3 class="text-lg font-semibold">新建本地用户</h3>
          <p class="mt-1 text-sm text-muted-foreground">创建使用用户名密码登录的本地用户</p>
          <div class="mt-4 space-y-3">
            <input v-model="newUser.username" type="text" placeholder="用户名 *"
              class="w-full rounded border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            <input v-model="newUser.displayName" type="text" placeholder="显示名称 *"
              class="w-full rounded border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            <input v-model="newUser.password" type="password" placeholder="密码 *"
              class="w-full rounded border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            <select v-model="newUser.role"
              class="w-full rounded border border-border bg-background px-3 py-2 text-sm outline-none">
              <option v-for="opt in roleOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
            <div v-if="createFormError" class="rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {{ createFormError }}
            </div>
          </div>
          <div class="mt-4 flex justify-end gap-2">
            <button class="rounded px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
              @click="createDialogOpen = false">取消</button>
            <button class="rounded bg-primary px-4 py-2 text-sm text-white hover:bg-primary/90"
              @click="createLocalUser">创建</button>
          </div>
        </div>
      </div>

      <div v-if="editDialogOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div class="w-full max-w-md rounded-lg bg-background p-6 shadow-xl">
          <h3 class="text-lg font-semibold">编辑用户</h3>
          <p class="mt-1 text-sm text-muted-foreground">修改 {{ editTarget?.username || editTarget?.email }} 的信息</p>
          <div class="mt-4 space-y-3">
            <div v-if="editTarget?.userSource === 'sync'" class="rounded bg-amber-50 px-3 py-2 text-xs text-amber-700">
              外部同步用户的资料会在下次同步时更新，建议仅维护平台侧角色、启停和必要展示字段。
            </div>
            <div v-if="editTarget?.authProvider === 'local'">
              <label class="text-xs text-muted-foreground">用户名</label>
              <input v-model="editForm.username" type="text"
                class="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            </div>
            <div>
              <label class="text-xs text-muted-foreground">显示名称</label>
              <input v-model="editForm.displayName" type="text"
                class="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            </div>
            <div>
              <label class="text-xs text-muted-foreground">邮箱</label>
              <input v-model="editForm.email" type="email"
                class="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            </div>
          </div>
          <div class="mt-4 flex justify-end gap-2">
            <button class="rounded px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
              @click="editDialogOpen = false">取消</button>
            <button class="rounded bg-primary px-4 py-2 text-sm text-white hover:bg-primary/90"
              @click="saveEdit">保存</button>
          </div>
        </div>
      </div>

      <div v-if="resetPwDialogOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div class="w-full max-w-md rounded-lg bg-background p-6 shadow-xl">
          <h3 class="text-lg font-semibold">重置密码</h3>
          <p class="mt-1 text-sm text-muted-foreground">为 {{ resetPwTarget?.displayName }} 设置新密码</p>
          <div class="mt-4 space-y-3">
            <input v-model="newPassword" type="password" placeholder="新密码（至少 6 位）"
              class="w-full rounded border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            <div v-if="resetPwError" class="rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {{ resetPwError }}
            </div>
          </div>
          <div class="mt-4 flex justify-end gap-2">
            <button class="rounded px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
              @click="resetPwDialogOpen = false">取消</button>
            <button class="rounded bg-primary px-4 py-2 text-sm text-white hover:bg-primary/90"
              @click="confirmResetPassword">确认重置</button>
          </div>
        </div>
      </div>

      <div v-if="bindDialogOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div class="w-full max-w-md rounded-lg bg-background p-6 shadow-xl">
          <h3 class="text-lg font-semibold">关联真实员工</h3>
          <p class="mt-1 text-sm text-muted-foreground">
            将 {{ bindTargetUser?.displayName }} 关联到真实员工
          </p>
          <div class="relative mt-4">
            <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              v-model="bindSearch"
              class="w-full rounded border border-border bg-background py-2 pl-10 pr-4 text-sm outline-none focus:border-primary"
              placeholder="搜索员工姓名或职位..."
            />
          </div>
          <div class="mt-3 max-h-60 overflow-y-auto rounded border border-border">
            <div
              v-for="he in filteredHumanEmployees"
              :key="he.id"
              class="flex cursor-pointer items-center gap-3 border-b border-border/50 px-3 py-2.5 last:border-0 transition"
              :class="selectedHumanEmployeeId === he.id ? 'bg-primary/10' : 'hover:bg-muted/50'"
              @click="selectedHumanEmployeeId = he.id"
            >
              <div class="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                {{ he.name.charAt(0) }}
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium truncate">{{ he.name }}</div>
                <div class="text-xs text-muted-foreground truncate">{{ he.title || '无职位' }}</div>
              </div>
              <div v-if="selectedHumanEmployeeId === he.id" class="text-primary text-xs font-medium">已选</div>
            </div>
            <div v-if="filteredHumanEmployees.length === 0" class="py-6 text-center text-sm text-muted-foreground">
              {{ bindSearch ? '未找到匹配员工' : '没有可关联的员工' }}
            </div>
          </div>
          <div class="mt-4 flex justify-end gap-2">
            <button
              class="rounded px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
              @click="bindDialogOpen = false"
            >
              取消
            </button>
            <button
              class="rounded bg-primary px-4 py-2 text-sm text-white hover:bg-primary/90 disabled:opacity-50"
              :disabled="!selectedHumanEmployeeId"
              @click="confirmBind"
            >
              确认关联
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
