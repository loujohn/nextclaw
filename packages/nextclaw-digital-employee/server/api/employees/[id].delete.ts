import { createError, getRouterParam } from "h3";
import { getPlatformContext } from "../../runtime/platform-context";
import { removeEmployeeWorkspace } from "../../engine/employee-workspace";

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

  await ctx.automationService.clearSchedule(id);
  await ctx.runRepo.deleteByEmployeeId(id);
  const removed = await ctx.employeeRepo.deleteById(id);
  if (!removed) {
    throw createError({
      statusCode: 404,
      statusMessage: `employee not found: ${id}`
    });
  }

  removeEmployeeWorkspace(ctx.gateway.homeDir, employee.code);

  return {
    ok: true,
    data: {
      id,
      code: employee.code
    }
  };
});
