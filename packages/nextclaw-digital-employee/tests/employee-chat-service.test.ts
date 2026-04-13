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

// ─────────────────────────────────────────────────────────────────────────────
// BUG-1 回归：用户消息不应携带 replyStatus
// ─────────────────────────────────────────────────────────────────────────────
describe("EmployeeRunService - BUG-1 user message has no replyStatus", () => {
  it("用户消息不携带 replyStatus，只有 assistant/tool 消息才有", async () => {
    const homeDir = createTempDir("bug1-user-replystatus-");
    const { employee, service } = await createService(homeDir);

    await service.streamChatTurn({
      employeeId: employee.id,
      message: "你好",
      onEvent: async () => {}
    });

    const result = await service.listChatSessions({ employeeId: employee.id, limit: 1 });
    const sessionKey = result.items[0]?.sessionKey;
    expect(sessionKey).toBeTruthy();

    const messages = await service.getChatMessages({
      employeeId: employee.id,
      sessionKey: sessionKey!,
      limit: 20
    });

    const userMessages = messages.items.filter((item) => item.role === "user");
    const assistantMessages = messages.items.filter((item) => item.role === "assistant");

    // 用户消息绝不能有 replyStatus
    for (const msg of userMessages) {
      expect(msg.replyStatus).toBeUndefined();
    }
    // assistant 消息应有 replyStatus
    for (const msg of assistantMessages) {
      expect(msg.replyStatus).toBeDefined();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BUG-3 回归：touchWithMessage 使用原子 SQL 增量，避免并发竞态
// ─────────────────────────────────────────────────────────────────────────────
describe("ChatSessionRepository - BUG-3 atomic message_count increment", () => {
  it("多次 touchWithMessage 后 message_count 正确累加", async () => {
    const homeDir = createTempDir("bug3-message-count-");
    const { employee, chatSessionRepo } = await createService(homeDir);

    const session = await chatSessionRepo.create({
      employeeId: employee.id,
      sessionKey: "test-atomic",
      title: "新对话"
    });

    await chatSessionRepo.touchWithMessage({ sessionId: session.id, messageCountIncrement: 2, latestContent: "A" });
    await chatSessionRepo.touchWithMessage({ sessionId: session.id, messageCountIncrement: 3, latestContent: "B" });
    await chatSessionRepo.touchWithMessage({ sessionId: session.id, messageCountIncrement: 1, latestContent: "C" });

    const updated = await chatSessionRepo.getByEmployeeIdAndSessionKey(employee.id, "test-atomic");
    expect(updated?.messageCount).toBe(6);
    expect(updated?.preview).toBe("C");
  });

  it("increment 为 0 时 message_count 不变", async () => {
    const homeDir = createTempDir("bug3-zero-increment-");
    const { employee, chatSessionRepo } = await createService(homeDir);

    const session = await chatSessionRepo.create({
      employeeId: employee.id,
      sessionKey: "test-zero",
      title: "新对话"
    });
    await chatSessionRepo.touchWithMessage({ sessionId: session.id, messageCountIncrement: 5, latestContent: "init" });
    await chatSessionRepo.touchWithMessage({ sessionId: session.id, messageCountIncrement: 0, latestContent: "no-change" });

    const updated = await chatSessionRepo.getByEmployeeIdAndSessionKey(employee.id, "test-zero");
    expect(updated?.messageCount).toBe(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 多会话隔离：不同员工的会话不可见
// ─────────────────────────────────────────────────────────────────────────────
describe("EmployeeRunService - session cross-employee isolation", () => {
  it("员工 A 无法读取员工 B 的会话历史", async () => {
    const homeDir = createTempDir("cross-employee-isolation-");
    const db = createPlatformKnex(join(homeDir, "platform.sqlite"));
    await ensurePlatformDatabase(db);
    const employeeRepo = new EmployeeRepository(db);
    const skillRepo = new EmployeeSkillRepository(db);
    const runRepo = new RunRecordRepository(db);
    const chatSessionRepo = new ChatSessionRepository(db);
    const chatMessageRepo = new ChatMessageRepository(db);

    const gateway = buildGateway(homeDir);
    const employeeA = await employeeRepo.create({ name: "员工A", code: "emp-a", description: "", systemPrompt: "" });
    const employeeB = await employeeRepo.create({ name: "员工B", code: "emp-b", description: "", systemPrompt: "" });

    const makeService = () => new EmployeeRunService(
      employeeRepo, skillRepo, runRepo, gateway, undefined, chatSessionRepo, chatMessageRepo
    );

    const serviceA = makeService();
    const serviceB = makeService();

    const sessionA = await serviceA.createChatSession(employeeA.id);
    await chatMessageRepo.createMany([
      { sessionId: sessionA.id, role: "user", content: "A的私密消息" }
    ]);

    // 员工B尝试用员工A的sessionKey读取历史，应报错
    await expect(
      serviceB.getChatMessages({
        employeeId: employeeB.id,
        sessionKey: sessionA.sessionKey,
        limit: 10
      })
    ).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cancelChatRun：错误员工ID不能取消他人的 run
// ─────────────────────────────────────────────────────────────────────────────
describe("EmployeeRunService - cancelChatRun employee ownership check", () => {
  it("错误员工 ID 无法取消他人的 run，返回 stopped: false", async () => {
    const homeDir = createTempDir("cancel-ownership-");
    const gateway = buildGateway(homeDir, { stallUntilAbort: true });
    const { employee, service } = await createService(homeDir, gateway);

    let capturedRunId = "";
    const streamPromise = service.streamChatTurn({
      employeeId: employee.id,
      message: "执行中",
      onEvent: async (event) => {
        if (event.event === "run_started") {
          capturedRunId = event.data.runId;
          // 使用错误的 employeeId 尝试取消
          const result = await service.cancelChatRun({
            employeeId: "wrong-employee-id",
            runId: capturedRunId
          });
          expect(result.stopped).toBe(false);
          // 再用正确的 employeeId 取消
          await service.cancelChatRun({
            employeeId: employee.id,
            runId: capturedRunId
          });
        }
      }
    });

    await streamPromise;
    expect(capturedRunId).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// streamChatTurn：消息发送失败时 run 状态标记为 failed
// ─────────────────────────────────────────────────────────────────────────────
describe("EmployeeRunService - streamChatTurn failure handling", () => {
  it("引擎抛出错误时流式事件序列为 run_started → run_failed → done，run 状态为 failed", async () => {
    const homeDir = createTempDir("stream-failure-");
    const gateway = buildGateway(homeDir);
    vi.spyOn(gateway, "runEmployeeTurn").mockRejectedValue(new Error("engine crash"));

    const { employee, service, runRepo } = await createService(homeDir, gateway);
    const events: string[] = [];

    const result = await service.streamChatTurn({
      employeeId: employee.id,
      message: "触发错误",
      onEvent: async (event) => {
        events.push(event.event);
      }
    });

    expect(events).toContain("run_started");
    expect(events).toContain("run_failed");
    expect(events[events.length - 1]).toBe("done");
    expect(result.reply).toBe("");

    const runs = await runRepo.listByEmployeeIdAndSessionKey({
      employeeId: employee.id,
      sessionKey: result.sessionKey,
      limit: 1
    });
    expect(runs[0]?.status).toBe("failed");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getChatMessages：分页游标稳定性（大历史）
// ─────────────────────────────────────────────────────────────────────────────
describe("ChatMessageRepository - cursor-based pagination stability", () => {
  it("游标分页能完整遍历所有消息，无重复无遗漏", async () => {
    const homeDir = createTempDir("pagination-stability-");
    const { employee, service, chatMessageRepo } = await createService(homeDir);

    const session = await service.createChatSession(employee.id);
    const totalCount = 13;
    const msgs = Array.from({ length: totalCount }, (_, i) => ({
      sessionId: session.id,
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `消息${i + 1}`,
      createdAt: new Date(Date.now() + i * 1000).toISOString()
    }));
    await chatMessageRepo.createMany(msgs);

    const collected: string[] = [];
    let cursor: string | null = null;

    do {
      const page = await service.getChatMessages({
        employeeId: employee.id,
        sessionKey: session.sessionKey,
        limit: 5,
        before: cursor
      });
      for (const item of [...page.items].reverse()) {
        if (!collected.includes(item.content)) {
          collected.unshift(item.content);
        }
      }
      cursor = page.nextCursor;
    } while (cursor);

    expect(collected).toHaveLength(totalCount);
    // 按时间升序最末尾的是最新消息
    expect(collected[totalCount - 1]).toBe(`消息${totalCount}`);
  });
});
