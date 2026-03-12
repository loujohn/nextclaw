import { createError, readBody } from "h3";
import { getPlatformContext } from "../../runtime/platform-context";

type CreateEmployeeBody = {
  name?: string;
  code?: string;
  description?: string;
  systemPrompt?: string;
  skillNames?: string[];
  scheduleKind?: "cron" | "every" | "heartbeat";
  cronExpr?: string;
  everyMs?: number;
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
  const employee = await ctx.employeeRepo.create({
    name,
    code,
    description: body?.description ?? "",
    systemPrompt: body?.systemPrompt ?? ""
  });
  const skills = await ctx.employeeSkillRepo.replaceForEmployee(employee.id, body?.skillNames ?? []);
  const hasSchedule = body?.scheduleKind && (body.scheduleKind === "cron" ? body.cronExpr : body.everyMs);
  const schedule = hasSchedule
    ? await ctx.automationService.upsertSchedule({
        employeeId: employee.id,
        scheduleKind: body.scheduleKind as "cron" | "every" | "heartbeat",
        cronExpr: body?.cronExpr,
        everyMs: body?.everyMs
      })
    : null;
  return {
    ok: true,
    data: {
      ...employee,
      skills,
      schedule
    }
  };
});
