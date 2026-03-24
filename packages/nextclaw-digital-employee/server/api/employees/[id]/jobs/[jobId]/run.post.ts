import { createError, getRouterParam } from "h3";
import { getPlatformContext } from "../../../../../runtime/platform-context";

export default defineEventHandler(async (event) => {
  const jobId = getRouterParam(event, "jobId") ?? "";
  if (!jobId) {
    throw createError({ statusCode: 400, statusMessage: "jobId is required" });
  }
  const ctx = await getPlatformContext();
  const triggered = await ctx.automationService.runJobNow(jobId);
  if (!triggered) {
    throw createError({ statusCode: 400, statusMessage: "Failed to trigger job: job not found or not active" });
  }
  return { ok: true };
});
