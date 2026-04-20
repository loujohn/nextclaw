import type { ChatAttachmentPreviewType, ChatAttachmentView, SkillCatalogEntryView } from "./ui-models";

export type SkillCatalogEntry = SkillCatalogEntryView;

export type SkillCatalogPayload = { ok: boolean; data: SkillCatalogEntryView[] };

export type DashboardStatsPayload = {
  ok: boolean;
  data: {
    todayRunCount: number;
    todaySuccessRate: number;
    totalSkillCount: number;
    employeeStats: Array<{
      employeeId: string;
      todayRunCount: number;
      totalRunCount: number;
      todaySuccessRate: number;
    }>;
    skillCategoryCounts: Array<{
      category: string;
      categoryLabel: string;
      emoji: string;
      count: number;
    }>;
  };
};

export type IntegrationItem = {
  id: string;
  title: string;
  statusLabel: string;
  description: string;
  detail: string;
  actionLabel: string;
  tone: "teal" | "amber" | "slate";
};

export type RunDetail = {
  employeeName: string;
  statusLabel: string;
  triggerLabel: string;
  scheduleJobName: string | null;
  summary: string;
  result: Record<string, unknown>;
  events: Array<{
    id: string;
    seq: number;
    eventType: string;
    payload: Record<string, unknown>;
    createdAt: string;
  }>;
};

export type WorkspaceFile = {
  filename: string;
  exists: boolean;
  sizeBytes: number;
  writable: boolean;
};

export type UploadWorkspaceFileNode = ChatAttachmentView & {
  kind: "file";
  label: string;
};

export type UploadWorkspaceTreeNode =
  | { kind: "year" | "month" | "day"; label: string; children: UploadWorkspaceTreeNode[] }
  | UploadWorkspaceFileNode;

export type FileListPayload = {
  ok: boolean;
  data: {
    coreFiles: WorkspaceFile[];
    uploadedFilesTree: UploadWorkspaceTreeNode[];
  };
};

export type FileContentPayload = { ok: boolean; data: { filename: string; content: string } };

export type WorkspaceEditableMode = "none" | "text";

export type WorkspaceFileNode = {
  kind: "file";
  name: string;
  relativePath: string;
  sizeBytes: number;
  previewType: ChatAttachmentPreviewType;
  canPreview: boolean;
  editable: boolean;
  editableMode: WorkspaceEditableMode;
  origin: "workspace" | "upload";
  sourceLabel?: string;
};

export type WorkspaceDirectoryNode = {
  kind: "directory";
  name: string;
  relativePath: string;
  children: WorkspaceTreeNode[];
};

export type WorkspaceTreeNode = WorkspaceDirectoryNode | WorkspaceFileNode;

export type WorkspaceTreePayload = {
  ok: boolean;
  data: {
    tree: WorkspaceTreeNode[];
  };
};

export type WorkspaceFilePayload = {
  ok: boolean;
  data: {
    entry: WorkspaceFileNode;
    content?: string;
    rawUrl: string;
    downloadUrl: string;
    previewNotice?: string;
    source?: {
      sessionKey?: string;
      messageId?: string;
      text?: string;
      createdAt?: string;
    };
  };
};

export type UploadedWorkspaceFilePayload = {
  ok: boolean;
  data: {
    filename: string;
    storedName: string;
    relativePath: string;
    mimeType: string;
    size: number;
    previewType: ChatAttachmentPreviewType;
    content?: string;
    rawUrl: string;
    downloadUrl: string;
    source?: {
      sessionKey?: string;
      messageId?: string;
      text?: string;
    };
  };
};

export type UploadFilesPayload = {
  ok: true;
  data: {
    items: ChatAttachmentView[];
  };
};

export type ScheduleJob = {
  id: string;
  employeeId: string;
  name: string;
  description: string;
  scheduleKind: string;
  cronExpr: string | null;
  everyMs: number | null;
  heartbeatIntervalS: number | null;
  taskPrompt: string;
  enabled: boolean;
  runtimeJobId: string | null;
  nextRunAt: string | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type JobsPayload = { ok: boolean; data: ScheduleJob[] };
