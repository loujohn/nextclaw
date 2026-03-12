import { getPlatformContext } from "../../runtime/platform-context";

export default defineEventHandler(async () => {
  const ctx = await getPlatformContext();
  const employees = await ctx.employeeRepo.list();
  const enriched = await Promise.all(
    employees.map(async (employee) => {
      const [skills, schedule, runs] = await Promise.all([
        ctx.employeeSkillRepo.listByEmployeeId(employee.id),
        ctx.employeeScheduleRepo.getByEmployeeId(employee.id),
        ctx.runRepo.listByEmployeeId(employee.id)
      ]);
      return {
        ...employee,
        skills,
        schedule,
        latestRun: runs[0] ?? null,
        health: {
          hasSkills: skills.length > 0,
          hasSchedule: Boolean(schedule),
          lastStatus: runs[0]?.status ?? "idle"
        }
      };
    })
  );
  return { ok: true, data: enriched };
});
