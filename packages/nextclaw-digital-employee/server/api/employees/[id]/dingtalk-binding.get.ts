import { createError, getRouterParam } from "h3";
import { getPlatformContext } from "../../../runtime/platform-context";
import { getEmployeeDingTalkBinding } from "../../../runtime/dingtalk-config";

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
    data: await getEmployeeDingTalkBinding(ctx.integrationConnectionRepo, employee.code)
  };
});
