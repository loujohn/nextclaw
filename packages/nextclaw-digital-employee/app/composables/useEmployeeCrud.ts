import type { EmployeeResponse } from "~/composables/useEmployeeList";

type EmployeeDetailPayload = {
  ok: boolean;
  data: {
    id: string;
    name: string;
    code: string;
    description: string;
    systemPrompt: string;
    model: string;
    skills: Array<{ skillName: string }>;
    schedule: {
      scheduleKind: "cron" | "every" | "heartbeat";
      cronExpr?: string | null;
      everyMs?: number | null;
    } | null;
  };
};

function createEmployeeCode(name: string): string {
  const n = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return n || `employee-${Date.now().toString().slice(-6)}`;
}

async function loadWorkspaceFile(employeeId: string, filename: string): Promise<string> {
  try {
    const result = await $fetch<{ ok: boolean; data: { content: string } }>(
      `/api/employees/${employeeId}/workspace/${encodeURIComponent(filename)}`
    );
    return result.data.content ?? "";
  } catch {
    return "";
  }
}

function buildCreatePayload(form: ReturnType<typeof createFormState>) {
  const code = form.code.trim() || createEmployeeCode(form.name);
  const workspaceFiles: Record<string, string> = {};
  if (form.heartbeatContent.trim()) workspaceFiles["HEARTBEAT.md"] = form.heartbeatContent.trim();
  if (form.userContent.trim()) workspaceFiles["USER.md"] = form.userContent.trim();
  if (form.bootContent.trim()) workspaceFiles["BOOT.md"] = form.bootContent.trim();
  if (form.agentsContent.trim()) workspaceFiles["AGENTS.md"] = form.agentsContent.trim();

  return {
    name: form.name, code,
    description: form.description,
    systemPrompt: form.systemPrompt,
    model: form.model || undefined,
    departmentId: form.departmentId || null,
    skillNames: form.skillNames,
    scheduleKind: form.scheduleKind,
    cronExpr: form.cronExpr,
    everyMs: form.everyMs,
    workspaceFiles: Object.keys(workspaceFiles).length ? workspaceFiles : undefined
  };
}

function buildEditPayload(editForm: ReturnType<typeof createEditFormState>) {
  return {
    name: editForm.name,
    description: editForm.description,
    systemPrompt: editForm.systemPrompt,
    model: editForm.model,
    departmentId: editForm.departmentId,
    skillNames: editForm.skillNames,
    scheduleKind: editForm.scheduleKind,
    cronExpr: editForm.cronExpr,
    everyMs: editForm.everyMs,
    workspaceFiles: {
      "HEARTBEAT.md": editForm.heartbeatContent,
      "USER.md": editForm.userContent,
      "BOOT.md": editForm.bootContent,
      "AGENTS.md": editForm.agentsContent
    }
  };
}

function createFormState() {
  return reactive({
    name: "", code: "", description: "", systemPrompt: "", model: "",
    departmentId: null as string | null,
    heartbeatContent: "", userContent: "", bootContent: "", agentsContent: "",
    skillNames: [] as string[],
    scheduleKind: "none" as "cron" | "every" | "heartbeat" | "none",
    cronExpr: "0 18 * * *",
    everyMs: 1800000
  });
}

function createEditFormState() {
  return reactive({
    id: "", name: "", code: "", description: "", systemPrompt: "", model: "",
    departmentId: null as string | null,
    heartbeatContent: "", userContent: "", bootContent: "", agentsContent: "",
    skillNames: [] as string[],
    scheduleKind: "none" as "cron" | "every" | "heartbeat" | "none",
    cronExpr: "0 18 * * *",
    everyMs: 1800000
  });
}

interface CrudOptions {
  refresh: () => Promise<void>;
  showToast: (type: "success" | "error", message: string) => void;
  selectedDeptId: Ref<string | null>;
  buildWorkbenchRoute: (id: string) => { path: string; query: Record<string, string> };
}

export function useEmployeeCrud(options: CrudOptions) {
  const showCreator = ref(false);
  const showEditor = ref(false);
  const editorLoading = ref(false);
  const form = createFormState();
  const creating = ref(false);
  const createError = ref("");
  const editSaving = ref(false);
  const editError = ref("");
  const deleteConfirmOpen = ref(false);
  const deleting = ref(false);
  const deleteError = ref("");
  const deletingEmployee = ref<EmployeeResponse | null>(null);
  const editForm = createEditFormState();

  function resetForm() {
    Object.assign(form, {
      name: "", code: "", description: "", systemPrompt: "", model: "",
      departmentId: options.selectedDeptId.value,
      heartbeatContent: "", userContent: "", bootContent: "", agentsContent: "",
      skillNames: [], scheduleKind: "none", cronExpr: "0 18 * * *", everyMs: 1800000
    });
  }

  async function refreshEmployeeViews() {
    await options.refresh();
    await Promise.all([
      refreshNuxtData("store-employees"),
      refreshNuxtData("/api/dashboard"),
      refreshNuxtData("/api/dashboard/stats")
    ]);
  }

  async function createEmployee() {
    creating.value = true;
    createError.value = "";
    try {
      const body = buildCreatePayload(form);
      const created = await $fetch<{ ok: boolean; data: { id: string } }>("/api/employees", {
        method: "POST", body
      });
      resetForm();
      showCreator.value = false;
      await refreshEmployeeViews();
      await navigateTo(options.buildWorkbenchRoute(created.data.id));
    } catch (error) {
      createError.value = error instanceof Error ? error.message : String(error);
    } finally {
      creating.value = false;
    }
  }

  async function openEditor(employee: EmployeeResponse) {
    showEditor.value = true;
    editorLoading.value = true;
    editError.value = "";
    try {
      const detail = await $fetch<EmployeeDetailPayload>(`/api/employees/${employee.id}`);
      const files = await Promise.all(
        (["HEARTBEAT.md", "USER.md", "BOOT.md", "AGENTS.md"] as const).map((f) => loadWorkspaceFile(employee.id, f))
      );
      Object.assign(editForm, {
        id: detail.data.id, name: detail.data.name, code: detail.data.code,
        description: detail.data.description, systemPrompt: detail.data.systemPrompt,
        model: detail.data.model || "", departmentId: employee.departmentId ?? null,
        heartbeatContent: files[0], userContent: files[1], bootContent: files[2], agentsContent: files[3],
        skillNames: detail.data.skills.map((s) => s.skillName),
        scheduleKind: detail.data.schedule?.scheduleKind ?? "cron",
        cronExpr: detail.data.schedule?.cronExpr ?? "0 18 * * *",
        everyMs: detail.data.schedule?.everyMs ?? 1800000
      });
    } catch (error) {
      editError.value = error instanceof Error ? error.message : String(error);
    } finally {
      editorLoading.value = false;
    }
  }

  async function saveEmployeeEdit() {
    if (!editForm.id) return;
    editSaving.value = true;
    editError.value = "";
    try {
      await $fetch(`/api/employees/${editForm.id}`, { method: "PATCH", body: buildEditPayload(editForm) });
      await refreshEmployeeViews();
      showEditor.value = false;
      options.showToast("success", "员工信息已保存");
    } catch (error) {
      editError.value = error instanceof Error ? error.message : String(error);
      options.showToast("error", `保存失败：${editError.value}`);
    } finally {
      editSaving.value = false;
    }
  }

  function openDeleteConfirm(employee: EmployeeResponse) {
    deletingEmployee.value = employee;
    deleteConfirmOpen.value = true;
    deleteError.value = "";
  }

  async function deleteEmployee() {
    if (!deletingEmployee.value) return;
    deleting.value = true;
    deleteError.value = "";
    const empName = deletingEmployee.value.name;
    try {
      const deletingId = deletingEmployee.value.id;
      await $fetch(`/api/employees/${deletingId}`, { method: "DELETE" });
      await refreshEmployeeViews();
      if (showEditor.value && editForm.id === deletingId) {
        showEditor.value = false;
      }
      deleteConfirmOpen.value = false;
      deletingEmployee.value = null;
      options.showToast("success", `已删除员工「${empName}」`);
    } catch (error) {
      deleteError.value = error instanceof Error ? error.message : String(error);
      options.showToast("error", `删除失败：${deleteError.value}`);
    } finally {
      deleting.value = false;
    }
  }

  function openCreator() {
    resetForm();
    showCreator.value = true;
  }

  return {
    showCreator, showEditor, editorLoading,
    form, creating, createError,
    editForm, editSaving, editError,
    deleteConfirmOpen, deleting, deleteError, deletingEmployee,
    resetForm, createEmployee, openEditor, saveEmployeeEdit,
    openDeleteConfirm, deleteEmployee, openCreator
  };
}
