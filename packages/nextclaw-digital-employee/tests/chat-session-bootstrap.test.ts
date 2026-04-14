import { describe, expect, it } from "vitest";
import { resolveInitialChatSelection } from "../app/lib/chat-session-bootstrap";

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