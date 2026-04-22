import { randomUUID } from "node:crypto";
import { basename, extname, join, normalize, posix, resolve } from "node:path";
import type { ChatAttachmentPreviewType, ChatAttachmentView } from "../../shared/ui-models";

const UPLOAD_TEXT_EXTENSIONS = new Set([".txt", ".md"]);
const CODE_TEXT_EXTENSIONS = new Set([
  ".py",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".json",
  ".yaml",
  ".yml",
  ".sh",
  ".bash",
  ".zsh",
  ".sql",
  ".html",
  ".css",
  ".scss",
  ".less",
  ".vue",
  ".xml",
  ".toml",
  ".ini",
  ".cfg",
  ".conf",
]);
const TEXT_EXTENSIONS = new Set([...UPLOAD_TEXT_EXTENSIONS, ...CODE_TEXT_EXTENSIONS]);
const PDF_EXTENSIONS = new Set([".pdf"]);
const OFFICE_EXTENSIONS = new Set([".docx", ".xlsx", ".pptx"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

export const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  ...UPLOAD_TEXT_EXTENSIONS,
  ...PDF_EXTENSIONS,
  ...OFFICE_EXTENSIONS,
  ...IMAGE_EXTENSIONS
]);

export const MAX_UPLOAD_FILE_SIZE_BYTES = 20 * 1024 * 1024;
export const MAX_UPLOAD_TOTAL_SIZE_BYTES = 50 * 1024 * 1024;

const MIME_BY_EXTENSION: Record<string, string> = {
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".py": "text/x-python",
  ".js": "text/javascript",
  ".jsx": "text/javascript",
  ".ts": "text/plain",
  ".tsx": "text/plain",
  ".json": "application/json",
  ".yaml": "application/yaml",
  ".yml": "application/yaml",
  ".sh": "text/x-shellscript",
  ".bash": "text/x-shellscript",
  ".zsh": "text/x-shellscript",
  ".sql": "application/sql",
  ".html": "text/html",
  ".css": "text/css",
  ".scss": "text/plain",
  ".less": "text/plain",
  ".vue": "text/plain",
  ".xml": "application/xml",
  ".toml": "text/plain",
  ".ini": "text/plain",
  ".cfg": "text/plain",
  ".conf": "text/plain",
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp"
};

function normalizeSlashPath(value: string): string {
  return value.replaceAll("\\", "/");
}

export function formatUploadDate(date: Date): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(date);
}

export function sanitizeUploadFilename(filename: string): string {
  const onlyName = basename(filename).trim();
  const extension = extname(onlyName);
  const stem = onlyName.slice(0, Math.max(0, onlyName.length - extension.length));
  const safeStem = stem.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/\s+/g, " ").trim() || "file";
  const safeExtension = extension.replace(/[^.a-zA-Z0-9]/g, "").toLowerCase();
  return `${safeStem}${safeExtension}`;
}

export function createStoredUploadName(originalName: string): string {
  return `up_${randomUUID().replaceAll("-", "").slice(0, 12)}_${originalName}`;
}

export function inferMimeType(filename: string, mimeType?: string): string {
  if (mimeType?.trim()) {
    return mimeType.trim();
  }
  const extension = extname(filename).toLowerCase();
  return MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
}

export function inferPreviewType(filename: string, mimeType?: string): ChatAttachmentPreviewType {
  const extension = extname(filename).toLowerCase();
  const normalizedMimeType = mimeType?.toLowerCase() ?? "";
  if (TEXT_EXTENSIONS.has(extension) || normalizedMimeType.startsWith("text/")) {
    return "text";
  }
  if (PDF_EXTENSIONS.has(extension) || normalizedMimeType === "application/pdf") {
    return "pdf";
  }
  if (OFFICE_EXTENSIONS.has(extension)) {
    return "office";
  }
  if (IMAGE_EXTENSIONS.has(extension) || normalizedMimeType.startsWith("image/")) {
    return "image";
  }
  return "binary";
}

export function isTextPreviewType(previewType: ChatAttachmentPreviewType): boolean {
  return previewType === "text";
}

export function isUploadPath(relativePath: string): boolean {
  return normalizeSlashPath(relativePath).startsWith("uploadFile/");
}

export function normalizeRelativeUploadPath(relativePath: string): string {
  return normalizeSlashPath(posix.normalize(relativePath)).replace(/^\/+/, "");
}

export function resolveUploadedFilePath(workspaceDir: string, relativePath: string): string {
  const normalizedPath = normalizeRelativeUploadPath(relativePath);
  if (!isUploadPath(normalizedPath)) {
    throw new Error("附件路径必须位于 uploadFile 根目录下");
  }
  const absolutePath = resolve(workspaceDir, normalizedPath);
  const uploadRoot = resolve(join(workspaceDir, "uploadFile"));
  if (absolutePath !== uploadRoot && !absolutePath.startsWith(`${uploadRoot}/`)) {
    throw new Error("附件路径越界");
  }
  return absolutePath;
}

export function deriveOriginalNameFromStoredName(storedName: string): string {
  return storedName.replace(/^up_[^_]+_/, "") || storedName;
}

export function buildAttachmentPromptText(message: string, attachments: ChatAttachmentView[]): string {
  if (attachments.length === 0) {
    return message;
  }
  const lines = [message, "", `用户上传了 ${attachments.length} 个文件：`];
  attachments.forEach((attachment, index) => {
    lines.push(`${index + 1}. 文件名：${attachment.originalName}`);
    lines.push(`   路径：${attachment.relativePath}`);
    lines.push("   请在员工工作空间中读取该文件并结合用户问题分析。");
  });
  return lines.join("\n");
}

export function normalizeChatAttachment(value: unknown): ChatAttachmentView | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const relativePath = typeof raw.relativePath === "string" ? normalizeRelativeUploadPath(raw.relativePath) : "";
  if (!relativePath || !isUploadPath(relativePath)) {
    return null;
  }
  const storedName = typeof raw.storedName === "string" && raw.storedName.trim()
    ? raw.storedName.trim()
    : basename(relativePath);
  const originalName = typeof raw.originalName === "string" && raw.originalName.trim()
    ? raw.originalName.trim()
    : deriveOriginalNameFromStoredName(storedName);
  const mimeType = inferMimeType(originalName, typeof raw.mimeType === "string" ? raw.mimeType : undefined);
  const previewType = typeof raw.previewType === "string"
    ? inferPreviewType(originalName, raw.previewType)
    : inferPreviewType(originalName, mimeType);
  const uploadDate = typeof raw.uploadDate === "string" && raw.uploadDate.trim()
    ? raw.uploadDate.trim()
    : relativePath.split("/")[1] ?? formatUploadDate(new Date());
  const size = typeof raw.size === "number" && Number.isFinite(raw.size) ? raw.size : 0;
  return {
    ...(typeof raw.token === "string" && raw.token.trim() ? { token: raw.token.trim() } : {}),
    originalName,
    storedName,
    relativePath,
    mimeType,
    size,
    previewType,
    uploadDate,
    ...(typeof raw.sourceText === "string" && raw.sourceText.trim() ? { sourceText: raw.sourceText.trim() } : {}),
    ...(typeof raw.sourceSessionKey === "string" && raw.sourceSessionKey.trim()
      ? { sourceSessionKey: raw.sourceSessionKey.trim() }
      : {}),
    ...(typeof raw.sourceMessageId === "string" && raw.sourceMessageId.trim()
      ? { sourceMessageId: raw.sourceMessageId.trim() }
      : {}),
    ...(typeof raw.sourceCreatedAt === "string" && raw.sourceCreatedAt.trim()
      ? { sourceCreatedAt: raw.sourceCreatedAt.trim() }
      : {})
  };
}