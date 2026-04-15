import { randomUUID } from "node:crypto";
import type { Knex } from "knex";
import { PLATFORM_TABLES, type ChatMessageRecord } from "../db/schema";
import { normalizeChatMessageTimestamp } from "../chat/chat-message-normalization";
import type { ChatAttachmentView } from "../../shared/ui-models";
import { normalizeChatAttachment } from "../chat/chat-attachments";

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
  id?: string;
  sessionId: string;
  role: ChatMessageView["role"];
  content: string;
  toolName?: string;
  toolCallId?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
};

export type ChatAttachmentSourceView = {
  relativePath: string;
  attachment: ChatAttachmentView;
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
      id: input.id ?? randomUUID(),
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

  async listAttachmentReferencesByEmployeeId(employeeId: string): Promise<ChatAttachmentSourceView[]> {
    type AttachmentRow = {
      message_id: string;
      session_key: string;
      source_text: string;
      metadata_json: string;
    };
    const rows = await this.db(`${PLATFORM_TABLES.chatMessages} as messages`)
      .innerJoin(`${PLATFORM_TABLES.chatSessions} as sessions`, "messages.session_id", "sessions.id")
      .where("sessions.employee_id", employeeId)
      .andWhere("messages.role", "user")
      .orderBy("messages.created_at", "asc")
      .select<AttachmentRow[]>([
        "messages.id as message_id",
        "sessions.session_key as session_key",
        "messages.content as source_text",
        "messages.metadata_json as metadata_json"
      ]);
    const output: ChatAttachmentSourceView[] = [];
    for (const row of rows) {
      let metadata: Record<string, unknown> = {};
      try {
        metadata = row.metadata_json ? JSON.parse(row.metadata_json) as Record<string, unknown> : {};
      } catch {
        metadata = {};
      }
      const attachments = Array.isArray(metadata.attachments) ? metadata.attachments : [];
      for (const entry of attachments) {
        const attachment = normalizeChatAttachment(entry);
        if (!attachment) {
          continue;
        }
        output.push({
          relativePath: attachment.relativePath,
          attachment: {
            ...attachment,
            sourceText: attachment.sourceText ?? row.source_text,
            sourceSessionKey: attachment.sourceSessionKey ?? row.session_key,
            sourceMessageId: attachment.sourceMessageId ?? row.message_id
          }
        });
      }
    }
    return output;
  }
}
