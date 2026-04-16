import { createError, getRouterParam } from "h3";
import { getPlatformContext } from "../../../../runtime/platform-context";
import { EmployeeWorkspaceFileService } from "../../../../services/employee-workspace-file-service";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id") ?? "";
  try {
    const ctx = await getPlatformContext();
    const workspaceService = new EmployeeWorkspaceFileService(ctx.employeeRepo, ctx.chatMessageRepo, ctx.gateway.homeDir);
    return {
      ok: true,
      data: {
        tree: await workspaceService.listWorkspace({ employeeId: id })
      }
    };
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : String(error)
    });
  }
});
