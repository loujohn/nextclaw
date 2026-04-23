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

  return {
    ok: true,
    data: {
      id: employee.id,
      name: employee.name,
      code: employee.code
    }
  };
});