import type { ChatMessageView } from "../../shared/ui-models";

const MESSAGE_MATCH_WINDOW_MS = 2 * 60 * 1000;

type ChatReplyTimelineEntry = Extract<
  NonNullable<ChatMessageView["processTimeline"]>[number],
  { kind: "reply" }
>;

function normalizeMessageText(message: ChatMessageView): string {
  const content = message.content.trim();
  if (content) {
    return content;
  }
  const replyTimeline = [...(message.processTimeline ?? [])]
    .reverse()
    .find((entry): entry is ChatReplyTimelineEntry => entry.kind === "reply" && entry.content.trim().length > 0);
  return replyTimeline?.content.trim() ?? "";
}

function normalizeTimestamp(value?: string): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function areEquivalentChatMessages(left: ChatMessageView, right: ChatMessageView): boolean {
  const leftId = left.id?.trim();
  const rightId = right.id?.trim();
  if (leftId && rightId && leftId === rightId) {
    return true;
  }

  if (left.role !== right.role) {
    return false;
  }

  const leftText = normalizeMessageText(left);
  const rightText = normalizeMessageText(right);
  if (!leftText || !rightText || leftText !== rightText) {
    return false;
  }

  const leftTimestamp = normalizeTimestamp(left.timestamp);
  const rightTimestamp = normalizeTimestamp(right.timestamp);
  if (leftTimestamp === null || rightTimestamp === null) {
    return true;
  }
  return Math.abs(leftTimestamp - rightTimestamp) <= MESSAGE_MATCH_WINDOW_MS;
}

export function prunePersistedMatchesFromOverlay(
  persistedMessages: ChatMessageView[],
  overlayMessages: ChatMessageView[]
): ChatMessageView[] {
  if (persistedMessages.length === 0 || overlayMessages.length === 0) {
    return overlayMessages;
  }
  return overlayMessages.filter((overlayMessage) => (
    !persistedMessages.some((persistedMessage) => areEquivalentChatMessages(persistedMessage, overlayMessage))
  ));
}

export function mergePersistedAndOverlay(
  persistedMessages: ChatMessageView[],
  overlayMessages: ChatMessageView[]
): ChatMessageView[] {
  if (overlayMessages.length === 0) {
    return persistedMessages;
  }
  const nextOverlayMessages = prunePersistedMatchesFromOverlay(persistedMessages, overlayMessages);
  if (nextOverlayMessages.length === 0) {
    return persistedMessages;
  }
  return [...persistedMessages, ...nextOverlayMessages];
}