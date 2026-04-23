import { createError, getRouterParam } from "h3";
import { getPlatformContext } from "../../../runtime/platform-context";

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

  const [skills, schedule] = await Promise.all([
    ctx.employeeSkillRepo.listByEmployeeId(id),
    ctx.employeeScheduleRepo.getByEmployeeId(id)
  ]);

  return {
    ok: true,
    data: {
      id: employee.id,
      name: employee.name,
      code: employee.code,
      description: employee.description,
      systemPrompt: employee.systemPrompt,
      model: employee.model,
      departmentId: employee.departmentId,
      skillNames: skills.map((skill) => skill.skillName),
      schedule: schedule
        ? {
            scheduleKind: schedule.scheduleKind,
            cronExpr: schedule.cronExpr,
            everyMs: schedule.everyMs
          }
        : null
    }
  };
});