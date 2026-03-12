import { createError, getRouterParam, readBody } from "h3";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getPlatformContext } from "../../../../runtime/platform-context";
import { resolveEmployeeWorkspace } from "../../../../engine/employee-workspace";

const WRITABLE_FILES = new Set(["AGENTS.md", "TOOLS.md", "USER.md", "BOOT.md", "HEARTBEAT.md", "MEMORY.md"]);

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id") ?? "";
  const filename = getRouterParam(event, "filename") ?? "";
  if (!WRITABLE_FILES.has(filename)) {
    throw createError({ statusCode: 400, statusMessage: `File not writable: ${filename}` });
  }
  const body = await readBody<{ content?: string }>(event);
  const content = body?.content ?? "";
  const ctx = await getPlatformContext();
  const employee = await ctx.employeeRepo.getById(id);
  if (!employee) {
    throw createError({ statusCode: 404, statusMessage: "Employee not found" });
  }
  const wsDir = resolveEmployeeWorkspace(ctx.gateway.homeDir, employee.code);
  if (!existsSync(wsDir)) {
    mkdirSync(wsDir, { recursive: true });
  }
  writeFileSync(join(wsDir, filename), content, "utf-8");
  return { ok: true, data: { filename, content } };
});
