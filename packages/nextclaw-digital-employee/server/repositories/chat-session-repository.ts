import { randomUUID } from "node:crypto";
import type { Knex } from "knex";
import { PLATFORM_TABLES, type ChatSessionRecord } from "../db/schema";
import { dbNow } from "../db/knex";

export type ChatSessionView = {
  id: string;
  employeeId: string;
  sessionKey: string;
  title: string;
  preview: string;
  messageCount: number;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
};

export type ChatSessionPage = {
  items: ChatSessionView[];
  nextCursor: string | null;
};

type CursorToken = {
  updatedAt: string;
  id: string;
};

type ChatSessionListRow = ChatSessionRecord & {
  last_message_at?: string | null;
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
    if (typeof parsed.updatedAt !== "string" || typeof parsed.id !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function toView(record: ChatSessionListRow): ChatSessionView {
  return {
    id: record.id,
    employeeId: record.employee_id,
    sessionKey: record.session_key,
    title: record.title,
    preview: record.preview,
    messageCount: record.message_count,
    createdByUserId: record.created_by_user_id ?? null,
    updatedByUserId: record.updated_by_user_id ?? null,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    lastMessageAt: record.last_message_at ?? null
  };
}

function buildSessionTitle(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) {
    return "新对话";
  }
  return trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed;
}

function buildSessionPreview(message: string): string {
  const normalized = message.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return "";
  }
  return normalized.length > 120 ? `${normalized.slice(0, 120)}…` : normalized;
}

export class ChatSessionRepository {
  constructor(private readonly db: Knex) {}

  async create(params: {
    employeeId: string;
    sessionKey?: string;
    title?: string;
    createdByUserId?: string | null;
  }): Promise<ChatSessionView> {
    const now = dbNow();
    const sessionKey = params.sessionKey?.trim() || randomUUID();
    const title = params.title?.trim() || "新对话";
    const record: ChatSessionRecord = {
      id: randomUUID(),
      employee_id: params.employeeId,
      session_key: sessionKey,
      title,
      preview: "",
      message_count: 0,
      created_by_user_id: params.createdByUserId ?? null,
      updated_by_user_id: params.createdByUserId ?? null,
      created_at: now,
      updated_at: now
    };
    await this.db<ChatSessionRecord>(PLATFORM_TABLES.chatSessions).insert(record);
    return toView(record);
  }

  async getByEmployeeIdAndSessionKey(employeeId: string, sessionKey: string): Promise<ChatSessionView | null> {
    const row = await this.db<ChatSessionRecord>(PLATFORM_TABLES.chatSessions)
      .where({
        employee_id: employeeId,
        session_key: sessionKey
      })
      .first();
    return row ? toView(row) : null;
  }

  async listByEmployeeId(params: {
    employeeId: string;
    limit?: number;
    before?: string | null;
  }): Promise<ChatSessionPage> {
    const limit = Math.max(1, Math.min(params.limit ?? 30, 100));
    const before = decodeCursor(params.before);
    const lastMessageSubquery = this.db(PLATFORM_TABLES.chatMessages)
      .select("session_id")
      .max(`${PLATFORM_TABLES.chatMessages}.created_at as last_message_at`)
      .groupBy("session_id")
      .as("session_message_stats");
    let query = this.db<ChatSessionRecord>(PLATFORM_TABLES.chatSessions)
      .leftJoin(
        lastMessageSubquery,
        `${PLATFORM_TABLES.chatSessions}.id`,
        "session_message_stats.session_id"
      )
      .where(`${PLATFORM_TABLES.chatSessions}.employee_id`, params.employeeId)
      .select(`${PLATFORM_TABLES.chatSessions}.*`, "session_message_stats.last_message_at");
    if (before) {
      query = query.andWhere((builder) => {
        builder.where(`${PLATFORM_TABLES.chatSessions}.updated_at`, "<", before.updatedAt)
          .orWhere((nested) => {
            nested.where(`${PLATFORM_TABLES.chatSessions}.updated_at`, "=", before.updatedAt)
              .andWhere(`${PLATFORM_TABLES.chatSessions}.id`, "<", before.id);
          });
      });
    }
    const rows = (await query
      .orderBy(`${PLATFORM_TABLES.chatSessions}.updated_at`, "desc")
      .orderBy(`${PLATFORM_TABLES.chatSessions}.id`, "desc")
      .limit(limit + 1)) as ChatSessionListRow[];
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const nextSource = hasMore ? pageRows[pageRows.length - 1] : null;
    return {
      items: pageRows.map((row) => toView(row)),
      nextCursor: nextSource
        ? encodeCursor({
            updatedAt: nextSource.updated_at,
            id: nextSource.id
          })
        : null
    };
  }

  async touchWithMessage(params: {
    sessionId: string;
    messageCountIncrement: number;
    latestContent: string;
    titleSeed?: string;
    updatedByUserId?: string | null;
  }): Promise<void> {
    const existing = await this.db<ChatSessionRecord>(PLATFORM_TABLES.chatSessions)
      .where({ id: params.sessionId })
      .first();
    if (!existing) {
      throw new Error(`chat session not found: ${params.sessionId}`);
    }
    const nextTitle = existing.title === "新对话" && params.titleSeed?.trim()
      ? buildSessionTitle(params.titleSeed)
      : existing.title;
    const increment = Math.max(0, params.messageCountIncrement);
    await this.db<ChatSessionRecord>(PLATFORM_TABLES.chatSessions)
      .where({ id: params.sessionId })
      .update({
        title: nextTitle,
        preview: buildSessionPreview(params.latestContent),
        message_count: this.db.raw("message_count + ?", [increment]),
        updated_at: dbNow(),
        ...(params.updatedByUserId !== undefined ? { updated_by_user_id: params.updatedByUserId ?? null } : {})
      });
  }
}
