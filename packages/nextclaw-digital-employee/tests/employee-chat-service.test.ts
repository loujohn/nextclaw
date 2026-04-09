import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ensurePlatformDatabase, createPlatformKnex } from "../server/db/knex";
import { EmployeeRepository } from "../server/repositories/employee-repository";
import { EmployeeSkillRepository } from "../server/repositories/employee-skill-repository";
import { RunRecordRepository } from "../server/repositories/run-record-repository";
import { ChatSessionRepository } from "../server/repositories/chat-session-repository";
import { ChatMessageRepository } from "../server/repositories/chat-message-repository";
import { NextclawEngineGateway } from "../server/engine/NextclawEngineGateway";
import { EmployeeRunService } from "../server/services/employee-run-service";

const tempDirs: string[] = [];

function createTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  vi.restoreAllMocks();
});

function buildGateway(homeDir: string, options?: {
  reply?: string;
  stallUntilAbort?: boolean;
}): NextclawEngineGateway {
  return new NextclawEngineGateway({
    homeDir,
    workspaceDir: join(homeDir, "workspace"),
    extensionRegistry: {
      tools: [],
      channels: [],
      diagnostics: [],
      engines: [
        {
          extensionId: "test.mock",
          source: "workspace",
          kind: "mock",
          factory: () => ({
            kind: "mock",
            supportsAbort: true,
            handleInbound: vi.fn(async () => null),
            processDirect: vi.fn(async (params: {
              abortSignal?: AbortSignal;
              onAssistantDelta?: (delta: string) => void;
            }) => {
              if (options?.stallUntilAbort) {
                params.onAssistantDelta?.("进行中");
                if (params.abortSignal?.aborted) {
                  throw new DOMException("aborted", "AbortError");
                }
                await new Promise<never>((_, reject) => {
                  params.abortSignal?.addEventListener("abort", () => {
                    reject(new DOMException("aborted", "AbortError"));
                  }, { once: true });
                });
              }
              params.onAssistantDelta?.("你好");
              return options?.reply ?? "你好，世界";
            }),
            applyRuntimeConfig: vi.fn()
          })
        }
      ]
    },
    defaultConfig: {
      agents: { defaults: { engine: "mock", model: "openai/gpt-5" } }
    }
  });
}

async function createService(homeDir: string, gateway = buildGateway(homeDir)) {
  const db = createPlatformKnex(join(homeDir, "platform.sqlite"));
  await ensurePlatformDatabase(db);
  const employeeRepo = new EmployeeRepository(db);
  const skillRepo = new EmployeeSkillRepository(db);
  const runRepo = new RunRecordRepository(db);
  const chatSessionRepo = new ChatSessionRepository(db);
  const chatMessageRepo = new ChatMessageRepository(db);
  const employee = await employeeRepo.create({
    name: "聊天助手",
    code: "chat-bot",
    description: "",
    systemPrompt: "你好"
  });
  return {
    db,
    employee,
    runRepo,
    chatSessionRepo,
    chatMessageRepo,
    service: new EmployeeRunService(
      employeeRepo,
      skillRepo,
      runRepo,
      gateway,
      undefined,
      chatSessionRepo,
      chatMessageRepo
    )
  };
}

describe("EmployeeRunService chat session persistence", () => {
  it("creates chat sessions and paginates stored messages", async () => {
    const homeDir = createTempDir("chat-session-");
    const { employee, service, chatMessageRepo } = await createService(homeDir);

    const session = await service.createChatSession(employee.id);
    await chatMessageRepo.createMany([
      { sessionId: session.id, role: "user", content: "第一条", createdAt: "2026-01-01T00:00:00.000Z" },
      { sessionId: session.id, role: "assistant", content: "第二条", createdAt: "2026-01-01T00:00:01.000Z" },
      { sessionId: session.id, role: "assistant", content: "第三条", createdAt: "2026-01-01T00:00:02.000Z" }
    ]);

    const firstPage = await service.getChatMessages({
      employeeId: employee.id,
      sessionKey: session.sessionKey,
      limit: 2
    });
    expect(firstPage.items.map((item) => item.content)).toEqual(["第二条", "第三条"]);
    expect(firstPage.nextCursor).toBeTruthy();

    const secondPage = await service.getChatMessages({
      employeeId: employee.id,
      sessionKey: session.sessionKey,
      limit: 2,
      before: firstPage.nextCursor
    });
    expect(secondPage.items.map((item) => item.content)).toEqual(["第一条"]);
  });

  it("paginates chat sessions by updated time and keeps ordering stable", async () => {
    const homeDir = createTempDir("chat-sessions-page-");
    const { employee, service, chatSessionRepo } = await createService(homeDir);

    const alpha = await chatSessionRepo.create({
      employeeId: employee.id,
      sessionKey: "session-alpha",
      title: "会话 A"
    });
    const beta = await chatSessionRepo.create({
      employeeId: employee.id,
      sessionKey: "session-beta",
      title: "会话 B"
    });
    const gamma = await chatSessionRepo.create({
      employeeId: employee.id,
      sessionKey: "session-gamma",
      title: "会话 C"
    });

    await chatSessionRepo.touchWithMessage({
      sessionId: alpha.id,
      messageCountIncrement: 1,
      latestContent: "A1"
    });
    await chatSessionRepo.touchWithMessage({
      sessionId: beta.id,
      messageCountIncrement: 1,
      latestContent: "B1"
    });
    await chatSessionRepo.touchWithMessage({
      sessionId: gamma.id,
      messageCountIncrement: 1,
      latestContent: "C1"
    });

    const firstPage = await service.listChatSessions({
      employeeId: employee.id,
      limit: 2
    });
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.items[0]?.sessionKey).toBe("session-gamma");
    expect(firstPage.items[1]?.sessionKey).toBe("session-beta");
    expect(firstPage.nextCursor).toBeTruthy();

    const secondPage = await service.listChatSessions({
      employeeId: employee.id,
      limit: 2,
      before: firstPage.nextCursor
    });
    expect(secondPage.items.map((item) => item.sessionKey)).toEqual(["session-alpha"]);
    expect(secondPage.nextCursor).toBeNull();
  });

  it("accepts URL-encoded session keys when loading chat messages", async () => {
    const homeDir = createTempDir("chat-session-encoded-");
    const { employee, service, chatMessageRepo } = await createService(homeDir);

    const session = await service.createChatSession(employee.id);
    await chatMessageRepo.createMany([
      { sessionId: session.id, role: "assistant", content: "已编码会话", createdAt: "2026-01-01T00:00:00.000Z" }
    ]);

    const result = await service.getChatMessages({
      employeeId: employee.id,
      sessionKey: encodeURIComponent(session.sessionKey),
      limit: 10
    });

    expect(result.session.sessionKey).toBe(session.sessionKey);
    expect(result.items.map((item) => item.content)).toEqual(["已编码会话"]);
  });

  it("streams chat events, persists messages, and marks aborted runs", async () => {
    const homeDir = createTempDir("chat-stream-");
    const gateway = buildGateway(homeDir, { stallUntilAbort: true });
    const { db, employee, service, runRepo } = await createService(homeDir, gateway);

    const events: string[] = [];
    const streamPromise = service.streamChatTurn({
      employeeId: employee.id,
      message: "开始执行",
      onEvent: async (event) => {
        events.push(event.event);
        if (event.event === "run_started") {
          const cancelResult = await service.cancelChatRun({
            employeeId: employee.id,
            runId: event.data.runId
          });
          expect(cancelResult.stopped).toBe(true);
        }
      }
    });

    const result = await streamPromise;
    expect(result.reply).toBe("进行中");
    expect(events).toContain("run_started");
    expect(events).toContain("reply_delta");
    expect(events).toContain("run_aborted");
    expect(events[events.length - 1]).toBe("done");

    const runs = await runRepo.listByEmployeeIdAndSessionKey({
      employeeId: employee.id,
      sessionKey: result.sessionKey,
      limit: 1
    });
    expect(runs[0]?.status).toBe("aborted");

    const messages = await service.getChatMessages({
      employeeId: employee.id,
      sessionKey: result.sessionKey,
      limit: 10
    });
    expect(messages.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: "assistant",
        content: "进行中",
        replyStatus: expect.objectContaining({
          value: "aborted",
          label: "已取消",
          tone: "amber"
        })
      })
    ]));

    const storedRows = await db("chat_messages")
      .select("role", "metadata_json")
      .where({ session_id: messages.session.id })
      .orderBy("created_at", "asc");
    expect(storedRows[0]?.role).toBe("user");
    expect(JSON.parse(storedRows[0]?.metadata_json ?? "{}")).toMatchObject({
      runId: expect.any(String),
      runStatus: "running"
    });
  });

});

describe("EmployeeRunService chat stream metadata", () => {
  it("streams reasoning and tool call linkage metadata for realtime chat", async () => {
    const homeDir = createTempDir("chat-stream-metadata-");
    const gateway = buildGateway(homeDir);
    vi.spyOn(gateway, "runEmployeeTurn").mockImplementation(async (params) => {
      params.onSessionEvent?.({
        type: "message",
        data: {
          message: {
            role: "assistant",
            content: "",
            reasoning_content: "先查询天气服务",
            tool_calls: [{
              id: "call-weather-1",
              function: {
                name: "weather.lookup",
                arguments: '{"city":"上海"}'
              }
            }]
          }
        }
      });
      params.onSessionEvent?.({
        type: "message",
        data: {
          message: {
            role: "tool",
            name: "weather.lookup",
            tool_call_id: "call-weather-1",
            content: "晴，26°C"
          }
        }
      });
      params.onAssistantDelta?.("上海今天晴，26°C。");
      return {
        sessionKey: params.sessionKey ?? `employee:${params.employeeId}:ui:direct:web`,
        reply: "上海今天晴，26°C。",
        events: [],
        newMessages: [
          {
            role: "assistant",
            content: "上海今天晴，26°C。",
            reasoning: "先查询天气服务",
            toolCalls: [{
              id: "call-weather-1",
              name: "weather.lookup",
              arguments: '{"city":"上海"}'
            }]
          },
          {
            role: "tool",
            content: "晴，26°C",
            toolCallId: "call-weather-1",
            toolName: "weather.lookup"
          }
        ]
      };
    });

    const receivedEvents: Array<{ event: string; data: Record<string, unknown> }> = [];
    await createService(homeDir, gateway).then(async ({ employee: currentEmployee, service }) => {
      await service.streamChatTurn({
        employeeId: currentEmployee.id,
        message: "上海天气怎么样？",
        onEvent: async (event) => {
          receivedEvents.push({ event: event.event, data: event.data as Record<string, unknown> });
        }
      });
    });

    expect(receivedEvents).toEqual(expect.arrayContaining([
      {
        event: "thinking",
        data: expect.objectContaining({
          content: "先查询天气服务"
        })
      },
      {
        event: "tool_call",
        data: expect.objectContaining({
          toolCallId: "call-weather-1",
          name: "weather.lookup"
        })
      },
      {
        event: "tool_result",
        data: expect.objectContaining({
          toolCallId: "call-weather-1",
          output: "晴，26°C"
        })
      }
    ]));
  });
});

describe("EmployeeRunService cancelled chat history", () => {
  it("keeps reasoning and tool traces in history after a cancelled chat turn", async () => {
    const homeDir = createTempDir("chat-stream-aborted-history-");
    const gateway = buildGateway(homeDir);
    vi.spyOn(gateway, "runEmployeeTurn").mockImplementation(async (params) => {
      params.onSessionEvent?.({
        type: "message",
        data: {
          message: {
            role: "assistant",
            content: "",
            reasoning_content: "先查询天气服务",
            tool_calls: [{
              id: "call-weather-1",
              function: {
                name: "weather.lookup",
                arguments: '{"city":"上海"}'
              }
            }]
          }
        }
      });
      params.onSessionEvent?.({
        type: "message",
        data: {
          message: {
            role: "tool",
            name: "weather.lookup",
            tool_call_id: "call-weather-1",
            content: "晴，26°C"
          }
        }
      });
      params.onAssistantDelta?.("上海今天晴，26°C。正在整理结果");
      if (params.abortSignal?.aborted) {
        throw new DOMException("aborted", "AbortError");
      }
      await new Promise<never>((_, reject) => {
        params.abortSignal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        }, { once: true });
      });
    });

    const { employee, service } = await createService(homeDir, gateway);
    const result = await service.streamChatTurn({
      employeeId: employee.id,
      message: "上海天气怎么样？",
      onEvent: async (event) => {
        if (event.event === "run_started") {
          await service.cancelChatRun({
            employeeId: employee.id,
            runId: event.data.runId
          });
        }
      }
    });

    expect(result.reply).toBe("上海今天晴，26°C。正在整理结果");

    const history = await service.getChatMessages({
      employeeId: employee.id,
      sessionKey: result.sessionKey,
      limit: 10
    });

    expect(history.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: "assistant",
        content: "上海今天晴，26°C。正在整理结果",
        replyStatus: expect.objectContaining({
          value: "aborted",
          label: "已取消",
          tone: "amber"
        }),
        reasoning: "先查询天气服务",
        toolCalls: [
          expect.objectContaining({
            id: "call-weather-1",
            name: "weather.lookup",
            arguments: '{"city":"上海"}'
          })
        ]
      }),
      expect.objectContaining({
        role: "tool",
        content: "晴，26°C",
        toolCallId: "call-weather-1",
        toolName: "weather.lookup"
      })
    ]));
  });

});

describe("EmployeeRunService scheduled chat persistence", () => {
  it("persists scheduled runs into chat sessions when session metadata is provided", async () => {
    const homeDir = createTempDir("scheduled-chat-session-");
    const { employee, service, runRepo } = await createService(homeDir);
    const sessionKey = `employee:${employee.id}:scheduled:job:daily-sync`;

    const result = await service.runEmployeeTurn({
      employeeId: employee.id,
      message: "请执行每日同步任务并给出摘要",
      triggerType: "scheduled",
      triggerSource: "daily-sync",
      sessionKey,
      sessionTitle: "定时任务 · 每日同步"
    });

    expect(result.sessionKey).toBe(sessionKey);

    const runs = await runRepo.listByEmployeeIdAndSessionKey({
      employeeId: employee.id,
      sessionKey,
      limit: 1
    });
    expect(runs[0]?.sessionKey).toBe(sessionKey);

    const sessions = await service.listChatSessions({ employeeId: employee.id, limit: 10 });
    expect(sessions.items.some((session) => session.sessionKey === sessionKey && session.title === "定时任务 · 每日同步")).toBe(true);

    const messages = await service.getChatMessages({
      employeeId: employee.id,
      sessionKey,
      limit: 10
    });
    expect(messages.items.map((item) => item.content)).toContain("请执行每日同步任务并给出摘要");
    expect(messages.items.some((item) => item.role === "assistant" && item.content.includes("你好，世界"))).toBe(true);
  });
});
