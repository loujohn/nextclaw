import { describe, expect, it } from "vitest";
import {
  resolveInitialChatSelection,
  shouldDeferInitialMessageLoadToWatcher
} from "../app/lib/chat-session-bootstrap";

describe("resolveInitialChatSelection", () => {
  it("空会话列表时不默认创建或选择新会话", () => {
    expect(resolveInitialChatSelection({
      activeSessionKey: "",
      sessions: []
    })).toEqual({
      sessionKey: "",
      shouldLoadMessages: false
    });
  });

  it("当前会话仍存在时保持当前选中", () => {
    expect(resolveInitialChatSelection({
      activeSessionKey: "session-b",
      sessions: [
        { sessionKey: "session-a" },
        { sessionKey: "session-b" }
      ]
    })).toEqual({
      sessionKey: "session-b",
      shouldLoadMessages: true
    });
  });

  it("当前会话不存在时回退到第一条已有会话", () => {
    expect(resolveInitialChatSelection({
      activeSessionKey: "session-missing",
      sessions: [
        { sessionKey: "session-a" },
        { sessionKey: "session-b" }
      ]
    })).toEqual({
      sessionKey: "session-a",
      shouldLoadMessages: true
    });
  });
});

describe("shouldDeferInitialMessageLoadToWatcher", () => {
  it("首次进入切到首条会话时，由 watcher 接管详情加载，避免重复请求", () => {
    expect(shouldDeferInitialMessageLoadToWatcher({
      previousSessionKey: "",
      nextSessionKey: "session-a",
      shouldLoadMessages: true
    })).toBe(true);
  });

  it("初始化后仍保持同一会话时，允许当前流程直接刷新详情", () => {
    expect(shouldDeferInitialMessageLoadToWatcher({
      previousSessionKey: "session-a",
      nextSessionKey: "session-a",
      shouldLoadMessages: true
    })).toBe(false);
  });

  it("没有可加载会话时，不触发任何详情加载", () => {
    expect(shouldDeferInitialMessageLoadToWatcher({
      previousSessionKey: "",
      nextSessionKey: "",
      shouldLoadMessages: false
    })).toBe(false);
  });
});