import { createError, readBody } from "h3";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { getPlatformContext } from "../../runtime/platform-context";
import { ensureEmployeeWorkspace, syncEmployeeSkills, resolveEmployeeWorkspace } from "../../engine/employee-workspace";

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
  let employee;
  try {
    employee = await ctx.employeeRepo.create({
      name,
      code,
      description: body?.description ?? "",
      systemPrompt: body?.systemPrompt ?? "",
      model: body?.model ?? "",
      departmentId: body?.departmentId ?? null
    });
  } catch (err: any) {
    throw createError({
      statusCode: err?.statusCode ?? 500,
      statusMessage: err?.message ?? "创建员工失败"
    });
  }

  ensureEmployeeWorkspace(ctx.gateway.homeDir, {
    code: employee.code,
    name: employee.name,
    description: employee.description,
    systemPrompt: employee.systemPrompt
  }, ctx.gateway.workspaceDir);

  const WRITABLE_FILES = new Set(["AGENTS.md", "TOOLS.md", "USER.md", "BOOT.md", "HEARTBEAT.md", "MEMORY.md"]);
  const wsFiles = body?.workspaceFiles ?? {};
  const wsDir = resolveEmployeeWorkspace(ctx.gateway.homeDir, employee.code);
  for (const [filename, content] of Object.entries(wsFiles)) {
    if (WRITABLE_FILES.has(filename) && typeof content === "string" && content.trim()) {
      writeFileSync(join(wsDir, filename), content, "utf-8");
    }
  }

  const skillNames = body?.skillNames ?? [];
  const skills = await ctx.employeeSkillRepo.replaceForEmployee(employee.id, skillNames);
  if (skillNames.length > 0) {
    syncEmployeeSkills(ctx.gateway.homeDir, employee.code, skillNames, ctx.gateway.workspaceDir);
  }

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
