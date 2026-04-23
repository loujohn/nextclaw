export type ChatSessionBootstrapItem = {
  sessionKey: string;
};

export function shouldDeferInitialMessageLoadToWatcher(params: {
  previousSessionKey?: string | null;
  nextSessionKey: string;
  shouldLoadMessages: boolean;
}): boolean {
  if (!params.shouldLoadMessages) {
    return false;
  }
  const previousSessionKey = params.previousSessionKey?.trim() ?? "";
  return params.nextSessionKey !== previousSessionKey;
}

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