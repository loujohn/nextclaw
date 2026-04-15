import { createError, getRouterParam, readBody } from "h3";
import { getPlatformContext } from "../../../runtime/platform-context";
import { EmployeeUploadFileService } from "../../../services/employee-upload-file-service";

type DeleteUploadBody = {
  relativePath?: string;
};

export default defineEventHandler(async (event) => {
  const employeeId = getRouterParam(event, "id") ?? "";
  const body = await readBody<DeleteUploadBody>(event);
  const relativePath = body?.relativePath?.trim() ?? "";
  if (!relativePath) {
    throw createError({
      statusCode: 400,
      statusMessage: "relativePath is required"
    });
  }
  try {
    const ctx = await getPlatformContext();
    const uploadService = new EmployeeUploadFileService(ctx.employeeRepo, ctx.chatMessageRepo, ctx.gateway.homeDir);
    return {
      ok: true,
      data: await uploadService.deleteUploadedFile({
        employeeId,
        relativePath
      })
    };
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : String(error)
    });
  }
});