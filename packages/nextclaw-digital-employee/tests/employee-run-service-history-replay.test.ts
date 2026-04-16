import { describe, expect, it } from "vitest";
import { EmployeeRunService } from "../server/services/employee-run-service";

describe("EmployeeRunService history replay", () => {
  it("prefers stored event-level timeline order when replaying chat history", async () => {
    const employeeRepo = {
      async getById() {
        return {
          id: "employee-1",
          code: "chat-bot",
          name: "聊天助手",
          description: "",
          systemPrompt: "",
          model: "",
          status: "active",
          departmentId: null,
          createdAt: "",
          updatedAt: ""
        };
      }
    };
    const chatSessionRepo = {
      async getByEmployeeIdAndSessionKey() {
        return {
          id: "session-1",
          employeeId: "employee-1",
          sessionKey: "employee:employee-1:chat:session-1",
          title: "新对话",
          preview: "",
          messageCount: 2,
          createdAt: "2026-04-16 10:00:00",
          updatedAt: "2026-04-16 10:00:05"
        };
      }
    };
    const chatMessageRepo = {
      async listBySessionId() {
        return {
          items: [{
            id: "assistant-1",
            sessionId: "session-1",
            role: "assistant",
            content: "上海今天晴，26°C。",
            createdAt: "2026-04-16 10:00:05",
            metadata: {
              processTimeline: [
                { id: "r1", kind: "reasoning", timestamp: "2026-04-16T10:00:01.100Z", content: "第一步：读取上下文" },
                { id: "r2", kind: "reasoning", timestamp: "2026-04-16T10:00:01.700Z", content: "第二步：生成答案" },
                { id: "tc1", kind: "tool_call", timestamp: "2026-04-16T10:00:02.000Z", name: "weather.lookup", toolCallId: "call-weather-1", arguments: '{"city":"上海"}' },
                { id: "tr1", kind: "tool_result", timestamp: "2026-04-16T10:00:03.000Z", name: "weather.lookup", toolCallId: "call-weather-1", output: "晴，26°C" },
                { id: "reply-final", kind: "reply", timestamp: "2026-04-16T10:00:04.000Z", content: "上海今天晴，26°C。" }
              ],
              reasoning: "第一步：读取上下文\n第二步：生成答案",
              toolCalls: [{
                id: "call-weather-1",
                name: "weather.lookup",
                arguments: '{"city":"上海"}'
              }]
            }
          }],
          nextCursor: null
        };
      }
    };
    const runRepo = {
      async listByEmployeeIdAndSessionKey() {
        return [];
      }
    };

    const service = new EmployeeRunService(
      employeeRepo as any,
      {} as any,
      runRepo as any,
      {} as any,
      undefined,
      chatSessionRepo as any,
      chatMessageRepo as any
    );

    const result = await service.getChatMessages({
      employeeId: "employee-1",
      sessionKey: "employee:employee-1:chat:session-1",
      limit: 20
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.processTimeline).toEqual([
      expect.objectContaining({ kind: "reasoning", content: "第一步：读取上下文", timestamp: "2026-04-16T10:00:01.100Z" }),
      expect.objectContaining({ kind: "reasoning", content: "第二步：生成答案", timestamp: "2026-04-16T10:00:01.700Z" }),
      expect.objectContaining({ kind: "tool_call", name: "weather.lookup", arguments: '{"city":"上海"}', timestamp: "2026-04-16T10:00:02.000Z" }),
      expect.objectContaining({ kind: "tool_result", name: "weather.lookup", output: "晴，26°C", timestamp: "2026-04-16T10:00:03.000Z" }),
      expect.objectContaining({ kind: "reply", content: "上海今天晴，26°C。", timestamp: "2026-04-16T10:00:04.000Z" })
    ]);
  });
});