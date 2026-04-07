import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CronService } from "@nextclaw/core";
import { ensurePlatformDatabase, createPlatformKnex } from "../server/db/knex";
import { EmployeeRepository } from "../server/repositories/employee-repository";
import { EmployeeScheduleRepository } from "../server/repositories/employee-schedule-repository";
import { EmployeeScheduleJobRepository } from "../server/repositories/employee-schedule-job-repository";
import { EmployeeSkillRepository } from "../server/repositories/employee-skill-repository";
import { RunRecordRepository } from "../server/repositories/run-record-repository";
import { NextclawEngineGateway } from "../server/engine/NextclawEngineGateway";
import { EmployeeRunService } from "../server/services/employee-run-service";
import { AutomationService } from "../server/services/automation-service";
import { EmployeeLifecycleService } from "../server/services/employee-lifecycle-service";

const tempDirs: string[] = [];

function createTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function buildTestGateway(homeDir: string): NextclawEngineGateway {
  return new NextclawEngineGateway({
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
            processDirect: vi.fn(async () => "ok"),
            applyRuntimeConfig: vi.fn()
          })
        }
      ]
    },
    defaultConfig: {
      agents: { defaults: { engine: "mock", model: "openai/gpt-5" } }
    }
  });
}

function buildTestStack(homeDir: string) {
  const db = createPlatformKnex(join(homeDir, "platform.sqlite"));
  const employeeRepo = new EmployeeRepository(db);
  const skillRepo = new EmployeeSkillRepository(db);
  const scheduleRepo = new EmployeeScheduleRepository(db);
  const jobRepo = new EmployeeScheduleJobRepository(db);
  const runRepo = new RunRecordRepository(db);
  const gateway = buildTestGateway(homeDir);

  const cronService = new CronService(join(homeDir, "cron", "jobs.json"));
  const runService = new EmployeeRunService(employeeRepo, skillRepo, runRepo, gateway);
  const automationService = new AutomationService(
    scheduleRepo, jobRepo, employeeRepo, runService, cronService, gateway
  );
  const lifecycleService = new EmployeeLifecycleService(
    employeeRepo, skillRepo, automationService, gateway
  );

  return { db, employeeRepo, skillRepo, jobRepo, automationService, lifecycleService };
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

describe("EmployeeLifecycleService", () => {
  it("creates employee with skills and schedule", async () => {
    const homeDir = createTempDir("lifecycle-create-");
    const { db, lifecycleService, skillRepo } = buildTestStack(homeDir);
    await ensurePlatformDatabase(db);

    const result = await lifecycleService.createEmployee({
      employee: { name: "测试助手", code: "test-bot", description: "单测用", systemPrompt: "你是测试员" },
      skillNames: ["weather-query"],
      schedule: { scheduleKind: "cron", cronExpr: "0 9 * * *" }
    });

    expect(result.name).toBe("测试助手");
    expect(result.code).toBe("test-bot");
    expect(result.skills).toHaveLength(1);
    expect(result.schedule).toBeTruthy();

    const skills = await skillRepo.listByEmployeeId(result.id);
    expect(skills.some(s => s.skillName === "weather-query")).toBe(true);
  });

  it("rolls back employee on workspace error", async () => {
    const homeDir = createTempDir("lifecycle-rollback-");
    const { db, lifecycleService, employeeRepo } = buildTestStack(homeDir);
    await ensurePlatformDatabase(db);

    vi.spyOn(await import("../server/engine/employee-workspace"), "ensureEmployeeWorkspace")
      .mockImplementation(() => { throw new Error("workspace boom"); });

    await expect(lifecycleService.createEmployee({
      employee: { name: "回滚测试", code: "rollback-test", description: "", systemPrompt: "" }
    })).rejects.toThrow("workspace boom");

    const allEmployees = await employeeRepo.list();
    expect(allEmployees.find(e => e.code === "rollback-test")).toBeUndefined();
  });

  it("deletes (archives) employee and disables jobs", async () => {
    const homeDir = createTempDir("lifecycle-delete-");
    const { db, lifecycleService, employeeRepo, jobRepo } = buildTestStack(homeDir);
    await ensurePlatformDatabase(db);

    const created = await lifecycleService.createEmployee({
      employee: { name: "待删除", code: "to-delete", description: "", systemPrompt: "" },
      schedule: { scheduleKind: "every", everyMs: 60_000 }
    });

    const result = await lifecycleService.deleteEmployee(created.id);
    expect(result.code).toBe("to-delete");

    const remaining = await employeeRepo.list();
    expect(remaining.find(e => e.id === created.id)).toBeUndefined();

    const jobs = await jobRepo.listByEmployeeId(created.id);
    for (const j of jobs) expect(j.enabled).toBe(false);
  });

  it("updates employee info and schedule", async () => {
    const homeDir = createTempDir("lifecycle-update-");
    const { db, lifecycleService } = buildTestStack(homeDir);
    await ensurePlatformDatabase(db);

    const created = await lifecycleService.createEmployee({
      employee: { name: "更新前", code: "update-test", description: "旧", systemPrompt: "旧提示词" },
      schedule: { scheduleKind: "cron", cronExpr: "0 9 * * *" }
    });

    const updated = await lifecycleService.updateEmployee(created.id, {
      name: "更新后",
      description: "新描述",
      skillNames: ["data-analysis"],
      schedule: { scheduleKind: "every", everyMs: 120_000 }
    });

    expect(updated.employee.name).toBe("更新后");
    expect(updated.employee.description).toBe("新描述");
    expect(updated.skills.some((s: { skillName: string }) => s.skillName === "data-analysis")).toBe(true);
    expect(updated.jobs).toHaveLength(1);
  });

  it("throws 404 when deleting non-existent employee", async () => {
    const homeDir = createTempDir("lifecycle-404-");
    const { db, lifecycleService } = buildTestStack(homeDir);
    await ensurePlatformDatabase(db);

    await expect(lifecycleService.deleteEmployee("non-existent-id")).rejects.toThrow("employee not found");
  });
});
