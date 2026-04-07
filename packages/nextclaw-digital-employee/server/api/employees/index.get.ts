import { getQuery } from "h3";
import { getPlatformContext } from "../../runtime/platform-context";

export default defineEventHandler(async (event) => {
  const ctx = await getPlatformContext();
  const query = getQuery(event);
  const listFilter = "departmentId" in query
    ? { departmentId: query.departmentId === "null" ? null : String(query.departmentId) }
    : undefined;
  const employees = await ctx.employeeRepo.list(listFilter);
  const ids = employees.map((e) => e.id);

  const [skillsMap, scheduleMap, latestRunMap, jobsMap, recentFailureSet] = await Promise.all([
    ctx.employeeSkillRepo.listByEmployeeIds(ids),
    ctx.employeeScheduleRepo.listByEmployeeIds(ids),
    ctx.runRepo.getLatestRunSummaryByEmployeeIds(ids),
    ctx.employeeScheduleJobRepo.listByEmployeeIds(ids),
    ctx.runRepo.hasRecentFailureByEmployeeIds(ids),
  ]);

  const healthMap = ctx.healthService.computeHealthBatchFromPrefetched(employees, recentFailureSet);

  const enriched = employees.map((employee) => {
    const jobs = jobsMap.get(employee.id) ?? [];
    const latestRun = latestRunMap.get(employee.id);
    const { systemPrompt: _systemPrompt, ...employeeSlim } = employee;
    return {
      ...employeeSlim,
      skills: (skillsMap.get(employee.id) ?? []).map(s => ({ skillName: s.skillName })),
      schedule: scheduleMap.get(employee.id) ?? null,
      latestRun: latestRun ? { status: latestRun.status, finishedAt: latestRun.finishedAt } : null,
      jobsCount: jobs.length,
      enabledJobsCount: jobs.filter((j) => j.enabled).length,
      healthStatus: healthMap.get(employee.id)?.status ?? "healthy",
      healthDetail: healthMap.get(employee.id) ?? { status: "healthy", reasons: [] },
    };
  });
  return { ok: true, data: enriched };
});
