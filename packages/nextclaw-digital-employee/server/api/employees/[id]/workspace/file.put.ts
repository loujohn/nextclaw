import { createError, getRouterParam, readBody } from "h3";
import { getPlatformContext } from "../../../../runtime/platform-context";
import { EmployeeWorkspaceFileService } from "../../../../services/employee-workspace-file-service";

export default defineEventHandler(async (event) => {
  const employeeId = getRouterParam(event, "id") ?? "";
  const body = await readBody<{ path?: string; content?: string }>(event);
  const relativePath = body?.path ?? "";
  if (!relativePath.trim()) {
    throw createError({ statusCode: 400, statusMessage: "path is required" });
  }
  try {
    const ctx = await getPlatformContext();
    const workspaceService = new EmployeeWorkspaceFileService(ctx.employeeRepo, ctx.chatMessageRepo, ctx.gateway.homeDir);
    await workspaceService.saveTextFile({
      employeeId,
      relativePath,
      content: body?.content ?? ""
    });
    return {
      ok: true,
      data: {
        path: relativePath
      }
    };
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : String(error)
    });
  }
});