import { describe, expect, it } from "vitest";
import type { ChatMessageView } from "../shared/ui-models";
import { buildChatDisplayMessages } from "../app/lib/chat-message-groups";

describe("buildChatDisplayMessages", () => {
  it("keeps assistant reply status when grouping tool traces", () => {
    const grouped = buildChatDisplayMessages([
      {
        id: "assistant-1",
        role: "assistant",
        content: "",
        replyStatus: {
          value: "completed",
          label: "已完成",
          tone: "teal"
        }
      },
      {
        id: "tool-1",
        role: "tool",
        content: "晴，26°C",
        toolCallId: "call-1",
        toolName: "weather.lookup"
      }
    ]);

    expect(grouped).toEqual([
      expect.objectContaining({
        role: "assistant",
        replyStatus: expect.objectContaining({
          value: "completed",
          label: "已完成",
          tone: "teal"
        }),
        processTimeline: [
          expect.objectContaining({
            kind: "tool_result",
            name: "weather.lookup",
            output: "晴，26°C"
          })
        ],
        toolResults: [
          expect.objectContaining({
            name: "weather.lookup",
            output: "晴，26°C"
          })
        ]
      })
    ]);
  });

  it("merges assistant tool calls, tool results and final reply into one assistant block", () => {
    const messages: ChatMessageView[] = [
      {
        id: "user-1",
        role: "user",
        content: "今日重庆天气",
        timestamp: "2026-04-09T01:40:00.000Z"
      },
      {
        id: "assistant-1",
        role: "assistant",
        content: "",
        reasoning: "先查询天气服务",
        toolCalls: [{ id: "call-1", name: "exec", arguments: '{"query":"重庆天气"}' }],
        timestamp: "2026-04-09T01:40:01.000Z"
      },
      {
        id: "tool-1",
        role: "tool",
        content: "天气接口返回成功",
        toolName: "exec",
        toolCallId: "call-1",
        timestamp: "2026-04-09T01:40:02.000Z"
      },
      {
        id: "assistant-2",
        role: "assistant",
        content: "重庆天气 ☀️",
        timestamp: "2026-04-09T01:40:03.000Z"
      }
    ];

    const grouped = buildChatDisplayMessages(messages);
    expect(grouped).toHaveLength(2);
    expect(grouped[0]).toMatchObject({ role: "user", content: "今日重庆天气" });
    expect(grouped[1]).toMatchObject({
      role: "assistant",
      content: "重庆天气 ☀️",
      reasoning: "先查询天气服务"
    });
    expect(grouped[1].toolCalls).toHaveLength(1);
    expect(grouped[1].toolResults).toHaveLength(1);
    expect(grouped[1].toolSteps).toHaveLength(1);
    expect(grouped[1].toolSteps[0]).toMatchObject({
      name: "exec",
      call: { id: "call-1" },
      result: { toolCallId: "call-1", output: "天气接口返回成功" }
    });
    expect(grouped[1].toolResults[0]).toMatchObject({ name: "exec", output: "天气接口返回成功" });
    expect(grouped[1].processTimeline).toEqual([
      expect.objectContaining({ kind: "reasoning", content: "先查询天气服务" }),
      expect.objectContaining({ kind: "tool_call", name: "exec", arguments: '{"query":"重庆天气"}' }),
      expect.objectContaining({ kind: "tool_result", name: "exec", output: "天气接口返回成功" }),
      expect.objectContaining({ kind: "reply", content: "重庆天气 ☀️" })
    ]);
  });

  it("keeps separate user turns from different assistant groups", () => {
    const messages: ChatMessageView[] = [
      { id: "user-1", role: "user", content: "A", timestamp: "2026-04-09T01:40:00.000Z" },
      { id: "assistant-1", role: "assistant", content: "B", timestamp: "2026-04-09T01:40:01.000Z" },
      { id: "user-2", role: "user", content: "C", timestamp: "2026-04-09T01:41:00.000Z" },
      { id: "assistant-2", role: "assistant", content: "D", timestamp: "2026-04-09T01:41:01.000Z" }
    ];

    const grouped = buildChatDisplayMessages(messages);
    expect(grouped.map((item) => `${item.role}:${item.content}`)).toEqual([
      "user:A",
      "assistant:B",
      "user:C",
      "assistant:D"
    ]);
  });

  it("keeps user attachments when building display messages", () => {
    const grouped = buildChatDisplayMessages([
      {
        id: "user-attachment-1",
        role: "user",
        content: "请看附件",
        attachments: [{
          originalName: "报价单.pdf",
          storedName: "up_abc_报价单.pdf",
          relativePath: "uploadFile/2026-04-14/up_abc_报价单.pdf",
          mimeType: "application/pdf",
          size: 1024,
          previewType: "pdf",
          uploadDate: "2026-04-14"
        }]
      }
    ]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.attachments).toEqual([
      expect.objectContaining({
        originalName: "报价单.pdf",
        previewType: "pdf"
      })
    ]);
  });

  it("deduplicates repeated tool records while preserving the final assistant content", () => {
    const messages: ChatMessageView[] = [
      {
        id: "assistant-1",
        role: "assistant",
        content: "",
        toolCalls: [{ id: "call-1", name: "exec", arguments: '{"cmd":"weather"}' }],
        timestamp: "2026-04-09T01:40:01.000Z"
      },
      {
        id: "tool-1",
        role: "tool",
        content: "ok",
        toolName: "exec",
        toolCallId: "call-1",
        timestamp: "2026-04-09T01:40:02.000Z"
      },
      {
        id: "tool-2",
        role: "tool",
        content: "ok",
        toolName: "exec",
        toolCallId: "call-1",
        timestamp: "2026-04-09T01:40:02.500Z"
      },
      {
        id: "assistant-2",
        role: "assistant",
        content: "最终回答",
        timestamp: "2026-04-09T01:40:03.000Z"
      }
    ];

    const grouped = buildChatDisplayMessages(messages);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.content).toBe("最终回答");
    expect(grouped[0]?.toolResults).toHaveLength(1);
    expect(grouped[0]?.toolSteps).toHaveLength(1);
  });

  it("uses the latest assistant reply as final content while keeping earlier reply text in timeline", () => {
    const grouped = buildChatDisplayMessages([
      {
        id: "assistant-1",
        role: "assistant",
        content: "先给你一个草稿",
        reasoning: "先整理已知信息",
        timestamp: "2026-04-09T01:40:01.000Z"
      },
      {
        id: "assistant-2",
        role: "assistant",
        content: "最终答案",
        timestamp: "2026-04-09T01:40:03.000Z"
      }
    ]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.content).toBe("最终答案");
    expect(grouped[0]?.processTimeline).toEqual([
      expect.objectContaining({ kind: "reasoning", content: "先整理已知信息" }),
      expect.objectContaining({ kind: "reply", content: "先给你一个草稿" }),
      expect.objectContaining({ kind: "reply", content: "最终答案" })
    ]);
  });
});