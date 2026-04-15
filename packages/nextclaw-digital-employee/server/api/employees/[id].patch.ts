import { createError, getRouterParam, readBody } from "h3";
import { getPlatformContext } from "../../runtime/platform-context";

type UpdateEmployeeBody = {
  name?: string;
  code?: string;
  description?: string;
  systemPrompt?: string;
  model?: string;
  departmentId?: string | null;
  skillNames?: string[];
  scheduleKind?: string;
  cronExpr?: string;
  everyMs?: number;
  workspaceFiles?: Record<string, string>;
  webhookEnabled?: boolean;
  webhookSecret?: string | null;
};

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id") ?? "";
  const body = await readBody<UpdateEmployeeBody>(event);

  if (typeof body?.code === "string" && body.code.trim()) {
    throw createError({ statusCode: 400, statusMessage: "code is immutable" });
  }

  const ctx = await getPlatformContext();
  try {
    const result = await ctx.lifecycleService.updateEmployee(id, {
      name: body?.name,
      description: body?.description,
      systemPrompt: body?.systemPrompt,
      model: body?.model,
      departmentId: "departmentId" in (body ?? {}) ? body!.departmentId : undefined,
      skillNames: body?.skillNames,
      schedule: body?.scheduleKind
        ? { scheduleKind: body.scheduleKind, cronExpr: body.cronExpr, everyMs: body.everyMs }
        : undefined,
      workspaceFiles: body?.workspaceFiles,
      webhookEnabled: body?.webhookEnabled,
      webhookSecret: body?.webhookSecret,
    });
    return { ok: true, data: { ...result.employee, skills: result.skills, jobs: result.jobs } };
  } catch (err: unknown) {
    const e = err as { statusCode?: number; message?: string };
    throw createError({
      statusCode: e?.statusCode ?? 500,
      statusMessage: e?.message ?? "更新员工失败",
      cause: err,
    });
  }
});
