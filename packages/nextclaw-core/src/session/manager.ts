import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { safeFilename, getSessionsPath } from "../utils/helpers.js";

export type SessionMessage = {
  role: string;
  content: unknown;
  timestamp: string;
  [key: string]: unknown;
};

export type SessionEvent = {
  seq: number;
  type: string;
  timestamp: string;
  data: Record<string, unknown>;
};

export type Session = {
  key: string;
  messages: SessionMessage[];
  events: SessionEvent[];
  nextSeq: number;
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toIsoString(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return new Date(parsed).toISOString();
}

export class SessionManager {
  private sessionsDir: string;
  private cache: Map<string, Session> = new Map();
  readonly idleTimeoutMs: number;

  constructor(private workspace: string, options?: { idleTimeoutMs?: number }) {
    this.sessionsDir = getSessionsPath();
    this.idleTimeoutMs = options?.idleTimeoutMs ?? 4 * 60 * 60 * 1000;
  }

  private getSessionPath(key: string): string {
    const safeKey = safeFilename(key.replace(/:/g, "_"));
    return join(this.sessionsDir, `${safeKey}.jsonl`);
  }

  getOrCreate(key: string): Session {
    const cached = this.cache.get(key);
    if (cached) {
      if (this.shouldReset(cached)) {
        this.archiveAndReset(cached);
      }
      return cached;
    }
    const loaded = this.load(key);
    const session = loaded ?? {
      key,
      messages: [],
      events: [],
      nextSeq: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {}
    };
    if (loaded && this.shouldReset(session)) {
      this.archiveAndReset(session);
    }
    this.cache.set(key, session);
    return session;
  }

  private shouldReset(session: Session): boolean {
    if (session.messages.length === 0) return false;
    const lastActivity = session.updatedAt.getTime();
    const now = Date.now();
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    if (lastActivity < dayStart.getTime()) return true;
    const idleTimeoutMs = this.idleTimeoutMs;
    if (idleTimeoutMs > 0 && (now - lastActivity) > idleTimeoutMs) return true;
    return false;
  }

  private archiveAndReset(session: Session): void {
    if (session.events.length > 0) {
      const dateStr = session.updatedAt.toISOString().slice(0, 10);
      const archivePath = this.getSessionPath(`${session.key}__archive__${dateStr}__${Date.now()}`);
      try {
        const metadataLine = {
          _type: "metadata",
          created_at: session.createdAt.toISOString(),
          updated_at: session.updatedAt.toISOString(),
          metadata: { ...session.metadata, archived: true, originalKey: session.key }
        };
        const eventLines = session.events.map((event) =>
          JSON.stringify({ _type: "event", seq: event.seq, type: event.type, timestamp: event.timestamp, data: event.data })
        );
        writeFileSync(archivePath, [JSON.stringify(metadataLine), ...eventLines].join("\n") + "\n");
      } catch (err) {
        console.error(`[SessionManager] Failed to archive session "${session.key}":`, err);
      }
    }
    session.messages = [];
    session.events = [];
    session.nextSeq = 1;
    session.createdAt = new Date();
    session.updatedAt = new Date();
    this.save(session);
  }

  getIfExists(key: string): Session | null {
    const cached = this.cache.get(key);
    if (cached) {
      return cached;
    }
    const loaded = this.load(key);
    if (loaded) {
      this.cache.set(key, loaded);
    }
    return loaded;
  }

  appendEvent(
    session: Session,
    params: {
      type: string;
      data?: Record<string, unknown>;
      timestamp?: string;
    }
  ): SessionEvent {
    const timestamp = toIsoString(params.timestamp, new Date().toISOString());
    const event: SessionEvent = {
      seq: session.nextSeq,
      type: params.type,
      timestamp,
      data: params.data ?? {}
    };
    session.nextSeq += 1;
    session.events.push(event);

    const projected = this.projectMessageFromEvent(event);
    if (projected) {
      session.messages.push(projected);
    }

    session.updatedAt = new Date(timestamp);
    return event;
  }

  addMessage(session: Session, role: string, content: unknown, extra: Record<string, unknown> = {}): SessionEvent {
    const msg: SessionMessage = {
      role,
      content,
      timestamp: new Date().toISOString(),
      ...extra
    };

    const eventType = this.resolveMessageEventType(msg);
    return this.appendEvent(session, {
      type: eventType,
      timestamp: msg.timestamp,
      data: { message: msg }
    });
  }

  getHistory(session: Session, maxMessages = 50): Array<Record<string, unknown>> {
    const recent = session.messages.length > maxMessages ? session.messages.slice(-maxMessages) : session.messages;
    const normalized = this.normalizeHistoryWindow(recent);
    return normalized.map((msg) => {
      const entry: Record<string, unknown> = {
        role: msg.role,
        content: msg.content
      };
      if (typeof msg.name === "string") {
        entry.name = msg.name;
      }
      if (typeof msg.tool_call_id === "string") {
        entry.tool_call_id = msg.tool_call_id;
      }
      if (Array.isArray(msg.tool_calls)) {
        entry.tool_calls = msg.tool_calls;
      }
      if (typeof msg.reasoning_content === "string" && msg.reasoning_content) {
        entry.reasoning_content = msg.reasoning_content;
      }
      return entry;
    });
  }

  private normalizeHistoryWindow(messages: SessionMessage[]): SessionMessage[] {
    const normalized: SessionMessage[] = [];
    let pendingToolCalls: { expectedIds: Set<string>; blockStart: number } | null = null;

    for (const msg of messages) {
      const role = typeof msg.role === "string" ? msg.role : "";

      if (pendingToolCalls && role !== "tool") {
        if (pendingToolCalls.expectedIds.size > 0) {
          normalized.splice(pendingToolCalls.blockStart);
        }
        pendingToolCalls = null;
      }

      if (role === "assistant") {
        normalized.push(msg);

        const expectedIds = new Set<string>();
        if (Array.isArray(msg.tool_calls)) {
          for (const call of msg.tool_calls as Array<Record<string, unknown>>) {
            const callId = typeof call.id === "string" ? call.id.trim() : "";
            if (callId) {
              expectedIds.add(callId);
            }
          }
        }

        if (expectedIds.size > 0) {
          pendingToolCalls = {
            expectedIds,
            blockStart: normalized.length - 1
          };
        }
        continue;
      }

      if (role === "tool") {
        if (!pendingToolCalls) {
          continue;
        }
        const callId = typeof msg.tool_call_id === "string" ? msg.tool_call_id.trim() : "";
        if (!callId || !pendingToolCalls.expectedIds.has(callId)) {
          continue;
        }
        normalized.push(msg);
        pendingToolCalls.expectedIds.delete(callId);
        if (pendingToolCalls.expectedIds.size === 0) {
          pendingToolCalls = null;
        }
        continue;
      }

      normalized.push(msg);
    }

    if (pendingToolCalls && pendingToolCalls.expectedIds.size > 0) {
      normalized.splice(pendingToolCalls.blockStart);
    }

    return normalized;
  }

  clear(session: Session): void {
    session.events = [];
    session.messages = [];
    session.nextSeq = 1;
    session.updatedAt = new Date();
  }

  private projectMessageFromEvent(event: SessionEvent): SessionMessage | null {
    const source = isRecord(event.data.message)
      ? event.data.message
      : isRecord(event.data)
        ? event.data
        : null;
    if (!source) {
      return null;
    }

    const role = typeof source.role === "string" ? source.role : "";
    if (!role) {
      return null;
    }

    const timestamp = toIsoString(source.timestamp, event.timestamp);
    return {
      ...source,
      role,
      timestamp,
      content: Object.prototype.hasOwnProperty.call(source, "content") ? source.content : ""
    };
  }

  private resolveMessageEventType(message: SessionMessage): string {
    const role = typeof message.role === "string" ? message.role.trim().toLowerCase() : "";
    if (role === "assistant" && Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
      return "assistant.tool_call";
    }
    if (role === "tool") {
      return "tool.result";
    }
    if (role === "assistant") {
      return "message.assistant";
    }
    if (role === "user") {
      return "message.user";
    }
    if (role === "system") {
      return "message.system";
    }
    return `message.${role || "other"}`;
  }

  private load(key: string): Session | null {
    const path = this.getSessionPath(key);
    if (!existsSync(path)) {
      return null;
    }
    try {
      const lines = readFileSync(path, "utf-8").split("\n").filter(Boolean);
      const events: SessionEvent[] = [];
      let metadata: Record<string, unknown> = {};
      let createdAt = new Date();
      let updatedAt = new Date();
      let fallbackSeq = 1;

      for (const line of lines) {
        const data = JSON.parse(line) as Record<string, unknown>;
        if (data._type === "metadata") {
          metadata = (data.metadata as Record<string, unknown>) ?? {};
          if (data.created_at) {
            createdAt = new Date(String(data.created_at));
          }
          if (data.updated_at) {
            updatedAt = new Date(String(data.updated_at));
          }
          continue;
        }

        if (data._type === "event") {
          const rawSeq = Number(data.seq);
          const seq = Number.isFinite(rawSeq) && rawSeq > 0 ? Math.trunc(rawSeq) : fallbackSeq;
          const timestamp = toIsoString(data.timestamp, new Date().toISOString());
          const type = typeof data.type === "string" && data.type.trim() ? data.type.trim() : "message.other";
          const payload = isRecord(data.data) ? data.data : {};
          events.push({ seq, type, timestamp, data: payload });
          fallbackSeq = Math.max(fallbackSeq, seq + 1);
          continue;
        }

        // Legacy transcript line (message-only): migrate in-memory to event format.
        const legacyRole = typeof data.role === "string" ? data.role : "assistant";
        const legacyTimestamp = toIsoString(data.timestamp, new Date().toISOString());
        const message = {
          ...data,
          role: legacyRole,
          timestamp: legacyTimestamp,
          content: Object.prototype.hasOwnProperty.call(data, "content") ? data.content : ""
        } as SessionMessage;
        const type = this.resolveMessageEventType(message);
        events.push({
          seq: fallbackSeq,
          type,
          timestamp: legacyTimestamp,
          data: { message }
        });
        fallbackSeq += 1;
      }

      events.sort((left, right) => {
        if (left.seq !== right.seq) {
          return left.seq - right.seq;
        }
        return Date.parse(left.timestamp) - Date.parse(right.timestamp);
      });

      const messages = events
        .map((event) => this.projectMessageFromEvent(event))
        .filter((message): message is SessionMessage => Boolean(message));

      const latestTs = events.length > 0 ? events[events.length - 1]?.timestamp : null;
      if (latestTs) {
        updatedAt = new Date(latestTs);
      }
      const nextSeq = events.reduce((maxSeq, event) => Math.max(maxSeq, event.seq), 0) + 1;

      return {
        key,
        messages,
        events,
        nextSeq,
        createdAt,
        updatedAt,
        metadata
      };
    } catch {
      return null;
    }
  }

  save(session: Session): void {
    const path = this.getSessionPath(session.key);
    const metadataLine = {
      _type: "metadata",
      created_at: session.createdAt.toISOString(),
      updated_at: session.updatedAt.toISOString(),
      metadata: session.metadata
    };
    const eventLines = session.events.map((event) =>
      JSON.stringify({
        _type: "event",
        seq: event.seq,
        type: event.type,
        timestamp: event.timestamp,
        data: event.data
      })
    );
    const lines = [JSON.stringify(metadataLine), ...eventLines].join("\n");
    writeFileSync(path, `${lines}\n`);
    this.cache.set(session.key, session);
  }

  delete(key: string): boolean {
    this.cache.delete(key);
    const path = this.getSessionPath(key);
    if (existsSync(path)) {
      unlinkSync(path);
      return true;
    }
    return false;
  }

  listSessions(): Array<Record<string, unknown>> {
    const sessions: Array<Record<string, unknown>> = [];
    for (const entry of readdirSync(this.sessionsDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) {
        continue;
      }
      const path = join(this.sessionsDir, entry.name);
      const firstLine = readFileSync(path, "utf-8").split("\n")[0];
      if (!firstLine) {
        continue;
      }
      try {
        const data = JSON.parse(firstLine) as Record<string, unknown>;
        if (data._type === "metadata") {
          sessions.push({
            key: entry.name.replace(/\.jsonl$/, "").replace(/_/g, ":"),
            created_at: data.created_at,
            updated_at: data.updated_at,
            path,
            metadata: data.metadata ?? {}
          });
        }
      } catch {
        continue;
      }
    }
    return sessions;
  }
}
