import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContextBuilder, __resetContextBuilderPositionalWarningForTesting } from "./context.js";
import { APP_NAME } from "../config/brand.js";

const tempDirs: string[] = [];

function createTempWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "context-test-"));
  tempDirs.push(dir);
  mkdirSync(join(dir, "memory"), { recursive: true });
  writeFileSync(join(dir, "AGENTS.md"), "# test", "utf-8");
  return dir;
}

/** Writes a minimal workspace-local SKILL.md so excludeSkills tests can verify
 * that a named skill actually disappears from the serialized <available_skills>
 * block (just checking the section header is present does not catch the
 * regression we care about: an excluded skill still surfacing to the LLM). */
function addWorkspaceSkill(workspace: string, name: string, description: string): void {
  const dir = join(workspace, "skills", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "SKILL.md"),
    [
      "---",
      `name: ${name}`,
      `description: ${description}`,
      "---",
      "",
      "# Stub skill body for test fixture."
    ].join("\n"),
    "utf-8"
  );
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("ContextBuilder runtimeMode", () => {
  it("defaults to cli mode and includes CLI references (positional constructor)", () => {
    const ws = createTempWorkspace();
    const builder = new ContextBuilder(ws);
    const prompt = builder.buildSystemPrompt();
    expect(prompt).toContain("CLI Quick Reference");
    expect(prompt).toContain("gateway status");
    expect(prompt).toContain("Self-Update");
    expect(prompt).toContain("Self-Management Guide");
    expect(prompt).toContain("gateway: Restart/apply config");
  });

  it("cli mode via options object matches default behavior", () => {
    const ws = createTempWorkspace();
    const builder = new ContextBuilder({ workspace: ws, runtimeMode: "cli" });
    const prompt = builder.buildSystemPrompt();
    expect(prompt).toContain("CLI Quick Reference");
    expect(prompt).toContain("Self-Management Guide");
    expect(prompt).toContain("gateway: Restart/apply config");
  });

  it("platform mode excludes CLI references", () => {
    const ws = createTempWorkspace();
    const builder = new ContextBuilder({ workspace: ws, runtimeMode: "platform" });
    const prompt = builder.buildSystemPrompt();
    expect(prompt).not.toContain("CLI Quick Reference");
    expect(prompt).not.toContain("gateway status");
    expect(prompt).not.toContain("Self-Update");
    expect(prompt).not.toContain("Self-Management Guide");
    expect(prompt).not.toContain("read `" + ws + "/USAGE.md` first");
    expect(prompt).not.toContain("gateway: Restart/apply config");
  });

  it("platform mode includes platform-specific guidance", () => {
    const ws = createTempWorkspace();
    const builder = new ContextBuilder({ workspace: ws, runtimeMode: "platform" });
    const prompt = builder.buildSystemPrompt();
    expect(prompt).toContain("Platform Runtime");
    expect(prompt).toContain("Digital Employee Platform");
    expect(prompt).toContain("NO CLI available");
    expect(prompt).toContain("message tool hints");
    expect(prompt).toContain("PLATFORM_USAGE.md");
  });

  it("platform mode still includes common sections", () => {
    const ws = createTempWorkspace();
    const builder = new ContextBuilder({ workspace: ws, runtimeMode: "platform" });
    const prompt = builder.buildSystemPrompt();
    expect(prompt).toContain("## Tooling");
    expect(prompt).toContain("## Safety");
    expect(prompt).toContain("## Workspace");
    expect(prompt).toContain("## Messaging");
    expect(prompt).toContain("### message tool");
    expect(prompt).toContain("## Heartbeats");
    expect(prompt).toContain("## Memory Recall");
    expect(prompt).toContain(`running inside ${APP_NAME}`);
  });

  it("includes messageToolHints in both modes", () => {
    const ws = createTempWorkspace();
    const hints = ["channel: dingtalk, to: group:abc123"];

    const cliBuilder = new ContextBuilder({ workspace: ws, runtimeMode: "cli" });
    const cliPrompt = cliBuilder.buildSystemPrompt(undefined, undefined, hints);
    expect(cliPrompt).toContain("channel: dingtalk, to: group:abc123");

    const platformBuilder = new ContextBuilder({ workspace: ws, runtimeMode: "platform" });
    const platformPrompt = platformBuilder.buildSystemPrompt(undefined, undefined, hints);
    expect(platformPrompt).toContain("channel: dingtalk, to: group:abc123");
  });

  it("options-object form honors additionalSkillsDirs and excludeSkills", () => {
    const ws = createTempWorkspace();
    const builder = new ContextBuilder({
      workspace: ws,
      runtimeMode: "platform",
      additionalSkillsDirs: [],
      excludeSkills: new Set(["nextclaw-self-manage", "cron"])
    });
    const prompt = builder.buildSystemPrompt();
    expect(prompt).toContain("## Tooling");
  });

  it("excludeSkills removes named skills from <available_skills>", () => {
    const ws = createTempWorkspace();
    addWorkspaceSkill(ws, "alpha-skill", "Alpha skill for fixtures");
    addWorkspaceSkill(ws, "beta-skill", "Beta skill for fixtures");

    const baseline = new ContextBuilder({ workspace: ws, runtimeMode: "platform" });
    const baselinePrompt = baseline.buildSystemPrompt();
    expect(baselinePrompt).toContain("<name>alpha-skill</name>");
    expect(baselinePrompt).toContain("<name>beta-skill</name>");

    const filtered = new ContextBuilder({
      workspace: ws,
      runtimeMode: "platform",
      excludeSkills: new Set(["alpha-skill"])
    });
    const filteredPrompt = filtered.buildSystemPrompt();
    expect(filteredPrompt).not.toContain("<name>alpha-skill</name>");
    expect(filteredPrompt).toContain("<name>beta-skill</name>");
  });

  it("excludeSkills never mutates the caller-provided Set", () => {
    const ws = createTempWorkspace();
    addWorkspaceSkill(ws, "alpha-skill", "alpha");
    const exclusion = new Set(["alpha-skill"]);
    const snapshot = new Set(exclusion);
    const builder = new ContextBuilder({
      workspace: ws,
      runtimeMode: "platform",
      excludeSkills: exclusion
    });
    builder.buildSystemPrompt();
    expect(exclusion).toEqual(snapshot);
  });
});

describe("ContextBuilder positional deprecation warning", () => {
  // The warn-once flag is module-scoped. Tests here rely on the exported
  // `__resetContextBuilderPositionalWarningForTesting` helper to get back to a
  // clean slate, so each case can independently assert that the warning fires
  // exactly once per process "lifetime".
  beforeEach(() => {
    __resetContextBuilderPositionalWarningForTesting();
  });

  it("emits deprecation warning on first positional construction", () => {
    const ws = createTempWorkspace();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      new ContextBuilder(ws);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0]?.[0]).toContain("Positional constructor is deprecated");
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("suppresses subsequent positional warnings in the same process", () => {
    const ws = createTempWorkspace();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      new ContextBuilder(ws);
      new ContextBuilder(ws);
      new ContextBuilder(ws);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("does not warn for options-object construction", () => {
    const ws = createTempWorkspace();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      new ContextBuilder({ workspace: ws });
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});
