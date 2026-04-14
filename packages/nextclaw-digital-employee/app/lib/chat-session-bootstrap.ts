export type ChatSessionBootstrapItem = {
  sessionKey: string;
};

export function resolveInitialChatSelection(params: {
  activeSessionKey?: string | null;
  sessions: ChatSessionBootstrapItem[];
}): { sessionKey: string; shouldLoadMessages: boolean } {
  if (params.sessions.length === 0) {
    return {
      sessionKey: "",
      shouldLoadMessages: false
    };
  }

  const currentSessionKey = params.activeSessionKey?.trim() ?? "";
  if (currentSessionKey && params.sessions.some((session) => session.sessionKey === currentSessionKey)) {
    return {
      sessionKey: currentSessionKey,
      shouldLoadMessages: true
    };
  }

  return {
    sessionKey: params.sessions[0]?.sessionKey ?? "",
    shouldLoadMessages: true
  };
}