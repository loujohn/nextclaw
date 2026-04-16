import { createError, getRouterParam, readMultipartFormData } from "h3";
import { getPlatformContext } from "../../../runtime/platform-context";
import { EmployeeUploadFileService } from "../../../services/employee-upload-file-service";

export default defineEventHandler(async (event) => {
  const employeeId = getRouterParam(event, "id") ?? "";
  const formData = await readMultipartFormData(event);
  const files = (formData ?? [])
    .filter((part) => part.name === "files" || part.name === "files[]")
    .filter((part) => part.filename && part.data)
    .map((part) => ({
      filename: part.filename ?? "file",
      data: part.data,
      mimeType: part.type
    }));

  if (files.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: "files are required"
    });
  }

  try {
    const ctx = await getPlatformContext();
    const uploadService = new EmployeeUploadFileService(ctx.employeeRepo, ctx.chatMessageRepo, ctx.gateway.homeDir);
    return {
      ok: true,
      data: {
        items: await uploadService.saveUploadedFiles({
          employeeId,
          files
        })
      }
    };
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : String(error)
    });
  }
});