import { createError, getRouterParam, readBody } from "h3";
import { getPlatformContext } from "../../../../runtime/platform-context";
import { requireAuth } from "../../../../utils/auth-guards";

type UpdateJobBody = {
  name?: string;
  description?: string;
  scheduleKind?: "cron" | "every" | "heartbeat";
  cronExpr?: string | null;
  everyMs?: number | null;
  taskPrompt?: string;
  enabled?: boolean;
};

export default defineEventHandler(async (event) => {
  const user = requireAuth(event);
  const jobId = getRouterParam(event, "jobId") ?? "";
  if (!jobId) {
    throw createError({ statusCode: 400, statusMessage: "jobId is required" });
  }
  const body = await readBody<UpdateJobBody>(event);
  const ctx = await getPlatformContext();
  const job = await ctx.automationService.updateJob(jobId, {
    ...(body ?? {}),
    actorUserId: user.id,
  });
  return { ok: true, data: job };
});
