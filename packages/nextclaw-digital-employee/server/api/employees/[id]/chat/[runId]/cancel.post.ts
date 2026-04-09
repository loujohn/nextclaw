import { createError, getRouterParam } from "h3";
import { getPlatformContext } from "../../../../../runtime/platform-context";

export default defineEventHandler(async (event) => {
  const employeeId = getRouterParam(event, "id") ?? "";
  const runId = getRouterParam(event, "runId") ?? "";
  if (!runId) {
    throw createError({
      statusCode: 400,
      statusMessage: "runId is required"
    });
  }
  const ctx = await getPlatformContext();
  const result = await ctx.employeeRunService.cancelChatRun({
    employeeId,
    runId
  });
  return {
    ok: true,
    data: result
  };
});
