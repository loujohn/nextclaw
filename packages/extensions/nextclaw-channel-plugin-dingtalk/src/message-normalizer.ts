import { matchesMentionPattern, type OutboundMessage } from "@nextclaw/core";
import { normalizeString, normalizeStringList } from "./utils";

export type RawDingTalkInboundPayload = {
  text?: { content?: string };
  conversationType?: string;
  conversationId?: string;
  conversationTitle?: string;
  senderId?: string;
  senderStaffId?: string;
  senderNick?: string;
  chatbotUserId?: string;
  isInAtList?: boolean;
  mentioned?: boolean;
  atUserIds?: string[];
  atUsers?: Array<Record<string, unknown>>;
};

export type NormalizedInboundDingTalkMessage = {
  senderId: string;
  chatId: string;
  content: string;
  metadata: Record<string, unknown>;
};

function wasMentionedByNativeSignal(data: RawDingTalkInboundPayload): boolean {
  if (data.isInAtList === true || data.mentioned === true) {
    return true;
  }
  const chatbotUserId = normalizeString(data.chatbotUserId);
  if (!chatbotUserId) {
    return false;
  }
  const atUserIds = normalizeStringList(data.atUserIds);
  if (atUserIds.includes(chatbotUserId)) {
    return true;
  }
  if (!Array.isArray(data.atUsers)) {
    return false;
  }
  return data.atUsers.some((user) => {
    if (!user || typeof user !== "object" || Array.isArray(user)) {
      return false;
    }
    const candidates = [
      normalizeString((user as Record<string, unknown>).userId),
      normalizeString((user as Record<string, unknown>).staffId),
      normalizeString((user as Record<string, unknown>).dingtalkId),
      normalizeString((user as Record<string, unknown>).unionId)
    ];
    return candidates.includes(chatbotUserId);
  });
}

export function normalizeInboundDingTalkMessage(params: {
  accountId: string;
  data: RawDingTalkInboundPayload;
  requireMention?: boolean;
  mentionPatterns?: string[];
}): NormalizedInboundDingTalkMessage | null {
  const content = normalizeString(params.data.text?.content);
  if (!content) {
    return null;
  }

  const senderId = normalizeString(params.data.senderStaffId) || normalizeString(params.data.senderId);
  if (!senderId) {
    return null;
  }

  const isDirect = normalizeString(params.data.conversationType) === "1";
  const conversationId = normalizeString(params.data.conversationId);
  const requireMention = Boolean(params.requireMention && !isDirect);
  const wasMentioned = requireMention
    ? wasMentionedByNativeSignal(params.data) || matchesMentionPattern(content, params.mentionPatterns ?? [])
    : false;

  return {
    senderId,
    chatId: isDirect ? senderId : conversationId || senderId,
    content,
    metadata: {
      platform: "dingtalk",
      sender_name: normalizeString(params.data.senderNick),
      sender_staff_id: normalizeString(params.data.senderStaffId),
      conversation_id: conversationId,
      conversation_title: normalizeString(params.data.conversationTitle),
      is_group: !isDirect,
      account_id: params.accountId,
      accountId: params.accountId,
      peer_kind: isDirect ? "direct" : "group",
      peer_id: isDirect ? senderId : conversationId || senderId,
      was_mentioned: wasMentioned,
      require_mention: requireMention
    }
  };
}

export function resolveOutboundTarget(msg: Pick<OutboundMessage, "chatId" | "metadata">): {
  kind: "direct" | "group";
  targetId: string;
} {
  const peerKind = normalizeString(msg.metadata.peer_kind) === "group" ? "group" : "direct";
  if (peerKind === "group") {
    return {
      kind: "group",
      targetId: normalizeString(msg.metadata.conversation_id) || msg.chatId
    };
  }
  return {
    kind: "direct",
    targetId:
      normalizeString(msg.metadata.sender_staff_id) ||
      normalizeString(msg.metadata.peer_id) ||
      msg.chatId
  };
}
