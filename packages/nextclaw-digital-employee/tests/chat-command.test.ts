import { describe, expect, it } from "vitest";
import { isConversationResetCommand } from "../shared/chat-command";

describe("chat command detection", () => {
  it("matches /new and /reset aliases case-insensitively", () => {
    expect(isConversationResetCommand("/new")).toBe(true);
    expect(isConversationResetCommand(" /RESET ")).toBe(true);
    expect(isConversationResetCommand("/new please")).toBe(true);
    expect(isConversationResetCommand("/status")).toBe(false);
    expect(isConversationResetCommand("hello")).toBe(false);
  });
});
