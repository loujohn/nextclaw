import { randomUUID } from "node:crypto";
import type { Knex } from "knex";
import { PLATFORM_TABLES, type ChatMessageRecord } from "../db/schema";
import { normalizeChatMessageTimestamp } from "../chat/chat-message-normalization";

export type ChatMessageView = {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  toolName?: string;
  toolCallId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type ChatMessagePage = {
  items: ChatMessageView[];
  nextCursor: string | null;
};

export type CreateChatMessageInput = {
  sessionId: string;
  role: ChatMessageView["role"];
  content: string;
  toolName?: string;
  toolCallId?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
};

type CursorToken = {
  createdAt: string;
  id: string;
};

function encodeCursor(value: CursorToken): string {
  return Buffer.from(JSON.stringify(value), "utf-8").toString("base64url");
}

function decodeCursor(value?: string | null): CursorToken | null {
  if (!value?.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf-8")) as CursorToken;
    if (typeof parsed.createdAt !== "string" || typeof parsed.id !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function toView(record: ChatMessageRecord): ChatMessageView {
  return {
    id: record.id,
    sessionId: record.session_id,
    role: record.role as ChatMessageView["role"],
    content: record.content,
    ...(record.tool_name ? { toolName: record.tool_name } : {}),
    ...(record.tool_call_id ? { toolCallId: record.tool_call_id } : {}),
    ...(record.metadata_json ? { metadata: JSON.parse(record.metadata_json) as Record<string, unknown> } : {}),
    createdAt: record.created_at
  };
}

export class ChatMessageRepository {
  constructor(private readonly db: Knex) {}

  async createMany(inputs: CreateChatMessageInput[]): Promise<ChatMessageView[]> {
    if (inputs.length === 0) {
      return [];
    }
    const rows: ChatMessageRecord[] = inputs.map((input) => ({
      id: randomUUID(),
      session_id: input.sessionId,
      role: input.role,
      content: input.content,
      tool_name: input.toolName ?? null,
      tool_call_id: input.toolCallId ?? null,
      metadata_json: JSON.stringify(input.metadata ?? {}),
      created_at: normalizeChatMessageTimestamp(input.createdAt)
    }));
    await this.db<ChatMessageRecord>(PLATFORM_TABLES.chatMessages).insert(rows);
    return rows.map(toView);
  }

  async listBySessionId(params: { sessionId: string; limit?: number; before?: string | null }): Promise<ChatMessagePage> {
    const limit = Math.max(1, Math.min(params.limit ?? 50, 100));
    const before = decodeCursor(params.before);
    let query = this.db<ChatMessageRecord>(PLATFORM_TABLES.chatMessages)
      .where({ session_id: params.sessionId });
    if (before) {
      query = query.andWhere((builder) => {
        builder.where("created_at", "<", before.createdAt)
          .orWhere((nested) => {
            nested.where("created_at", "=", before.createdAt).andWhere("id", "<", before.id);
          });
      });
    }
    const rows = await query
      .orderBy("created_at", "desc")
      .orderBy("id", "desc")
      .limit(limit + 1);
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const nextSource = hasMore ? pageRows[pageRows.length - 1] : null;
    const items = [...pageRows].reverse().map(toView);
    return {
      items,
      nextCursor: nextSource
        ? encodeCursor({
            createdAt: nextSource.created_at,
            id: nextSource.id
          })
        : null
    };
  }
}
