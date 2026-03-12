import { createError, getRouterParam } from "h3";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getPlatformContext } from "../../../../runtime/platform-context";
import { resolveEmployeeWorkspace } from "../../../../engine/employee-workspace";

const ALLOWED_FILES = new Set(["AGENTS.md", "TOOLS.md", "USER.md", "BOOT.md", "HEARTBEAT.md", "MEMORY.md", "SOUL.md", "IDENTITY.md"]);

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id") ?? "";
  const filename = getRouterParam(event, "filename") ?? "";
  if (!ALLOWED_FILES.has(filename)) {
    throw createError({ statusCode: 400, statusMessage: `File not allowed: ${filename}` });
  }
  const ctx = await getPlatformContext();
  const employee = await ctx.employeeRepo.getById(id);
  if (!employee) {
    throw createError({ statusCode: 404, statusMessage: "Employee not found" });
  }
  const wsDir = resolveEmployeeWorkspace(ctx.gateway.homeDir, employee.code);
  const filePath = join(wsDir, filename);
  const content = existsSync(filePath) ? readFileSync(filePath, "utf-8") : "";
  return { ok: true, data: { filename, content } };
});
