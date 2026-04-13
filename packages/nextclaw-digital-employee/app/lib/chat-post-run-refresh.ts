const POST_RUN_REFRESH_LABELS = ["员工详情", "运行记录"] as const;

export type LocalChatSessionListItem = {
  sessionKey: string;
  title: string;
  preview: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
};

type RefreshChatAfterRunParams = {
  refreshEmployee: () => Promise<unknown>;
  refreshRuns: () => Promise<unknown>;
};

type UpsertLocalChatSessionParams = {
  sessions: LocalChatSessionListItem[];
  sessionKey: string;
  latestContent: string;
  occurredAt: string;
  titleSeed?: string;
  messageCountIncrement?: number;
};

export function shouldCommitLocalChatSessionUpdate(status?: string | null): boolean {
  return status === "completed" || status === "aborted";
}

export function buildChatSessionTitle(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) {
    return "新对话";
  }
  return trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed;
}

export function buildChatSessionPreview(message: string): string {
  const normalized = message.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return "";
  }
  return normalized.length > 120 ? `${normalized.slice(0, 120)}…` : normalized;
}

export function upsertLocalChatSession(params: UpsertLocalChatSessionParams): LocalChatSessionListItem[] {
  const messageCountIncrement = Math.max(0, params.messageCountIncrement ?? 0);
  const latestPreview = buildChatSessionPreview(params.latestContent);
  const nextTitle = params.titleSeed?.trim() ? buildChatSessionTitle(params.titleSeed) : "新对话";
  const existing = params.sessions.find((session) => session.sessionKey === params.sessionKey);

  if (!existing) {
    return [{
      sessionKey: params.sessionKey,
      title: nextTitle,
      preview: latestPreview,
      messageCount: messageCountIncrement,
      createdAt: params.occurredAt,
      updatedAt: params.occurredAt,
      lastMessageAt: params.occurredAt
    }, ...params.sessions];
  }

  const updatedSession: LocalChatSessionListItem = {
    ...existing,
    title: existing.title === "新对话" && params.titleSeed?.trim() ? buildChatSessionTitle(params.titleSeed) : existing.title,
    preview: latestPreview,
    messageCount: existing.messageCount + messageCountIncrement,
    updatedAt: params.occurredAt,
    lastMessageAt: params.occurredAt
  };

  return [updatedSession, ...params.sessions.filter((session) => session.sessionKey !== params.sessionKey)];
}

export async function refreshChatAfterRun(params: RefreshChatAfterRunParams): Promise<string[]> {
  const results = await Promise.allSettled([
    params.refreshEmployee(),
    params.refreshRuns()
  ]);
  const failedRefreshes: string[] = [];
  for (const [index, result] of results.entries()) {
    if (result.status === "rejected") {
      failedRefreshes.push(POST_RUN_REFRESH_LABELS[index] ?? `刷新项-${index}`);
    }
  }
  return failedRefreshes;
}