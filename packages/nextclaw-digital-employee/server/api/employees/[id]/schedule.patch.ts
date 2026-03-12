import { createError, getRouterParam, readBody } from "h3";
import { getPlatformContext } from "../../../runtime/platform-context";

type ScheduleBody = {
  scheduleKind?: "cron" | "every" | "heartbeat";
  cronExpr?: string;
  everyMs?: number;
};

export default defineEventHandler(async (event) => {
  const employeeId = getRouterParam(event, "id") ?? "";
  const body = await readBody<ScheduleBody>(event);
  if (!body?.scheduleKind) {
    throw createError({
      statusCode: 400,
      statusMessage: "scheduleKind is required"
    });
  }
  const ctx = await getPlatformContext();
  const schedule = await ctx.automationService.upsertSchedule({
    employeeId,
    scheduleKind: body.scheduleKind,
    cronExpr: body.cronExpr,
    everyMs: body.everyMs
  });
  return { ok: true, data: schedule };
});
