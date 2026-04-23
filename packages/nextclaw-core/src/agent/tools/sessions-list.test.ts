import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SessionManager } from "../../session/manager.js";
import { SessionsListTool } from "./sessions.js";

const HOME_ENV_KEY = "NEXTCLAW_HOME";

function makeTempHome(): { tempHome: string; cleanup: () => void } {
  const tempHome = mkdtempSync(join(tmpdir(), "nextclaw-sessions-list-test-"));
  return {
    tempHome,
    cleanup: () => rmSync(tempHome, { recursive: true, force: true })
  };
}

describe("SessionsListTool agentId filtering", () => {
  let tempHome: string;
  let cleanup: () => void;
  let previousHome: string | undefined;

  beforeEach(() => {
    previousHome = process.env[HOME_ENV_KEY];
    ({ tempHome, cleanup } = makeTempHome());
    process.env[HOME_ENV_KEY] = tempHome;
  });

  afterEach(() => {
    cleanup();
    if (previousHome === undefined) {
      delete process.env[HOME_ENV_KEY];
    } else {
      process.env[HOME_ENV_KEY] = previousHome;
    }
  });

  function seedSession(sessions: SessionManager, key: string): void {
    const s = sessions.getOrCreate(key);
    sessions.addMessage(s, "user", "hello");
    sessions.save(s);
  }

  it("returns all sessions when no agentId is set", async () => {
    const sessions = new SessionManager(tempHome);
    seedSession(sessions, "agent:alice:dingtalk:acc:group:g1");
    seedSession(sessions, "agent:bob:dingtalk:acc:group:g2");

    const tool = new SessionsListTool(sessions);
    const result = JSON.parse(await tool.execute({})) as { sessions: Array<{ key: string }> };

    const keys = result.sessions.map((s) => s.key);
    expect(keys.some((k) => k.includes("alice"))).toBe(true);
    expect(keys.some((k) => k.includes("bob"))).toBe(true);
  });

  it("returns only own sessions when agentId is set", async () => {
    const sessions = new SessionManager(tempHome);
    seedSession(sessions, "agent:alice:dingtalk:acc:group:g1");
    seedSession(sessions, "agent:bob:dingtalk:acc:group:g2");

    const tool = new SessionsListTool(sessions);
    tool.setContext({ agentId: "alice" });
    const result = JSON.parse(await tool.execute({})) as { sessions: Array<{ key: string }> };

    const keys = result.sessions.map((s) => s.key);
    expect(keys.some((k) => k.includes("alice"))).toBe(true);
    expect(keys.some((k) => k.includes("bob"))).toBe(false);
  });

  it("agentId filter is case-insensitive", async () => {
    const sessions = new SessionManager(tempHome);
    seedSession(sessions, "agent:alice:dingtalk:acc:group:g1");

    const tool = new SessionsListTool(sessions);
    tool.setContext({ agentId: "ALICE" });
    const result = JSON.parse(await tool.execute({})) as { sessions: Array<{ key: string }> };

    expect(result.sessions.length).toBe(1);
  });

  it("does not leak a session whose agentId is a prefix of the filter agentId", async () => {
    // guard against prefix false-positive: "alice" must not match "alice-bot"
    const sessions = new SessionManager(tempHome);
    seedSession(sessions, "agent:alice:dingtalk:acc:group:g1");
    seedSession(sessions, "agent:alice-bot:dingtalk:acc:group:g2");

    const tool = new SessionsListTool(sessions);
    tool.setContext({ agentId: "alice" });
    const result = JSON.parse(await tool.execute({})) as { sessions: Array<{ key: string }> };

    const keys = result.sessions.map((s) => s.key);
    expect(keys.every((k) => k.includes("agent:alice:"))).toBe(true);
    expect(keys.some((k) => k.includes("alice-bot"))).toBe(false);
  });
});
