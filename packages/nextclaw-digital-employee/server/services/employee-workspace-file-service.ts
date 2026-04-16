import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import type { WorkspaceFileNode, WorkspaceFilePayload, WorkspaceTreeNode } from "../../shared/api-types";
import type { ChatAttachmentView, ChatAttachmentPreviewType } from "../../shared/ui-models";
import type { EmployeeRepository } from "../repositories/employee-repository";
import type { ChatMessageRepository } from "../repositories/chat-message-repository";
import { resolveEmployeeWorkspace } from "../engine/employee-workspace";
import {
  deriveOriginalNameFromStoredName,
  inferMimeType,
  inferPreviewType,
  isTextPreviewType,
  normalizeRelativeUploadPath,
  resolveUploadedFilePath,
} from "../chat/chat-attachments";

const UNSUPPORTED_PREVIEW_NOTICE = "当前系统暂不支持预览该文件类型，请下载后查看。";

type AttachmentReference = {
  relativePath: string;
  attachment: ChatAttachmentView;
};

function normalizeSlashPath(value: string): string {
  return value.replaceAll("\\", "/");
}

function normalizeWorkspaceRelativePath(value: string): string {
  const normalized = normalizeSlashPath(value).replace(/^\/+/, "").split("/").filter(Boolean).join("/");
  return normalized;
}

function resolveWorkspacePath(workspaceDir: string, relativePath: string): { relativePath: string; absolutePath: string } {
  const normalizedPath = normalizeWorkspaceRelativePath(relativePath);
  if (!normalizedPath) {
    throw new Error("relativePath is required");
  }
  const absolutePath = resolve(workspaceDir, normalizedPath);
  if (absolutePath !== workspaceDir && !absolutePath.startsWith(`${workspaceDir}/`)) {
    throw new Error("工作空间路径越界");
  }
  return { relativePath: normalizedPath, absolutePath };
}

function toWorkspaceRelativePath(workspaceDir: string, filePath: string): string {
  return normalizeWorkspaceRelativePath(relative(workspaceDir, filePath));
}

function compareNames(left: string, right: string): number {
  return left.localeCompare(right, "zh-CN");
}

function isUploadPath(relativePath: string): boolean {
  return normalizeSlashPath(relativePath).startsWith("uploadFile/");
}

function isPreviewSupported(previewType: ChatAttachmentPreviewType): boolean {
  return previewType === "text" || previewType === "image" || previewType === "pdf";
}

function getEditableMode(relativePath: string, previewType: ChatAttachmentPreviewType): WorkspaceFileNode["editableMode"] {
  if (!isUploadPath(relativePath) && previewType === "text") {
    return "text";
  }
  return "none";
}

function buildSourceLabel(source?: ChatAttachmentView): string | undefined {
  if (!source) {
    return undefined;
  }
  if (source.sourceSessionKey) {
    return `来源：会话 ${source.sourceSessionKey}`;
  }
  if (source.sourceMessageId) {
    return `来源：消息 ${source.sourceMessageId}`;
  }
  if (source.sourceText) {
    return "来源：聊天上传";
  }
  return "来源：聊天上传";
}

export class EmployeeWorkspaceFileService {
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

  private async getWorkspaceContext(employeeId: string) {
    const employee = await this.getEmployeeOrThrow(employeeId);
    const workspaceDir = resolveEmployeeWorkspace(this.homeDir, employee.code);
    const attachmentRefs = await this.chatMessageRepo.listAttachmentReferencesByEmployeeId(employee.id);
    const sourceMap = new Map<string, ChatAttachmentView>();
    for (const item of attachmentRefs as AttachmentReference[]) {
      sourceMap.set(normalizeRelativeUploadPath(item.relativePath), item.attachment);
    }
    return { employee, workspaceDir, sourceMap };
  }

  private createFileNode(params: {
    relativePath: string;
    absolutePath: string;
    source?: ChatAttachmentView;
  }): WorkspaceFileNode {
    const stats = statSync(params.absolutePath);
    const normalizedRelativePath = params.relativePath;
    const isUpload = isUploadPath(normalizedRelativePath);
    const source = params.source;
    const name = isUpload
      ? source?.originalName ?? deriveOriginalNameFromStoredName(normalizedRelativePath.split("/").pop() ?? "")
      : normalizedRelativePath.split("/").pop() ?? "";
    const mimeType = inferMimeType(name, source?.mimeType);
    const previewType = source?.previewType ?? inferPreviewType(name, mimeType);
    const editableMode = isUpload ? "none" : getEditableMode(normalizedRelativePath, previewType);
    return {
      kind: "file",
      name,
      relativePath: normalizedRelativePath,
      sizeBytes: stats.size,
      previewType,
      canPreview: isPreviewSupported(previewType),
      editable: editableMode !== "none",
      editableMode,
      origin: isUpload ? "upload" : "workspace",
      ...(isUpload && buildSourceLabel(source) ? { sourceLabel: buildSourceLabel(source) } : {})
    };
  }

  private buildTree(workspaceDir: string, sourceMap: Map<string, ChatAttachmentView>, currentDir = workspaceDir): WorkspaceTreeNode[] {
    if (!existsSync(currentDir)) {
      return [];
    }
    const entries = readdirSync(currentDir, { withFileTypes: true })
      .filter((entry) => !entry.name.startsWith("."))
      .sort((left, right) => {
        if (left.isDirectory() !== right.isDirectory()) {
          return left.isDirectory() ? -1 : 1;
        }
        return compareNames(left.name, right.name);
      });
    return entries.flatMap<WorkspaceTreeNode>((entry) => {
      const absolutePath = join(currentDir, entry.name);
      const relativePath = toWorkspaceRelativePath(workspaceDir, absolutePath);
      if (!relativePath) {
        return [];
      }
      if (entry.isDirectory()) {
        return [{
          kind: "directory",
          name: entry.name,
          relativePath,
          children: this.buildTree(workspaceDir, sourceMap, absolutePath)
        } satisfies WorkspaceTreeNode];
      }
      return [this.createFileNode({
        relativePath,
        absolutePath,
        source: sourceMap.get(normalizeRelativeUploadPath(relativePath))
      })];
    });
  }

  async listWorkspace(params: { employeeId: string }): Promise<WorkspaceTreeNode[]> {
    const { workspaceDir, sourceMap } = await this.getWorkspaceContext(params.employeeId);
    return this.buildTree(workspaceDir, sourceMap);
  }

  private async resolveEntry(params: { employeeId: string; relativePath: string }) {
    const { workspaceDir, sourceMap } = await this.getWorkspaceContext(params.employeeId);
    const normalizedInput = isUploadPath(params.relativePath)
      ? normalizeRelativeUploadPath(params.relativePath)
      : normalizeWorkspaceRelativePath(params.relativePath);
    const absolutePath = isUploadPath(normalizedInput)
      ? resolveUploadedFilePath(workspaceDir, normalizedInput)
      : resolveWorkspacePath(workspaceDir, normalizedInput).absolutePath;
    if (!existsSync(absolutePath)) {
      throw new Error("工作空间文件不存在");
    }
    const source = sourceMap.get(normalizeRelativeUploadPath(normalizedInput));
    const entry = this.createFileNode({
      relativePath: normalizedInput,
      absolutePath,
      source
    });
    return {
      absolutePath,
      normalizedInput,
      source,
      entry
    };
  }

  async readFile(params: {
    employeeId: string;
    relativePath: string;
    rawUrl: string;
    downloadUrl: string;
  }): Promise<WorkspaceFilePayload["data"]> {
    const { absolutePath, normalizedInput, source, entry } = await this.resolveEntry({
      employeeId: params.employeeId,
      relativePath: params.relativePath
    });
    return {
      entry,
      ...(isTextPreviewType(entry.previewType) ? { content: readFileSync(absolutePath, "utf-8") } : {}),
      rawUrl: params.rawUrl,
      downloadUrl: params.downloadUrl,
      ...(!entry.canPreview ? { previewNotice: UNSUPPORTED_PREVIEW_NOTICE } : {}),
      ...(source?.sourceMessageId || source?.sourceSessionKey || source?.sourceText
        ? {
            source: {
              ...(source.sourceSessionKey ? { sessionKey: source.sourceSessionKey } : {}),
              ...(source.sourceMessageId ? { messageId: source.sourceMessageId } : {}),
              ...(source.sourceText ? { text: source.sourceText } : {}),
              ...(source.sourceCreatedAt ? { createdAt: source.sourceCreatedAt } : {})
            }
          }
        : {})
    };
  }

  async readRawFile(params: { employeeId: string; relativePath: string }) {
    const { absolutePath, entry, source } = await this.resolveEntry(params);
    return {
      absolutePath,
      filename: entry.name,
      mimeType: inferMimeType(entry.name, source?.mimeType)
    };
  }

  async saveTextFile(params: { employeeId: string; relativePath: string; content: string }): Promise<void> {
    const { workspaceDir } = await this.getWorkspaceContext(params.employeeId);
    const { relativePath, absolutePath } = resolveWorkspacePath(workspaceDir, params.relativePath);
    const previewType = inferPreviewType(relativePath);
    if (getEditableMode(relativePath, previewType) !== "text") {
      throw new Error("当前文件不允许文本编辑");
    }
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, params.content, "utf-8");
  }
}