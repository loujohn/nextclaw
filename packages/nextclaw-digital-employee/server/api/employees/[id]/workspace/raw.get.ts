import { createError, getQuery, getRouterParam } from "h3";
import { readFileSync } from "node:fs";
import { getPlatformContext } from "../../../../runtime/platform-context";
import { EmployeeWorkspaceFileService } from "../../../../services/employee-workspace-file-service";

export default defineEventHandler(async (event) => {
  const employeeId = getRouterParam(event, "id") ?? "";
  const query = getQuery(event);
  const relativePath = typeof query.path === "string" ? query.path : "";
  if (!relativePath.trim()) {
    throw createError({ statusCode: 400, statusMessage: "path is required" });
  }
  try {
    const ctx = await getPlatformContext();
    const workspaceService = new EmployeeWorkspaceFileService(ctx.employeeRepo, ctx.chatMessageRepo, ctx.gateway.homeDir);
    const file = await workspaceService.readRawFile({
      employeeId,
      relativePath
    });
    const download = query.download === "1" || query.download === "true";
    return new Response(readFileSync(file.absolutePath), {
      headers: {
        "Content-Type": file.mimeType,
        ...(download ? { "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}` } : {})
      }
    });
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : String(error)
    });
  }
});