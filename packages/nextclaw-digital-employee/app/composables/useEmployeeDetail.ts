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
    departmentId: string | null;
    skills: Array<{
      id: string;
      skillName: string;
      version: string | null;
      latestVersion: string | null;
      hasUpdate: boolean;
      installMissing: boolean;
    }>;
    automationSummary: AutomationSummaryView;
    health: {
      hasPrompt: boolean;
      hasSkills: boolean;
    };
    recentRuns: Array<{ id: string; status: string }>;
  };
};

export function useEmployeeDetail(employeeId: Ref<string> | ComputedRef<string>) {
  return useLazyFetch<EmployeeDetailPayload>(() => `/api/employees/${employeeId.value}`);
}
