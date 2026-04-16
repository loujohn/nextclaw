import type { ComputedRef, Ref } from "vue";

export type AutomationSummaryView = {
  totalJobs: number;
  enabledJobs: number;
  nextScheduledRunAt: string | null;
  hasFailedRecently: boolean;
  countLabel: string;
  statusLabel: string;
  tone: "teal" | "amber" | "slate" | "danger";
  healthOk: boolean;
};

export type EmployeeDetailPayload = {
  ok: boolean;
  data: {
    id: string;
    name: string;
    code: string;
    description: string;
    systemPrompt: string;
    departmentId: string | null;
    skills: Array<{ id: string; skillName: string; version: string | null; latestVersion: string | null; hasUpdate: boolean }>;
    schedule: {
      id: string;
      scheduleKind: string;
      cronExpr?: string | null;
      everyMs?: number | null;
      nextRunAt?: string | null;
    } | null;
    automationSummary: AutomationSummaryView;
    health: {
      hasPrompt: boolean;
      hasSkills: boolean;
      hasSchedule: boolean;
      jobsCount: number;
      enabledJobsCount: number;
    };
    recentRuns: Array<{ id: string; status: string; summary: string; startedAt: string; finishedAt?: string | null }>;
  };
};

export function useEmployeeDetail(employeeId: Ref<string> | ComputedRef<string>) {
  return useLazyFetch<EmployeeDetailPayload>(() => `/api/employees/${employeeId.value}`);
}
