import { createError, readBody } from "h3";
import { getPlatformContext } from "../../runtime/platform-context";

type CreateEmployeeBody = {
  name?: string;
  code?: string;
  description?: string;
  systemPrompt?: string;
  model?: string;
  departmentId?: string | null;
  skillNames?: string[];
  scheduleKind?: "cron" | "every" | "heartbeat";
  cronExpr?: string;
  everyMs?: number;
  workspaceFiles?: Record<string, string>;
};

export default defineEventHandler(async (event) => {
  const body = await readBody<CreateEmployeeBody>(event);
  const name = body?.name?.trim() ?? "";
  const code = body?.code?.trim() ?? "";
  if (!name || !code) {
    throw createError({
      statusCode: 400,
      statusMessage: "name and code are required"
    });
  }

  const ctx = await getPlatformContext();
  try {
    const validScheduleKinds = new Set(["cron", "every", "heartbeat"]);
    const hasSchedule = body?.scheduleKind && validScheduleKinds.has(body.scheduleKind) && (body.scheduleKind === "cron" ? body.cronExpr : body.everyMs);
    const result = await ctx.lifecycleService.createEmployee({
      employee: {
        name,
        code,
        description: body?.description ?? "",
        systemPrompt: body?.systemPrompt ?? "",
        model: body?.model ?? "",
        departmentId: body?.departmentId ?? null,
      },
      skillNames: body?.skillNames,
      schedule: hasSchedule
        ? {
            scheduleKind: body.scheduleKind as "cron" | "every" | "heartbeat",
            cronExpr: body.cronExpr,
            everyMs: body.everyMs,
          }
        : undefined,
      workspaceFiles: body?.workspaceFiles,
    });
    return { ok: true, data: result };
  } catch (err: unknown) {
    const e = err as { statusCode?: number; message?: string };
    throw createError({
      statusCode: e?.statusCode ?? 500,
      statusMessage: e?.message ?? "创建员工失败"
    });
  }
});
