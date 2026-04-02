import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { MessageBus, SessionManager } from "@nextclaw/core";
import { ensurePlatformDatabase, createPlatformKnex } from "../server/db/knex";
import { EmployeeRepository } from "../server/repositories/employee-repository";
import { NextclawEngineGateway } from "../server/engine/NextclawEngineGateway";

const tempDirs: string[] = [];

function createTempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), "nextclaw-digital-employee-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("digital employee platform database", () => {
  it("creates employees and loads them back from sqlite", async () => {
    const homeDir = createTempHome();
    const dbPath = join(homeDir, "platform.sqlite");
    const db = createPlatformKnex(dbPath);
    await ensurePlatformDatabase(db);

    const repo = new EmployeeRepository(db);
    const created = await repo.create({
      name: "项目管理助手",
      code: "project-manager",
      description: "每天汇总项目状态",
      systemPrompt: "你是项目管理助手"
    });

    const employee = await repo.getById(created.id);

    expect(employee).toBeTruthy();
    expect(employee?.name).toBe("项目管理助手");
    expect(employee?.status).toBe("active");
    await db.destroy();
  });
});

describe("digital employee engine gateway", () => {
  it("loads builtin and workspace skills from the platform runtime home", async () => {
    const homeDir = createTempHome();
    const workspaceDir = join(homeDir, "workspace");
    const skillDir = join(workspaceDir, "skills", "project-daily-brief");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, "SKILL.md"),
      "---\nname: project-daily-brief\ndescription: Summarize daily project status\n---\n\n# Project Daily Brief\n"
    );

    const gateway = new NextclawEngineGateway({
      homeDir,
      workspaceDir
    });

    const skills = await gateway.listAvailableSkills();

    expect(skills.some((item) => item.name === "project-daily-brief" && item.source === "workspace")).toBe(true);
    expect(skills.some((item) => item.name === "skill-creator")).toBe(true);
  });

  it("returns session history for repeated employee turns", async () => {
    const homeDir = createTempHome();
    const workspaceDir = join(homeDir, "workspace");
    process.env.NEXTCLAW_HOME = homeDir;

    const gateway = new NextclawEngineGateway({
      homeDir,
      workspaceDir,
      extensionRegistry: {
        tools: [],
        channels: [],
        diagnostics: [],
        engines: [
          {
            extensionId: "test.mock",
            source: "workspace",
            kind: "mock",
            factory: () => ({
              kind: "mock",
              handleInbound: async () => null,
              processDirect: async () => "收到",
              applyRuntimeConfig: () => undefined
            })
          }
        ]
      },
      defaultConfig: {
        agents: {
          defaults: {
            engine: "mock",
            model: "openai/gpt-5"
          }
        }
      }
    });

    await gateway.runEmployeeTurn({
      employeeId: "employee-1",
      agentId: "project-manager",
      sessionKey: "employee:employee-1:test",
      message: "第一条消息"
    });
    await gateway.runEmployeeTurn({
      employeeId: "employee-1",
      agentId: "project-manager",
      sessionKey: "employee:employee-1:test",
      message: "第二条消息"
    });

    const history = gateway.getSessionHistory("employee:employee-1:test");

    expect(history.messages).toHaveLength(4);
    expect(history.messages[0]?.role).toBe("user");
    expect(history.messages[1]?.role).toBe("assistant");
    expect(history.messages[2]?.content).toBe("第二条消息");
  });

  it("reuses the same message bus and session manager across cached engines", () => {
    const homeDir = createTempHome();
    const workspaceDir = join(homeDir, "workspace");
    const bus = new MessageBus();
    const sessionManager = new SessionManager(workspaceDir);
    const seenBuses = new Set<unknown>();
    const seenSessionManagers = new Set<unknown>();

    const gateway = new NextclawEngineGateway({
      homeDir,
      workspaceDir,
      bus,
      sessionManager,
      extensionRegistry: {
        tools: [],
        channels: [],
        diagnostics: [],
        engines: [
          {
            extensionId: "test.mock",
            source: "workspace",
            kind: "mock",
            factory: (context) => {
              seenBuses.add(context.bus);
              seenSessionManagers.add(context.sessionManager);
              return {
                kind: "mock",
                handleInbound: async () => null,
                processDirect: async () => "ok",
                applyRuntimeConfig: () => undefined
              };
            }
          }
        ]
      },
      defaultConfig: {
        agents: {
          defaults: {
            engine: "mock",
            model: "openai/gpt-5"
          }
        }
      }
    });

    gateway.getOrCreateEngine("employee-a", join(homeDir, "agents", "employee-a"));
    gateway.getOrCreateEngine("employee-b", join(homeDir, "agents", "employee-b"));

    expect(seenBuses.size).toBe(1);
    expect(seenBuses.has(bus)).toBe(true);
    expect(seenSessionManagers.size).toBe(1);
    expect(seenSessionManagers.has(sessionManager)).toBe(true);
  });
});
