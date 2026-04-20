import { createError, getRouterParam, readBody } from "h3";
import { getPlatformContext } from "../../../runtime/platform-context";
import { requireAuth } from "../../../utils/auth-guards";

type CreateJobBody = {
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
  const employeeId = getRouterParam(event, "id") ?? "";
  const body = await readBody<CreateJobBody>(event);

  if (!body?.name?.trim()) {
    throw createError({ statusCode: 400, statusMessage: "name is required" });
  }
  if (!body?.scheduleKind) {
    throw createError({ statusCode: 400, statusMessage: "scheduleKind is required" });
  }

  const ctx = await getPlatformContext();
  const job = await ctx.automationService.createJob({
    employeeId,
    name: body.name.trim(),
    description: body.description,
    scheduleKind: body.scheduleKind,
    cronExpr: body.cronExpr,
    everyMs: body.everyMs,
    taskPrompt: body.taskPrompt,
    enabled: body.enabled,
    actorUserId: user.id
  });
  return { ok: true, data: job };
});
