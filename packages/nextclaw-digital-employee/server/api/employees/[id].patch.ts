import { createError, getRouterParam, readBody } from "h3";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { getPlatformContext } from "../../runtime/platform-context";
import { ensureEmployeeWorkspace, resolveEmployeeWorkspace } from "../../engine/employee-workspace";

type UpdateEmployeeBody = {
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

const WRITABLE_FILES = new Set(["AGENTS.md", "TOOLS.md", "USER.md", "BOOT.md", "HEARTBEAT.md", "MEMORY.md"]);

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id") ?? "";
  const body = await readBody<UpdateEmployeeBody>(event);
  const ctx = await getPlatformContext();
  const existing = await ctx.employeeRepo.getById(id);
  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: `employee not found: ${id}`
    });
  }

  if (typeof body?.code === "string" && body.code.trim() && body.code.trim() !== existing.code) {
    throw createError({
      statusCode: 400,
      statusMessage: "code is immutable"
    });
  }

  const name = body?.name?.trim() ?? existing.name;
  if (!name) {
    throw createError({
      statusCode: 400,
      statusMessage: "name is required"
    });
  }

  const updated = await ctx.employeeRepo.updateById(id, {
    name,
    description: body?.description ?? existing.description,
    systemPrompt: body?.systemPrompt ?? existing.systemPrompt,
    model: body?.model ?? existing.model,
    departmentId: "departmentId" in (body ?? {}) ? body!.departmentId : undefined
  });
  if (!updated) {
    throw createError({
      statusCode: 404,
      statusMessage: `employee not found: ${id}`
    });
  }

  ensureEmployeeWorkspace(ctx.gateway.homeDir, {
    code: updated.code,
    name: updated.name,
    description: updated.description,
    systemPrompt: updated.systemPrompt
  }, ctx.gateway.workspaceDir);

  const wsFiles = body?.workspaceFiles ?? {};
  const wsDir = resolveEmployeeWorkspace(ctx.gateway.homeDir, updated.code);
  for (const [filename, content] of Object.entries(wsFiles)) {
    if (WRITABLE_FILES.has(filename) && typeof content === "string") {
      writeFileSync(join(wsDir, filename), content, "utf-8");
    }
  }

  let skills = await ctx.employeeSkillRepo.listByEmployeeId(id);
  if (Array.isArray(body?.skillNames)) {
    skills = await ctx.employeeSkillRepo.replaceForEmployee(id, body.skillNames);
  }

  let schedule = await ctx.employeeScheduleRepo.getByEmployeeId(id);
  if (body?.scheduleKind) {
    schedule = await ctx.automationService.upsertSchedule({
      employeeId: id,
      scheduleKind: body.scheduleKind,
      cronExpr: body.cronExpr,
      everyMs: body.everyMs
    });
  }

  return {
    ok: true,
    data: {
      ...updated,
      skills,
      schedule
    }
  };
});
