import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";
import type { EmployeeRepository } from "../repositories/employee-repository";
import type { ChatMessageRepository } from "../repositories/chat-message-repository";
import type { UploadWorkspaceTreeNode, UploadedWorkspaceFilePayload } from "../../shared/api-types";
import type { ChatAttachmentView } from "../../shared/ui-models";
import { resolveEmployeeUploadDateDir, resolveEmployeeUploadRoot, resolveEmployeeWorkspace } from "../engine/employee-workspace";
import {
  ALLOWED_UPLOAD_EXTENSIONS,
  MAX_UPLOAD_FILE_SIZE_BYTES,
  MAX_UPLOAD_TOTAL_SIZE_BYTES,
  createStoredUploadName,
  deriveOriginalNameFromStoredName,
  formatUploadDate,
  inferMimeType,
  inferPreviewType,
  isTextPreviewType,
  normalizeRelativeUploadPath,
  resolveUploadedFilePath,
  sanitizeUploadFilename
} from "../chat/chat-attachments";

type UploadedInputFile = {
  filename: string;
  data: Buffer;
  mimeType?: string;
};

type AttachmentSourceRecord = {
  relativePath: string;
  attachment: ChatAttachmentView;
};

function toWorkspaceRelativePath(workspaceDir: string, filePath: string): string {
  return relative(workspaceDir, filePath).replaceAll("\\", "/");
}

function compareDescending(left: string, right: string): number {
  return right.localeCompare(left, "zh-CN");
}

function buildSourceMap(items: AttachmentSourceRecord[]): Map<string, ChatAttachmentView> {
  const map = new Map<string, ChatAttachmentView>();
  for (const item of items) {
    map.set(item.relativePath, item.attachment);
  }
  return map;
}

function createFileNode(params: {
  relativePath: string;
  storedName: string;
  uploadDate: string;
  size: number;
  mimeType: string;
  source?: ChatAttachmentView;
}): UploadWorkspaceTreeNode {
  const source = params.source;
  const originalName = source?.originalName ?? deriveOriginalNameFromStoredName(params.storedName);
  const previewType = source?.previewType ?? inferPreviewType(originalName, params.mimeType);
  return {
    kind: "file",
    label: originalName,
    token: source?.token,
    originalName,
    storedName: params.storedName,
    relativePath: params.relativePath,
    mimeType: source?.mimeType ?? params.mimeType,
    size: params.size,
    previewType,
    uploadDate: source?.uploadDate ?? params.uploadDate,
    ...(source?.sourceText ? { sourceText: source.sourceText } : {}),
    ...(source?.sourceSessionKey ? { sourceSessionKey: source.sourceSessionKey } : {}),
    ...(source?.sourceMessageId ? { sourceMessageId: source.sourceMessageId } : {})
  };
}

export class EmployeeUploadFileService {
  constructor(
    private readonly employeeRepo: EmployeeRepository,
    private readonly chatMessageRepo: ChatMessageRepository,
    private readonly homeDir: string
  ) {}

  private async getEmployeeOrThrow(employeeId: string) {
    const employee = await this.employeeRepo.getById(employeeId);
    if (!employee) {
      throw new Error("Employee not found");
    }
    return employee;
  }

  async saveUploadedFiles(params: { employeeId: string; files: UploadedInputFile[] }): Promise<ChatAttachmentView[]> {
    const employee = await this.getEmployeeOrThrow(params.employeeId);
    if (params.files.length === 0) {
      return [];
    }
    const uploadDate = formatUploadDate(new Date());
    const uploadDir = resolveEmployeeUploadDateDir(this.homeDir, employee.code, uploadDate);
    const workspaceDir = resolveEmployeeWorkspace(this.homeDir, employee.code);
    mkdirSync(uploadDir, { recursive: true });
    let totalSize = 0;
    return params.files.map((file) => {
      const originalName = sanitizeUploadFilename(file.filename);
      const extension = extname(originalName).toLowerCase();
      if (!ALLOWED_UPLOAD_EXTENSIONS.has(extension)) {
        throw new Error(`暂不支持上传 ${extension || "该类型"} 文件`);
      }
      const size = file.data.byteLength;
      if (size <= 0) {
        throw new Error(`${originalName} 为空文件，无法上传`);
      }
      if (size > MAX_UPLOAD_FILE_SIZE_BYTES) {
        throw new Error(`${originalName} 超过单文件大小限制`);
      }
      totalSize += size;
      if (totalSize > MAX_UPLOAD_TOTAL_SIZE_BYTES) {
        throw new Error("本次上传文件总大小超过限制");
      }
      const storedName = createStoredUploadName(originalName);
      const filePath = join(uploadDir, storedName);
      writeFileSync(filePath, file.data);
      const relativePath = normalizeRelativeUploadPath(toWorkspaceRelativePath(workspaceDir, filePath));
      const mimeType = inferMimeType(originalName, file.mimeType);
      return {
        token: storedName,
        originalName,
        storedName,
        relativePath,
        mimeType,
        size,
        previewType: inferPreviewType(originalName, mimeType),
        uploadDate
      } satisfies ChatAttachmentView;
    });
  }

  async listUploadedFiles(params: { employeeId: string }): Promise<UploadWorkspaceTreeNode[]> {
    const employee = await this.getEmployeeOrThrow(params.employeeId);
    const uploadRoot = resolveEmployeeUploadRoot(this.homeDir, employee.code);
    if (!existsSync(uploadRoot)) {
      return [];
    }
    const sourceMap = buildSourceMap(await this.chatMessageRepo.listAttachmentReferencesByEmployeeId(employee.id));
    const yearBuckets = new Map<string, Map<string, Map<string, UploadWorkspaceTreeNode[]>>>();
    const workspaceDir = resolveEmployeeWorkspace(this.homeDir, employee.code);
    const dateDirs = readdirSync(uploadRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
      .map((entry) => entry.name)
      .sort(compareDescending);

    for (const dateDir of dateDirs) {
      const parts = dateDir.split("-");
      const [year, month, day] = parts;
      if (!year || !month || !day) {
        continue;
      }
      const dayDir = join(uploadRoot, dateDir);
      const files = readdirSync(dayDir, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .sort((left, right) => left.localeCompare(right, "zh-CN"));
      const fileNodes = files.map((storedName) => {
        const absolutePath = join(dayDir, storedName);
        const stats = statSync(absolutePath);
        const relativePath = normalizeRelativeUploadPath(toWorkspaceRelativePath(workspaceDir, absolutePath));
        const source = sourceMap.get(relativePath);
        return createFileNode({
          relativePath,
          storedName,
          uploadDate: dateDir,
          size: stats.size,
          mimeType: inferMimeType(storedName, source?.mimeType),
          source
        });
      });
      const monthBuckets = yearBuckets.get(year) ?? new Map<string, Map<string, UploadWorkspaceTreeNode[]>>();
      const dayBuckets = monthBuckets.get(month) ?? new Map<string, UploadWorkspaceTreeNode[]>();
      dayBuckets.set(day, fileNodes);
      monthBuckets.set(month, dayBuckets);
      yearBuckets.set(year, monthBuckets);
    }

    return [...yearBuckets.keys()].sort(compareDescending).map((year) => ({
      kind: "year",
      label: year,
      children: [...(yearBuckets.get(year)?.keys() ?? [])].sort(compareDescending).map((month) => ({
        kind: "month",
        label: month,
        children: [...(yearBuckets.get(year)?.get(month)?.keys() ?? [])].sort(compareDescending).map((day) => ({
          kind: "day",
          label: day,
          children: yearBuckets.get(year)?.get(month)?.get(day) ?? []
        }))
      }))
    }));
  }

  async readUploadedFile(params: {
    employeeId: string;
    relativePath: string;
    rawUrl: string;
    downloadUrl: string;
  }): Promise<UploadedWorkspaceFilePayload["data"]> {
    const employee = await this.getEmployeeOrThrow(params.employeeId);
    const workspaceDir = resolveEmployeeWorkspace(this.homeDir, employee.code);
    const normalizedPath = normalizeRelativeUploadPath(params.relativePath);
    const absolutePath = resolveUploadedFilePath(workspaceDir, normalizedPath);
    if (!existsSync(absolutePath)) {
      throw new Error("上传文件不存在");
    }
    const storedName = basename(absolutePath);
    const stats = statSync(absolutePath);
    const source = (await this.chatMessageRepo.listAttachmentReferencesByEmployeeId(employee.id))
      .find((item) => item.relativePath === normalizedPath)?.attachment;
    const originalName = source?.originalName ?? deriveOriginalNameFromStoredName(storedName);
    const mimeType = inferMimeType(originalName, source?.mimeType);
    const previewType = source?.previewType ?? inferPreviewType(originalName, mimeType);
    return {
      filename: originalName,
      storedName,
      relativePath: normalizedPath,
      mimeType,
      size: stats.size,
      previewType,
      ...(isTextPreviewType(previewType) ? { content: readFileSync(absolutePath, "utf-8") } : {}),
      rawUrl: params.rawUrl,
      downloadUrl: params.downloadUrl,
      ...(source?.sourceMessageId || source?.sourceSessionKey || source?.sourceText
        ? {
            source: {
              ...(source?.sourceSessionKey ? { sessionKey: source.sourceSessionKey } : {}),
              ...(source?.sourceMessageId ? { messageId: source.sourceMessageId } : {}),
              ...(source?.sourceText ? { text: source.sourceText } : {})
            }
          }
        : {})
    };
  }
}