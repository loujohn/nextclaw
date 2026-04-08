import { createError, getRouterParam, setHeader } from "h3";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, normalize, sep } from "node:path";
import { getPlatformContext } from "../../../../runtime/platform-context";
import { resolveEmployeeWorkspace } from "../../../../engine/employee-workspace";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id") ?? "";
  const rawPath = getRouterParam(event, "path") ?? "";
  if (!rawPath || rawPath.includes("..")) {
    throw createError({ statusCode: 400, statusMessage: "Invalid file path" });
  }

  const ctx = await getPlatformContext();
  const employee = await ctx.employeeRepo.getById(id);
  if (!employee) {
    throw createError({ statusCode: 404, statusMessage: "Employee not found" });
  }

  const wsDir = resolveEmployeeWorkspace(ctx.gateway.homeDir, employee.code);
  const resolved = join(wsDir, normalize(rawPath));

  // 路径安全校验：不允许跳出工作区
  if (resolved !== wsDir && !resolved.startsWith(wsDir + sep)) {
    throw createError({ statusCode: 403, statusMessage: "Access denied" });
  }

  if (!existsSync(resolved) || statSync(resolved).isDirectory()) {
    throw createError({ statusCode: 404, statusMessage: "File not found" });
  }

  const filename = rawPath.split("/").pop() ?? rawPath;
  const ext = filename.includes(".") ? filename.split(".").pop()?.toLowerCase() : "";

  // 文本类文件内联展示，其他作为附件下载
  const inlineExts = new Set(["txt", "md", "json", "csv", "log", "yaml", "yml", "xml", "html", "htm", "js", "ts", "py", "sh", "sql"]);
  const isInline = inlineExts.has(ext ?? "");
  const disposition = isInline ? `inline; filename="${filename}"` : `attachment; filename="${filename}"`;

  setHeader(event, "Content-Disposition", disposition);
  setHeader(event, "Cache-Control", "no-store");

  return readFileSync(resolved);
});
