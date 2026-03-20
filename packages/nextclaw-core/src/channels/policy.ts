export type ChannelDmPolicy = "pairing" | "allowlist" | "open" | "disabled";
export type ChannelGroupPolicy = "open" | "allowlist" | "disabled";

export type ChannelGroupRule = {
  requireMention?: boolean;
  mentionPatterns?: string[];
};

export type ChannelPolicyConfig = {
  allowFrom?: string[];
  dmPolicy?: ChannelDmPolicy;
  groupPolicy?: ChannelGroupPolicy;
  groupAllowFrom?: string[];
  requireMention?: boolean;
  mentionPatterns?: string[];
  groups?: Record<string, ChannelGroupRule | undefined>;
};

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringList(values: string[] | undefined): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  return values
    .map((value) => normalizeString(value))
    .filter(Boolean);
}

function isSenderAllowed(allowFrom: string[] | undefined, senderId: string): boolean {
  const allowList = normalizeStringList(allowFrom);
  if (allowList.includes("*")) {
    return true;
  }
  if (allowList.length === 0) {
    return true;
  }
  if (allowList.includes(senderId)) {
    return true;
  }
  if (senderId.includes("|")) {
    return senderId
      .split("|")
      .map((part) => part.trim())
      .some((part) => allowList.includes(part));
  }
  return false;
}

export function evaluateChannelAccessPolicy(
  config: ChannelPolicyConfig,
  params: { senderId: string; chatId: string; isGroup: boolean }
): boolean {
  if (!params.isGroup) {
    if (config.dmPolicy === "disabled") {
      return false;
    }
    return isSenderAllowed(config.allowFrom, params.senderId);
  }

  if (config.groupPolicy === "disabled") {
    return false;
  }
  if (config.groupPolicy === "allowlist") {
    const allowFrom = normalizeStringList(config.groupAllowFrom);
    return allowFrom.includes("*") || allowFrom.includes(params.chatId);
  }
  return true;
}

export function resolveGroupMentionPolicy(
  config: ChannelPolicyConfig,
  params: { chatId: string; isGroup: boolean }
): {
  requireMention: boolean;
  mentionPatterns: string[];
} {
  if (!params.isGroup) {
    return {
      requireMention: false,
      mentionPatterns: []
    };
  }

  const groupRule = config.groups?.[params.chatId] ?? config.groups?.["*"];
  const requireMention = groupRule?.requireMention ?? config.requireMention ?? false;
  if (!requireMention) {
    return {
      requireMention: false,
      mentionPatterns: []
    };
  }

  return {
    requireMention,
    mentionPatterns: [
      ...normalizeStringList(config.mentionPatterns),
      ...normalizeStringList(groupRule?.mentionPatterns)
    ]
  };
}

export function matchesMentionPattern(content: string, patterns: string[]): boolean {
  const normalizedContent = content.toLowerCase();
  return normalizeStringList(patterns).some((pattern) => {
    try {
      return new RegExp(pattern, "i").test(content);
    } catch {
      return normalizedContent.includes(pattern.toLowerCase());
    }
  });
}
