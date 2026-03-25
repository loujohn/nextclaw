import { getQuery } from "h3";
import { getPlatformContext } from "../../runtime/platform-context";

export default defineEventHandler(async (event) => {
  const ctx = await getPlatformContext();
  const query = getQuery(event);
  const listFilter = "departmentId" in query
    ? { departmentId: query.departmentId === "null" ? null : String(query.departmentId) }
    : undefined;
  const employees = await ctx.employeeRepo.list(listFilter);
  const enriched = await Promise.all(
    employees.map(async (employee) => {
      const [skills, schedule, runs, jobs] = await Promise.all([
        ctx.employeeSkillRepo.listByEmployeeId(employee.id),
        ctx.employeeScheduleRepo.getByEmployeeId(employee.id),
        ctx.runRepo.listByEmployeeId(employee.id),
        ctx.employeeScheduleJobRepo.listByEmployeeId(employee.id)
      ]);
      return {
        ...employee,
        skills,
        schedule,
        latestRun: runs[0] ?? null,
        jobsCount: jobs.length,
        enabledJobsCount: jobs.filter((j) => j.enabled).length,
        health: {
          hasSkills: skills.length > 0,
          hasSchedule: Boolean(schedule) || jobs.length > 0,
          lastStatus: runs[0]?.status ?? "idle"
        }
      };
    })
  );
  return { ok: true, data: enriched };
});
