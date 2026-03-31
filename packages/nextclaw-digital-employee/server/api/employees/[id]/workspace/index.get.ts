import { createError, getRouterParam } from "h3";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { getPlatformContext } from "../../../../runtime/platform-context";
import { resolveEmployeeWorkspace } from "../../../../engine/employee-workspace";

const ALL_FILES = ["AGENTS.md", "TOOLS.md", "USER.md", "BOOT.md", "HEARTBEAT.md", "MEMORY.md", "SOUL.md", "IDENTITY.md"] as const;
const WRITABLE_FILES = new Set(["AGENTS.md", "TOOLS.md", "USER.md", "BOOT.md", "HEARTBEAT.md", "MEMORY.md"]);

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id") ?? "";
  const ctx = await getPlatformContext();
  const employee = await ctx.employeeRepo.getById(id);
  if (!employee) {
    throw createError({ statusCode: 404, statusMessage: "Employee not found" });
  }
  const wsDir = resolveEmployeeWorkspace(ctx.gateway.homeDir, employee.code);
  const files = ALL_FILES.map((filename) => {
    const filePath = join(wsDir, filename);
    const exists = existsSync(filePath);
    const sizeBytes = exists ? statSync(filePath).size : 0;
    return {
      filename,
      exists,
      sizeBytes,
      writable: WRITABLE_FILES.has(filename),
    };
  });
  return { ok: true, data: { files } };
});
