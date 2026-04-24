import { afterEach, describe, expect, it } from "vitest";
import { createLocalDraftChatSession } from "../app/lib/chat-post-run-refresh";
import {
  clearEmployeeChatStoreControllersForTest,
  createEmployeeChatStoreState,
  getOrCreateEmployeeChatStoreController
} from "../app/lib/employee-chat-store-controller";
import { clearChatRuntimeHandlesForTest } from "../app/lib/chat-runtime-registry";

afterEach(() => {
  clearEmployeeChatStoreControllersForTest();
  clearChatRuntimeHandlesForTest();
});

describe("EmployeeChatStoreController", () => {
  it("同一 employeeId 重建页面时复用同一份实时会话状态", () => {
    const sharedState = createEmployeeChatStoreState();
    const first = getOrCreateEmployeeChatStoreController("employee-1", sharedState);
    first.state.selectedSessionKey = "session-live";
    first.ensureSessionState("session-live").overlayMessages = [
      {
        id: "assistant-live",
        role: "assistant",
        content: "实时回复中",
        timestamp: "2026-04-24T10:00:00.000Z"
      }
    ];

    const second = getOrCreateEmployeeChatStoreController("employee-1", sharedState);

    expect(second).toBe(first);
    expect(second.getDisplayMessages().map((message) => message.id)).toEqual(["assistant-live"]);
  });

  it("切到历史会话再切回实时会话时保留原 overlay 消息", () => {
    const controller = getOrCreateEmployeeChatStoreController("employee-1", createEmployeeChatStoreState());
    controller.state.selectedSessionKey = "session-live";
    controller.ensureSessionState("session-live").overlayMessages = [
      {
        id: "assistant-live",
        role: "assistant",
        content: "这是进行中的实时内容",
        timestamp: "2026-04-24T10:00:00.000Z"
      }
    ];
    controller.ensureSessionState("session-history").persistedMessages = [
      {
        id: "persisted-history",
        role: "assistant",
        content: "历史内容",
        timestamp: "2026-04-24T09:00:00.000Z"
      }
    ];

    controller.state.selectedSessionKey = "session-history";
    expect(controller.getDisplayMessages().map((message) => message.id)).toEqual(["persisted-history"]);

    controller.state.selectedSessionKey = "session-live";
    expect(controller.getDisplayMessages().map((message) => message.id)).toEqual(["assistant-live"]);
  });

  it("草稿会话收到真实 sessionKey 后会原子迁移状态", () => {
    const controller = getOrCreateEmployeeChatStoreController("employee-1", createEmployeeChatStoreState());
    const draft = createLocalDraftChatSession("2026-04-24T10:00:00.000Z");
    controller.state.sessions = [draft];
    controller.state.selectedSessionKey = draft.sessionKey;
    controller.ensureSessionState(draft.sessionKey).overlayMessages = [
      {
        id: "optimistic-user",
        role: "user",
        content: "第一条消息",
        timestamp: "2026-04-24T10:00:01.000Z"
      }
    ];

    controller.rekeySessionState(draft.sessionKey, "employee:1:chat:real-session");

    expect(controller.state.selectedSessionKey).toBe("employee:1:chat:real-session");
    expect(controller.getSessionState(draft.sessionKey)).toBeNull();
    expect(controller.getDisplayMessages("employee:1:chat:real-session").map((message) => message.id)).toEqual(["optimistic-user"]);
    expect(controller.state.sessions[0]?.sessionKey).toBe("employee:1:chat:real-session");
  });
});