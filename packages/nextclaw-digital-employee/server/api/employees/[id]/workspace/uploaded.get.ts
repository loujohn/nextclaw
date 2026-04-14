import { createError, getQuery, getRouterParam } from "h3";
import { getPlatformContext } from "../../../../runtime/platform-context";
import { EmployeeUploadFileService } from "../../../../services/employee-upload-file-service";

export default defineEventHandler(async (event) => {
  const employeeId = getRouterParam(event, "id") ?? "";
  const query = getQuery(event);
  const relativePath = typeof query.path === "string" ? query.path : "";
  if (!relativePath.trim()) {
    throw createError({ statusCode: 400, statusMessage: "path is required" });
  }
  try {
    const ctx = await getPlatformContext();
    const uploadService = new EmployeeUploadFileService(ctx.employeeRepo, ctx.chatMessageRepo, ctx.gateway.homeDir);
    const encodedPath = encodeURIComponent(relativePath);
    return {
      ok: true,
      data: await uploadService.readUploadedFile({
        employeeId,
        relativePath,
        rawUrl: `/api/employees/${employeeId}/workspace/uploaded/raw?path=${encodedPath}`,
        downloadUrl: `/api/employees/${employeeId}/workspace/uploaded/raw?download=1&path=${encodedPath}`
      })
    };
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : String(error)
    });
  }
});