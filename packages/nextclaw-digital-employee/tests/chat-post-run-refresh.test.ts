import { describe, expect, it, vi } from "vitest";
import {
  createLocalDraftChatSession,
  isDraftChatSessionKey,
  refreshChatAfterRun,
  shouldCommitLocalChatSessionUpdate,
  upsertLocalChatSession
} from "../app/lib/chat-post-run-refresh";

describe("refreshChatAfterRun", () => {
  it("附属刷新失败时返回失败项，不触发聊天区重拉", async () => {
    const refreshEmployee = vi.fn(async () => undefined);
    const refreshRuns = vi.fn(async () => {
      throw new Error("runs failed");
    });

    const failedRefreshes = await refreshChatAfterRun({
      refreshEmployee,
      refreshRuns
    });

    expect(failedRefreshes).toEqual(["运行记录"]);
  });

  it("等待附属刷新完成并保持调用顺序可预测", async () => {
    const order: string[] = [];
    const refreshEmployee = vi.fn(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
      order.push("refreshEmployee");
    });
    const refreshRuns = vi.fn(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
      order.push("refreshRuns");
    });

    await refreshChatAfterRun({
      refreshEmployee,
      refreshRuns
    });

    expect(order).toEqual(["refreshEmployee", "refreshRuns"]);
  });
});

describe("upsertLocalChatSession", () => {
  it("更新现有会话并将其移动到列表顶部，不依赖重新拉取", () => {
    const result = upsertLocalChatSession({
      sessions: [
        {
          sessionKey: "session-a",
          title: "旧标题",
          preview: "旧预览",
          messageCount: 2,
          createdAt: "2026-04-08T10:00:00.000Z",
          updatedAt: "2026-04-08T10:00:00.000Z",
          lastMessageAt: "2026-04-08T10:00:00.000Z"
        },
        {
          sessionKey: "session-b",
          title: "其他会话",
          preview: "保留",
          messageCount: 1,
          createdAt: "2026-04-08T09:00:00.000Z",
          updatedAt: "2026-04-08T09:00:00.000Z",
          lastMessageAt: "2026-04-08T09:00:00.000Z"
        }
      ],
      sessionKey: "session-a",
      latestContent: "新的最后一条消息",
      occurredAt: "2026-04-08T11:00:00.000Z",
      titleSeed: "新的第一句话",
      messageCountIncrement: 2
    });

    expect(result[0]?.sessionKey).toBe("session-a");
    expect(result[0]?.preview).toBe("新的最后一条消息");
    expect(result[0]?.messageCount).toBe(4);
    expect(result[1]?.sessionKey).toBe("session-b");
  });

  it("找不到会话时直接在本地插入新会话", () => {
    const result = upsertLocalChatSession({
      sessions: [],
      sessionKey: "session-new",
      latestContent: "第一条消息",
      occurredAt: "2026-04-08T11:30:00.000Z",
      titleSeed: "第一条消息",
      messageCountIncrement: 1
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.sessionKey).toBe("session-new");
    expect(result[0]?.title).toBe("第一条消息");
  });

  it("发送第一条消息后用真实 sessionKey 替换本地草稿会话", () => {
    const draft = createLocalDraftChatSession("2026-04-08T11:20:00.000Z");

    const result = upsertLocalChatSession({
      sessions: [draft],
      sessionKey: "employee:1:chat:real-session",
      previousSessionKey: draft.sessionKey,
      latestContent: "第一条真实消息",
      occurredAt: "2026-04-08T11:30:00.000Z",
      titleSeed: "第一条真实消息",
      messageCountIncrement: 1
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.sessionKey).toBe("employee:1:chat:real-session");
    expect(result[0]?.isDraft).toBe(false);
    expect(result[0]?.messageCount).toBe(1);
  });
});

describe("draft chat sessions", () => {
  it("本地草稿会话使用前端临时 key 标识", () => {
    const draft = createLocalDraftChatSession("2026-04-08T11:20:00.000Z");

    expect(isDraftChatSessionKey(draft.sessionKey)).toBe(true);
    expect(draft.title).toBe("新对话");
    expect(draft.messageCount).toBe(0);
  });
});

describe("shouldCommitLocalChatSessionUpdate", () => {
  it("只在 completed 或 aborted 时允许本地提交会话更新", () => {
    expect(shouldCommitLocalChatSessionUpdate("completed")).toBe(true);
    expect(shouldCommitLocalChatSessionUpdate("aborted")).toBe(true);
    expect(shouldCommitLocalChatSessionUpdate("failed")).toBe(false);
    expect(shouldCommitLocalChatSessionUpdate("running")).toBe(false);
    expect(shouldCommitLocalChatSessionUpdate(undefined)).toBe(false);
  });
});