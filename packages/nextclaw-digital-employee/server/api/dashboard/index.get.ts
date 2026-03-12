import { buildPlatformGatewayConfig, getPlatformContext } from "../../runtime/platform-context";
import { buildDashboardSummary, buildRunListEntries } from "../../../shared/ui-models";

export default defineEventHandler(async () => {
  const ctx = await getPlatformContext();
  const [employees, runs, installedSkills] = await Promise.all([
    ctx.employeeRepo.list(),
    ctx.runRepo.list(20),
    ctx.skillInstallationRepo.list()
  ]);
  const schedules = await Promise.all(employees.map((employee) => ctx.employeeScheduleRepo.getByEmployeeId(employee.id)));
  const summary = buildDashboardSummary({
    employees: employees.map((employee, index) => ({
      id: employee.id,
      status: employee.status,
      schedule: schedules[index]
        ? {
            scheduleKind: schedules[index]?.scheduleKind ?? "",
            nextRunAt: schedules[index]?.nextRunAt ?? null
          }
        : null
    })),
    runs: runs.map((run) => ({
      id: run.id,
      status: run.status,
      triggerType: run.triggerType
    })),
    installedSkills: installedSkills.map((skill) => ({
      skillName: skill.skillName,
      enabled: skill.enabled
    }))
  });
  const upcoming = employees.map((employee, index) => ({
    ...employee,
    schedule: schedules[index]
  }));
  const gatewayConfig = buildPlatformGatewayConfig();
  const [providerName] = Object.keys(gatewayConfig.providers);
  const providerConfigured = providerName ? Boolean(gatewayConfig.providers[providerName]?.apiKey) : false;
  const alerts = [
    ...(!providerConfigured
      ? [
          {
            id: "model-missing",
            title: "模型能力未配置",
            description: "当前员工仍无法稳定对话或自动运行，请先配置模型提供商。",
            tone: "amber",
            to: "/integrations",
            actionLabel: "去配置"
          }
        ]
      : []),
    ...runs
      .filter((run) => run.status === "failed")
      .slice(0, 3)
      .map((run) => ({
        id: `run-${run.id}`,
        title: "有失败任务待处理",
        description: run.summary || "最近一次运行失败，请进入运行中心查看详情。",
        tone: "rose",
        to: `/runs?runId=${run.id}`,
        actionLabel: "查看详情"
      })),
    ...employees
      .filter((employee) => !schedules[employees.indexOf(employee)])
      .slice(0, 2)
      .map((employee) => ({
        id: `employee-${employee.id}`,
        title: `${employee.name} 还未配置自动任务`,
        description: "建议补充调度策略，让员工可以自动执行例行任务。",
        tone: "slate",
        to: `/employees/${employee.id}`,
        actionLabel: "去设置"
      }))
  ];
  return {
    ok: true,
    data: {
      summary,
      alerts,
      quickActions: [
        { id: "new-employee", label: "创建员工", to: "/employees" },
        { id: "integrations", label: "配置集成", to: "/integrations" },
        { id: "runs", label: "处理失败任务", to: "/runs" }
      ],
      upcomingEmployees: upcoming
        .filter((employee) => employee.schedule)
        .sort((left, right) => String(left.schedule?.nextRunAt ?? "").localeCompare(String(right.schedule?.nextRunAt ?? "")))
        .slice(0, 6),
      recentRuns: buildRunListEntries({
        employees: employees.map((employee) => ({ id: employee.id, name: employee.name })),
        runs: runs.slice(0, 8)
      })
    }
  };
});
