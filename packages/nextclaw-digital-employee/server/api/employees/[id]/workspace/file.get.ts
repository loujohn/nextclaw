import { createError, getQuery, getRouterParam } from "h3";
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
    const encodedPath = encodeURIComponent(relativePath);
    return {
      ok: true,
      data: await workspaceService.readFile({
        employeeId,
        relativePath,
        rawUrl: `/api/employees/${employeeId}/workspace/raw?path=${encodedPath}`,
        downloadUrl: `/api/employees/${employeeId}/workspace/raw?download=1&path=${encodedPath}`
      })
    };
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : String(error)
    });
  }
});