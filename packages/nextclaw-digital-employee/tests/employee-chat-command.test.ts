import { describe, expect, it, vi } from "vitest";
import type { ChatSessionView } from "../server/repositories/chat-session-repository";
import { EmployeeRunService } from "../server/services/employee-run-service";

function createSessionView(params: {
  id: string;
  employeeId: string;
  sessionKey: string;
  title?: string;
  createdByUserId?: string | null;
}): ChatSessionView {
  return {
    id: params.id,
    employeeId: params.employeeId,
    sessionKey: params.sessionKey,
    title: params.title ?? "新对话",
    preview: "",
    messageCount: 0,
    createdByUserId: params.createdByUserId ?? null,
    updatedByUserId: params.createdByUserId ?? null,
    createdAt: "2026-01-01 00:00:00",
    updatedAt: "2026-01-01 00:00:00",
    lastMessageAt: null
  };
}

describe("EmployeeRunService conversation commands", () => {
  it("creates a fresh session for /new without invoking the engine or mutating the current session", async () => {
    const employee = {
      id: "emp-1",
      code: "chat-bot",
      name: "聊天助手",
      model: null
    };
    const existingSession = createSessionView({
      id: "session-old",
      employeeId: employee.id,
      sessionKey: "employee:emp-1:chat:old",
      title: "旧会话",
      createdByUserId: "user-1"
    });
    const createdSessions: ChatSessionView[] = [existingSession];
    const sessionRepo = {
      getByEmployeeIdAndSessionKey: vi.fn(async (employeeId: string, sessionKey: string) => (
        createdSessions.find((session) => session.employeeId === employeeId && session.sessionKey === sessionKey) ?? null
      )),
      create: vi.fn(async (params: { employeeId: string; sessionKey?: string; title?: string; createdByUserId?: string | null }) => {
        const session = createSessionView({
          id: `session-${createdSessions.length + 1}`,
          employeeId: params.employeeId,
          sessionKey: params.sessionKey ?? `generated-${createdSessions.length + 1}`,
          title: params.title,
          createdByUserId: params.createdByUserId ?? null
        });
        createdSessions.push(session);
        return session;
      })
    };
    const messageRepo = {
      createMany: vi.fn(async () => []),
      listBySessionId: vi.fn(async () => ({ items: [], nextCursor: null }))
    };
    const runRepo = {
      create: vi.fn(async () => ({ id: "run-1" })),
      listByEmployeeIdAndSessionKey: vi.fn(async () => [])
    };
    const gateway = {
      homeDir: "/tmp/nextclaw-home",
      workspaceDir: "/tmp/nextclaw-home/workspace",
      hasConfiguredProvider: vi.fn(() => true),
      runEmployeeTurn: vi.fn()
    };
    const service = new EmployeeRunService(
      {
        getById: vi.fn(async (employeeId: string) => (employeeId === employee.id ? employee : null))
      } as never,
      {} as never,
      runRepo as never,
      gateway as never,
      undefined,
      sessionRepo as never,
      messageRepo as never
    );

    const receivedEvents: string[] = [];
    const result = await service.streamChatTurn({
      employeeId: employee.id,
      message: "/new",
      sessionKey: existingSession.sessionKey,
      actorUserId: "user-1",
      onEvent: async (event) => {
        receivedEvents.push(event.event);
      }
    });

    expect(result.reply).toBe("");
    expect(result.sessionKey).not.toBe(existingSession.sessionKey);
    expect(receivedEvents).toEqual(["run_started", "done"]);
    expect(gateway.runEmployeeTurn).not.toHaveBeenCalled();
    expect(runRepo.create).not.toHaveBeenCalled();
    expect(messageRepo.createMany).not.toHaveBeenCalled();
    expect(createdSessions.map((session) => session.sessionKey)).toEqual([
      existingSession.sessionKey,
      result.sessionKey
    ]);
  });
});
