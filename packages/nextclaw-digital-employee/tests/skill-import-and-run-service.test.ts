import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ensurePlatformDatabase, createPlatformKnex } from "../server/db/knex";
import { EmployeeRepository } from "../server/repositories/employee-repository";
import { SkillInstallationRepository } from "../server/repositories/skill-installation-repository";
import { RunRecordRepository } from "../server/repositories/run-record-repository";
import { NextclawEngineGateway } from "../server/engine/NextclawEngineGateway";
import { SkillInstallService } from "../server/services/skill-install-service";
import { EmployeeRunService } from "../server/services/employee-run-service";

const tempDirs: string[] = [];

function createTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
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
  vi.restoreAllMocks();
});

function writeSkillDir(rootDir: string, skillName: string): string {
  const skillDir = join(rootDir, skillName);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    join(skillDir, "SKILL.md"),
    `---\nname: ${skillName}\ndescription: ${skillName} description\n---\n\n# ${skillName}\n`
  );
  return skillDir;
}

describe("skill import service", () => {
  it("imports a skill from local path and records installation metadata", async () => {
    const homeDir = createTempDir("nextclaw-digital-employee-skill-local-");
    const sourceRoot = createTempDir("nextclaw-digital-employee-skill-source-");
    const db = createPlatformKnex(join(homeDir, "platform.sqlite"));
    await ensurePlatformDatabase(db);
    const gateway = new NextclawEngineGateway({ homeDir, workspaceDir: join(homeDir, "workspace") });
    const repo = new SkillInstallationRepository(db);
    const service = new SkillInstallService(repo, gateway);
    const skillDir = writeSkillDir(sourceRoot, "daily-summary");

    const installation = await service.importFromLocalPath(skillDir);
    const stored = await repo.findBySkillName("daily-summary");

    expect(installation.skillName).toBe("daily-summary");
    expect(stored?.sourceType).toBe("local");
    expect(stored?.installPath).toContain("daily-summary");
    await db.destroy();
  });

  it("imports a skill from git and records installation metadata", async () => {
    const homeDir = createTempDir("nextclaw-digital-employee-skill-git-home-");
    const gitRepoDir = createTempDir("nextclaw-digital-employee-skill-git-repo-");
    const db = createPlatformKnex(join(homeDir, "platform.sqlite"));
    await ensurePlatformDatabase(db);
    const gateway = new NextclawEngineGateway({ homeDir, workspaceDir: join(homeDir, "workspace") });
    const repo = new SkillInstallationRepository(db);
    const service = new SkillInstallService(repo, gateway);

    writeSkillDir(gitRepoDir, "git-briefing");
    execFileSync("git", ["init"], { cwd: gitRepoDir });
    execFileSync("git", ["config", "user.email", "dev@example.com"], { cwd: gitRepoDir });
    execFileSync("git", ["config", "user.name", "Dev"], { cwd: gitRepoDir });
    execFileSync("git", ["add", "."], { cwd: gitRepoDir });
    execFileSync("git", ["commit", "-m", "init"], { cwd: gitRepoDir });

    const installation = await service.importFromGit(gitRepoDir);
    const stored = await repo.findBySkillName("git-briefing");

    expect(installation.skillName).toBe("git-briefing");
    expect(stored?.sourceType).toBe("git");
    await db.destroy();
  });
});

describe("employee run service", () => {
  it("executes one employee turn and persists run records", async () => {
    const homeDir = createTempDir("nextclaw-digital-employee-run-home-");
    const db = createPlatformKnex(join(homeDir, "platform.sqlite"));
    await ensurePlatformDatabase(db);

    const employeeRepo = new EmployeeRepository(db);
    const runRepo = new RunRecordRepository(db);
    const employee = await employeeRepo.create({
      name: "项目管理助手",
      code: "project-manager",
      description: "每天巡检项目状态",
      systemPrompt: "你是项目管理助手"
    });

    const gateway = new NextclawEngineGateway({
      homeDir,
      workspaceDir: join(homeDir, "workspace"),
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
              handleInbound: vi.fn(async () => null),
              processDirect: vi.fn(async () => "今天共有 2 个风险项目"),
              applyRuntimeConfig: vi.fn()
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
    const service = new EmployeeRunService(employeeRepo, runRepo, gateway);

    const result = await service.runEmployeeTurn({
      employeeId: employee.id,
      message: "请给我今天的项目风险摘要",
      triggerType: "manual",
      triggerSource: "chat"
    });

    const runs = await runRepo.listByEmployeeId(employee.id);

    expect(result.reply).toBe("今天共有 2 个风险项目");
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toMatchObject({
      role: "user"
    });
    expect(result.messages[1]).toMatchObject({
      role: "assistant"
    });
    expect(result.resultCards[0]).toMatchObject({
      kind: "summary",
      title: "管理摘要"
    });
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe("completed");
    expect(runs[0]?.summary).toContain("今天共有 2 个风险项目");
    expect(runs[0]?.result).toMatchObject({
      sessionKey: result.sessionKey,
      resultCards: [
        expect.objectContaining({
          kind: "summary"
        })
      ]
    });
    await db.destroy();
  });
});
