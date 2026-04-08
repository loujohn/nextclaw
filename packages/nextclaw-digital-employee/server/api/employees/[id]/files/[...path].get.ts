import { createError, getRouterParam, setHeader, send } from "h3";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, normalize, sep } from "node:path";
import { getPlatformContext } from "../../../../runtime/platform-context";
import { resolveEmployeeWorkspace } from "../../../../engine/employee-workspace";

const MIME_MAP: Record<string, string> = {
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  json: "application/json; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  log: "text/plain; charset=utf-8",
  yaml: "text/yaml; charset=utf-8",
  yml: "text/yaml; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  ts: "text/plain; charset=utf-8",
  py: "text/plain; charset=utf-8",
  sh: "text/plain; charset=utf-8",
  sql: "text/plain; charset=utf-8",
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  zip: "application/zip",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

const INLINE_EXTS = new Set(["txt", "md", "json", "csv", "log", "yaml", "yml", "xml", "html", "htm", "js", "ts", "py", "sh", "sql", "svg", "png", "jpg", "jpeg", "gif", "pdf"]);

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
  // API 以 workspace/files/ 为根目录，[...path] 对应其中的相对路径
  const filesBase = join(wsDir, "files");
  const resolved = join(filesBase, normalize(rawPath));

  // 路径安全校验：不允许跳出 files/ 目录
  if (resolved !== filesBase && !resolved.startsWith(filesBase + sep)) {
    throw createError({ statusCode: 403, statusMessage: "Access denied" });
  }

  if (!existsSync(resolved) || statSync(resolved).isDirectory()) {
    throw createError({ statusCode: 404, statusMessage: "File not found" });
  }

  const filename = rawPath.split("/").pop() ?? rawPath;
  const ext = (filename.includes(".") ? filename.split(".").pop()?.toLowerCase() : "") ?? "";
  const mimeType = MIME_MAP[ext] ?? "application/octet-stream";
  const isInline = INLINE_EXTS.has(ext);
  const disposition = isInline ? `inline; filename="${filename}"` : `attachment; filename="${filename}"`;

  setHeader(event, "Content-Type", mimeType);
  setHeader(event, "Content-Disposition", disposition);
  setHeader(event, "Cache-Control", "no-store");

  return send(event, readFileSync(resolved), mimeType);
});
