import { createError, getRouterParam } from "h3";
import { getPlatformContext } from "../../runtime/platform-context";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id") ?? "";
  const ctx = await getPlatformContext();
  const employee = await ctx.employeeRepo.getById(id);
  if (!employee) {
    throw createError({
      statusCode: 404,
      statusMessage: `employee not found: ${id}`
    });
  }
  const [skills, schedule, recentRuns] = await Promise.all([
    ctx.employeeSkillRepo.listByEmployeeId(id),
    ctx.employeeScheduleRepo.getByEmployeeId(id),
    ctx.runRepo.listByEmployeeId(id)
  ]);
  return {
    ok: true,
    data: {
      ...employee,
      skills,
      schedule,
      recentRuns,
      health: {
        hasPrompt: Boolean(employee.systemPrompt.trim()),
        hasSkills: skills.length > 0,
        hasSchedule: Boolean(schedule)
      }
    }
  };
});
