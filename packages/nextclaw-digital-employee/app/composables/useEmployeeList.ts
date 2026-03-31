type EmployeeResponse = {
  id: string;
  name: string;
  code: string;
  description: string;
  systemPrompt: string;
  model: string;
  status: string;
  departmentId: string | null;
  skills: Array<{ skillName: string }>;
  schedule?: { scheduleKind: string; nextRunAt?: string | null } | null;
  latestRun?: { status: string; summary: string; finishedAt: string | null } | null;
  jobsCount: number;
  enabledJobsCount: number;
  healthStatus?: string;
  healthDetail?: { status: string; reasons: string[] };
};

type EmployeeListPayload = { ok: boolean; data: EmployeeResponse[] };

export function useEmployeeList(
  employeePayload: Ref<EmployeeListPayload | null | undefined>
) {
  const employees = computed(() => employeePayload.value?.data ?? []);
  return { employees };
}

export type { EmployeeResponse, EmployeeListPayload };
