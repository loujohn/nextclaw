import { createError, getRouterParam, readBody } from "h3";
import { getPlatformContext } from "../../../runtime/platform-context";
import {
  applyEmployeeDingTalkBindingUpdate,
  type EmployeeDingTalkBindingUpdate
} from "../../../runtime/dingtalk-config";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id") ?? "";
  const body = await readBody<EmployeeDingTalkBindingUpdate>(event);
  const ctx = await getPlatformContext();
  const employee = await ctx.employeeRepo.getById(id);
  if (!employee) {
    throw createError({
      statusCode: 404,
      statusMessage: `employee not found: ${id}`
    });
  }

  try {
    const data = await applyEmployeeDingTalkBindingUpdate(ctx.integrationConnectionRepo, employee.code, {
      patch: body ?? {},
      reload: () => ctx.channelRuntime.reload()
    });
    return {
      ok: true,
      data
    };
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : String(error)
    });
  }
});
