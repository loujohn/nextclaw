import { createError, getRouterParam } from "h3";
import { getPlatformContext } from "../../../../runtime/platform-context";

export default defineEventHandler(async (event) => {
  const jobId = getRouterParam(event, "jobId") ?? "";
  if (!jobId) {
    throw createError({ statusCode: 400, statusMessage: "jobId is required" });
  }
  const ctx = await getPlatformContext();
  await ctx.automationService.deleteJob(jobId);
  return { ok: true };
});
