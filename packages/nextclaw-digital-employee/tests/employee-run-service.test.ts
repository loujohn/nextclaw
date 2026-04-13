import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestKnex, ensureTestDatabase } from "./test-db";
import { EmployeeRepository } from "../server/repositories/employee-repository";
import { EmployeeSkillRepository } from "../server/repositories/employee-skill-repository";
import { RunRecordRepository } from "../server/repositories/run-record-repository";
import { NextclawEngineGateway } from "../server/engine/NextclawEngineGateway";
import { EmployeeRunService } from "../server/services/employee-run-service";

const tempDirs: string[] = [];

function createTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function buildGateway(homeDir: string, reply: string): NextclawEngineGateway {
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
            processDirect: vi.fn(async () => reply),
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

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

describe("EmployeeRunService", () => {
  it("completes a run with reply and persists record", async () => {
    const homeDir = createTempDir("run-service-ok-");
    const db = createTestKnex();
    await ensureTestDatabase(db);

    const employeeRepo = new EmployeeRepository(db);
    const skillRepo = new EmployeeSkillRepository(db);
    const runRepo = new RunRecordRepository(db);
    const gateway = buildGateway(homeDir, "任务已完成");

    const employee = await employeeRepo.create({
      name: "执行测试", code: "run-test", description: "", systemPrompt: "你好"
    });

    const runService = new EmployeeRunService(employeeRepo, skillRepo, runRepo, gateway);
    const result = await runService.runEmployeeTurn({
      employeeId: employee.id,
      message: "请执行任务",
      triggerType: "manual",
      triggerSource: "test"
    });

    expect(result.reply).toBe("任务已完成");
    expect(result.runId).toBeTruthy();

    const { items } = await runRepo.listPaged({ page: 1, pageSize: 10 });
    expect(items.some(r => r.id === result.runId)).toBe(true);
    const record = items.find(r => r.id === result.runId)!;
    expect(record.status).toBe("completed");
  });

  it("records failure when engine throws", async () => {
    const homeDir = createTempDir("run-service-fail-");
    const db = createTestKnex();
    await ensureTestDatabase(db);

    const employeeRepo = new EmployeeRepository(db);
    const skillRepo = new EmployeeSkillRepository(db);
    const runRepo = new RunRecordRepository(db);

    const gateway = new NextclawEngineGateway({
      homeDir,
      workspaceDir: join(homeDir, "workspace"),
      extensionRegistry: {
        tools: [],
        channels: [],
        diagnostics: [],
        engines: [
          {
            extensionId: "test.error",
            source: "workspace",
            kind: "mock",
            factory: () => ({
              kind: "mock",
              handleInbound: vi.fn(async () => null),
              processDirect: vi.fn(async () => { throw new Error("engine failure"); }),
              applyRuntimeConfig: vi.fn()
            })
          }
        ]
      },
      defaultConfig: {
        agents: { defaults: { engine: "mock", model: "openai/gpt-5" } }
      }
    });

    const employee = await employeeRepo.create({
      name: "失败测试", code: "fail-test", description: "", systemPrompt: "你好"
    });

    const runService = new EmployeeRunService(employeeRepo, skillRepo, runRepo, gateway);
    await expect(runService.runEmployeeTurn({
      employeeId: employee.id,
      message: "执行",
      triggerType: "manual",
      triggerSource: "test"
    })).rejects.toThrow();

    const { items } = await runRepo.listPaged({ page: 1, pageSize: 10 });
    const record = items.find(r => r.employeeId === employee.id);
    expect(record).toBeTruthy();
    expect(record!.status).toBe("failed");
  });

  it("throws for non-existent employee", async () => {
    const homeDir = createTempDir("run-service-404-");
    const db = createTestKnex();
    await ensureTestDatabase(db);

    const employeeRepo = new EmployeeRepository(db);
    const skillRepo = new EmployeeSkillRepository(db);
    const runRepo = new RunRecordRepository(db);
    const gateway = buildGateway(homeDir, "ok");

    const runService = new EmployeeRunService(employeeRepo, skillRepo, runRepo, gateway);
    await expect(runService.runEmployeeTurn({
      employeeId: "ghost",
      message: "hello",
      triggerType: "manual",
      triggerSource: "test"
    })).rejects.toThrow("Employee not found");
  });
});
