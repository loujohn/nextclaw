import { describe, expect, it } from "vitest";
import {
  mergePersistedAndOverlay,
  prunePersistedMatchesFromOverlay
} from "../app/lib/chat-message-merge";

describe("mergePersistedAndOverlay", () => {
  it("保留实时 overlay 中尚未持久化的流式 assistant 消息", () => {
    const merged = mergePersistedAndOverlay([
      {
        id: "persisted-user",
        role: "user",
        content: "你好",
        timestamp: "2026-04-24T10:00:00.000Z"
      }
    ], [
      {
        id: "overlay-assistant",
        role: "assistant",
        content: "正在思考中",
        timestamp: "2026-04-24T10:00:05.000Z"
      }
    ]);

    expect(merged.map((message) => message.id)).toEqual([
      "persisted-user",
      "overlay-assistant"
    ]);
  });

  it("终态历史已落库后移除等价 overlay，避免重复展示", () => {
    const overlayMessages = [
      {
        id: "local-user",
        role: "user" as const,
        content: "请总结本周进展",
        timestamp: "2026-04-24T10:00:00.000Z"
      },
      {
        id: "local-assistant",
        role: "assistant" as const,
        content: "本周完成 3 个模块上线。",
        timestamp: "2026-04-24T10:00:06.000Z"
      }
    ];

    const pruned = prunePersistedMatchesFromOverlay([
      {
        id: "persisted-user",
        role: "user",
        content: "请总结本周进展",
        timestamp: "2026-04-24T10:00:01.000Z"
      },
      {
        id: "persisted-assistant",
        role: "assistant",
        content: "本周完成 3 个模块上线。",
        timestamp: "2026-04-24T10:00:07.000Z"
      }
    ], overlayMessages);

    expect(pruned).toEqual([]);
  });

  it("上翻历史只扩展 persisted 区，不影响实时 overlay", () => {
    const merged = mergePersistedAndOverlay([
      {
        id: "persisted-older",
        role: "assistant",
        content: "更早的历史消息",
        timestamp: "2026-04-24T09:50:00.000Z"
      },
      {
        id: "persisted-latest",
        role: "user",
        content: "最近一条历史消息",
        timestamp: "2026-04-24T09:59:00.000Z"
      }
    ], [
      {
        id: "overlay-assistant",
        role: "assistant",
        content: "实时中的回复",
        timestamp: "2026-04-24T10:00:00.000Z"
      }
    ]);

    expect(merged.map((message) => message.id)).toEqual([
      "persisted-older",
      "persisted-latest",
      "overlay-assistant"
    ]);
  });
});