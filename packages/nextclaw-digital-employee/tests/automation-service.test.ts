import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CronService } from "@nextclaw/core";
import { ensurePlatformDatabase, createPlatformKnex } from "../server/db/knex";
import { EmployeeRepository } from "../server/repositories/employee-repository";
import { EmployeeScheduleRepository } from "../server/repositories/employee-schedule-repository";
import { RunRecordRepository } from "../server/repositories/run-record-repository";
import { NextclawEngineGateway } from "../server/engine/NextclawEngineGateway";
import { EmployeeRunService } from "../server/services/employee-run-service";
import { AutomationService } from "../server/services/automation-service";

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

describe("automation service", () => {
  it("stores cron schedules and can trigger a scheduled employee run", async () => {
    const homeDir = createTempDir("nextclaw-digital-employee-automation-");
    const db = createPlatformKnex(join(homeDir, "platform.sqlite"));
    await ensurePlatformDatabase(db);

    const employeeRepo = new EmployeeRepository(db);
    const scheduleRepo = new EmployeeScheduleRepository(db);
    const runRepo = new RunRecordRepository(db);
    const employee = await employeeRepo.create({
      name: "项目管理助手",
      code: "project-manager",
      description: "每天自动汇总项目状态",
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
              processDirect: vi.fn(async () => "定时任务已完成"),
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
    const runService = new EmployeeRunService(employeeRepo, runRepo, gateway);
    const cron = new CronService(join(homeDir, "cron", "jobs.json"));
    const automation = new AutomationService(scheduleRepo, employeeRepo, runService, cron);
    await automation.start();

    const schedule = await automation.upsertSchedule({
      employeeId: employee.id,
      scheduleKind: "cron",
      cronExpr: "0 18 * * *",
      enabled: true
    });

    await automation.runNow(employee.id);
    const runs = await runRepo.listByEmployeeId(employee.id);

    expect(schedule.scheduleKind).toBe("cron");
    expect(schedule.runtimeJobId).toBeTruthy();
    expect(runs).toHaveLength(1);
    expect(runs[0]?.summary).toContain("定时任务已完成");
    cron.stop();
    await db.destroy();
  });
});
