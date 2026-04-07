import { getQuery } from "h3";
import { getPlatformContext } from "../../runtime/platform-context";

export default defineEventHandler(async (event) => {
  const ctx = await getPlatformContext();
  const query = getQuery(event);
  const listFilter = "departmentId" in query
    ? { departmentId: query.departmentId === "null" ? null : String(query.departmentId) }
    : undefined;
  const allEmployees = await ctx.employeeRepo.list(listFilter);

  // TODO: enable pagination when employee count exceeds threshold
  const rawPage = typeof query.page === "string" ? Number.parseInt(query.page, 10) : undefined;
  const rawPageSize = typeof query.pageSize === "string" ? Number.parseInt(query.pageSize, 10) : undefined;
  const paginated = rawPage && rawPageSize && rawPageSize > 0 && rawPage > 0;
  const page = paginated ? rawPage : 1;
  const pageSize = paginated ? Math.min(rawPageSize, 100) : allEmployees.length;
  const total = allEmployees.length;
  const employees = paginated
    ? allEmployees.slice((page - 1) * pageSize, page * pageSize)
    : allEmployees;

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
  return { ok: true, data: enriched, ...(paginated ? { total, page, pageSize } : {}) };
});
