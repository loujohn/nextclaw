import { createError, getQuery, getRouterParam } from "h3";
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { getPlatformContext } from "../../../../../runtime/platform-context";
import { resolveEmployeeWorkspace } from "../../../../../engine/employee-workspace";
import { inferMimeType, normalizeRelativeUploadPath, resolveUploadedFilePath } from "../../../../../chat/chat-attachments";

export default defineEventHandler(async (event) => {
  const employeeId = getRouterParam(event, "id") ?? "";
  const query = getQuery(event);
  const relativePath = typeof query.path === "string" ? normalizeRelativeUploadPath(query.path) : "";
  if (!relativePath) {
    throw createError({ statusCode: 400, statusMessage: "path is required" });
  }
  const ctx = await getPlatformContext();
  const employee = await ctx.employeeRepo.getById(employeeId);
  if (!employee) {
    throw createError({ statusCode: 404, statusMessage: "Employee not found" });
  }
  const workspaceDir = resolveEmployeeWorkspace(ctx.gateway.homeDir, employee.code);
  const absolutePath = resolveUploadedFilePath(workspaceDir, relativePath);
  if (!existsSync(absolutePath)) {
    throw createError({ statusCode: 404, statusMessage: "Uploaded file not found" });
  }
  const filename = basename(absolutePath);
  const mimeType = inferMimeType(filename);
  const download = query.download === "1" || query.download === "true";
  return new Response(readFileSync(absolutePath), {
    headers: {
      "Content-Type": mimeType,
      ...(download ? { "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}` } : {})
    }
  });
});