import type { ComputedRef, Ref } from "vue";

export type EmployeeDetailPayload = {
  ok: boolean;
  data: {
    id: string;
    name: string;
    code: string;
    description: string;
    systemPrompt: string;
    skills: Array<{ id: string; skillName: string }>;
    schedule: {
      id: string;
      scheduleKind: string;
      cronExpr?: string | null;
      everyMs?: number | null;
      nextRunAt?: string | null;
    } | null;
    health: {
      hasPrompt: boolean;
      hasSkills: boolean;
      hasSchedule: boolean;
    };
    recentRuns: Array<{ id: string; status: string; summary: string; startedAt: string; finishedAt?: string | null }>;
  };
};

export function useEmployeeDetail(employeeId: Ref<string> | ComputedRef<string>) {
  return useFetch<EmployeeDetailPayload>(() => `/api/employees/${employeeId.value}`);
}
