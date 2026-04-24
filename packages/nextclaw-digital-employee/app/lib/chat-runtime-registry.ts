export type ChatRuntimeHandle = {
  employeeId: string;
  sessionKey: string;
  abortController: AbortController;
  activeRunId: string;
  streamTask: Promise<void>;
};

const chatRuntimeHandles = new Map<string, ChatRuntimeHandle>();

function buildRuntimeKey(employeeId: string, sessionKey: string): string {
  return `${employeeId}:${sessionKey}`;
}

export function getChatRuntimeHandle(employeeId: string, sessionKey: string): ChatRuntimeHandle | null {
  return chatRuntimeHandles.get(buildRuntimeKey(employeeId, sessionKey)) ?? null;
}

export function setChatRuntimeHandle(handle: ChatRuntimeHandle): ChatRuntimeHandle {
  chatRuntimeHandles.set(buildRuntimeKey(handle.employeeId, handle.sessionKey), handle);
  return handle;
}

export function deleteChatRuntimeHandle(employeeId: string, sessionKey: string) {
  chatRuntimeHandles.delete(buildRuntimeKey(employeeId, sessionKey));
}

export function renameChatRuntimeHandle(employeeId: string, previousSessionKey: string, nextSessionKey: string) {
  if (previousSessionKey === nextSessionKey) {
    return;
  }
  const existing = getChatRuntimeHandle(employeeId, previousSessionKey);
  if (!existing) {
    return;
  }
  deleteChatRuntimeHandle(employeeId, previousSessionKey);
  setChatRuntimeHandle({
    ...existing,
    sessionKey: nextSessionKey
  });
}

export function clearChatRuntimeHandlesForTest() {
  chatRuntimeHandles.clear();
}