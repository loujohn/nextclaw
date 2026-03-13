import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CronService } from "@nextclaw/core";
import { ensurePlatformDatabase, createPlatformKnex } from "../server/db/knex";
import { EmployeeRepository } from "../server/repositories/employee-repository";
import { EmployeeScheduleRepository } from "../server/repositories/employee-schedule-repository";
import { EmployeeSkillRepository } from "../server/repositories/employee-skill-repository";
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

function buildTestGateway(homeDir: string, reply = "定时任务已完成"): NextclawEngineGateway {
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
      agents: {
        defaults: {
          engine: "mock",
          model: "openai/gpt-5"
        }
      }
    }
  });
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

// ── cron 类型 ────────────────────────────────────────────────────────────────
describe("automation service - cron schedule", () => {
  it("stores cron schedules and can manually trigger a scheduled employee run", async () => {
    const homeDir = createTempDir("nextclaw-automation-cron-");
    const db = createPlatformKnex(join(homeDir, "platform.sqlite"));
    await ensurePlatformDatabase(db);

    const employeeRepo = new EmployeeRepository(db);
    const skillRepo = new EmployeeSkillRepository(db);
    const scheduleRepo = new EmployeeScheduleRepository(db);
    const runRepo = new RunRecordRepository(db);
    const employee = await employeeRepo.create({
      name: "项目管理助手",
      code: "project-manager",
      description: "每天自动汇总项目状态",
      systemPrompt: "你是项目管理助手"
    });

    const gateway = buildTestGateway(homeDir, "cron 任务已完成");
    const runService = new EmployeeRunService(employeeRepo, skillRepo, runRepo, gateway);
    const cron = new CronService(join(homeDir, "cron", "jobs.json"));
    const automation = new AutomationService(scheduleRepo, employeeRepo, runService, cron, gateway);
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
    expect(runs[0]?.summary).toContain("cron 任务已完成");
    cron.stop();
    await db.destroy();
  });

  it("persists cron job to disk so it survives a server restart", async () => {
    const homeDir = createTempDir("nextclaw-automation-cron-restart-");
    const db = createPlatformKnex(join(homeDir, "platform.sqlite"));
    await ensurePlatformDatabase(db);

    const employeeRepo = new EmployeeRepository(db);
    const skillRepo = new EmployeeSkillRepository(db);
    const scheduleRepo = new EmployeeScheduleRepository(db);
    const runRepo = new RunRecordRepository(db);
    const employee = await employeeRepo.create({
      name: "日报助手",
      code: "daily-reporter",
      description: "生成日报",
      systemPrompt: "你是日报助手"
    });

    const gateway = buildTestGateway(homeDir, "日报已生成");
    const runService = new EmployeeRunService(employeeRepo, skillRepo, runRepo, gateway);
    const cron1 = new CronService(join(homeDir, "cron", "jobs.json"));
    const automation1 = new AutomationService(scheduleRepo, employeeRepo, runService, cron1, gateway);
    await automation1.start();
    await automation1.upsertSchedule({
      employeeId: employee.id,
      scheduleKind: "cron",
      cronExpr: "0 9 * * *",
      enabled: true
    });
    cron1.stop();

    // 模拟重启：新建 CronService 实例，从磁盘加载
    const cron2 = new CronService(join(homeDir, "cron", "jobs.json"));
    const automation2 = new AutomationService(scheduleRepo, employeeRepo, runService, cron2, gateway);
    await automation2.start();
    const status = cron2.status();
    expect(status.jobs).toBe(1);

    await automation2.runNow(employee.id);
    const runs = await runRepo.listByEmployeeId(employee.id);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.summary).toContain("日报已生成");
    cron2.stop();
    await db.destroy();
  });
});

// ── every 类型 ────────────────────────────────────────────────────────────────
describe("automation service - every (interval) schedule", () => {
  it("creates an every-interval schedule and can manually trigger it", async () => {
    const homeDir = createTempDir("nextclaw-automation-every-");
    const db = createPlatformKnex(join(homeDir, "platform.sqlite"));
    await ensurePlatformDatabase(db);

    const employeeRepo = new EmployeeRepository(db);
    const skillRepo = new EmployeeSkillRepository(db);
    const scheduleRepo = new EmployeeScheduleRepository(db);
    const runRepo = new RunRecordRepository(db);
    const employee = await employeeRepo.create({
      name: "监控助手",
      code: "monitor",
      description: "每隔 30 分钟巡检",
      systemPrompt: "你是监控助手"
    });

    const gateway = buildTestGateway(homeDir, "巡检完毕");
    const runService = new EmployeeRunService(employeeRepo, skillRepo, runRepo, gateway);
    const cron = new CronService(join(homeDir, "cron", "jobs.json"));
    const automation = new AutomationService(scheduleRepo, employeeRepo, runService, cron, gateway);
    await automation.start();

    const schedule = await automation.upsertSchedule({
      employeeId: employee.id,
      scheduleKind: "every",
      everyMs: 1800000, // 30 分钟
      enabled: true
    });

    expect(schedule.scheduleKind).toBe("every");
    expect(schedule.everyMs).toBe(1800000);
    expect(schedule.runtimeJobId).toBeTruthy();

    await automation.runNow(employee.id);
    const runs = await runRepo.listByEmployeeId(employee.id);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.summary).toContain("巡检完毕");
    cron.stop();
    await db.destroy();
  });

  it("fires automatically when the interval elapses (using fake timers)", async () => {
    vi.useFakeTimers();
    const homeDir = createTempDir("nextclaw-automation-every-timer-");
    const db = createPlatformKnex(join(homeDir, "platform.sqlite"));
    await ensurePlatformDatabase(db);

    const employeeRepo = new EmployeeRepository(db);
    const skillRepo = new EmployeeSkillRepository(db);
    const scheduleRepo = new EmployeeScheduleRepository(db);
    const runRepo = new RunRecordRepository(db);
    const employee = await employeeRepo.create({
      name: "定时检测",
      code: "interval-worker",
      description: "每 5 秒自动触发",
      systemPrompt: "你是定时检测助手"
    });

    const gateway = buildTestGateway(homeDir, "interval 触发成功");
    const runService = new EmployeeRunService(employeeRepo, skillRepo, runRepo, gateway);
    const cron = new CronService(join(homeDir, "cron", "jobs.json"));
    const automation = new AutomationService(scheduleRepo, employeeRepo, runService, cron, gateway);
    await automation.start();
    await automation.upsertSchedule({
      employeeId: employee.id,
      scheduleKind: "every",
      everyMs: 5000, // 5 秒
      enabled: true
    });

    // 推进时间 5 秒使定时器触发
    await vi.advanceTimersByTimeAsync(6000);

    const runs = await runRepo.listByEmployeeId(employee.id);
    expect(runs.length).toBeGreaterThanOrEqual(1);
    expect(runs[0]?.summary).toContain("interval 触发成功");
    cron.stop();
    vi.useRealTimers();
    await db.destroy();
  });
});

// ── heartbeat 类型 ────────────────────────────────────────────────────────────
describe("automation service - heartbeat schedule", () => {
  it("creates a heartbeat schedule and restores it after simulated restart", async () => {
    const homeDir = createTempDir("nextclaw-automation-heartbeat-");
    const db = createPlatformKnex(join(homeDir, "platform.sqlite"));
    await ensurePlatformDatabase(db);

    const employeeRepo = new EmployeeRepository(db);
    const skillRepo = new EmployeeSkillRepository(db);
    const scheduleRepo = new EmployeeScheduleRepository(db);
    const runRepo = new RunRecordRepository(db);
    const employee = await employeeRepo.create({
      name: "心跳巡检员",
      code: "heartbeat-worker",
      description: "心跳模式巡检",
      systemPrompt: "你是心跳巡检员"
    });

    // 在 agent workspace 放一个有内容的 HEARTBEAT.md
    const wsDir = join(homeDir, "agents", employee.code);
    mkdirSync(wsDir, { recursive: true });
    writeFileSync(join(wsDir, "HEARTBEAT.md"), "# HEARTBEAT\n\n检查系统状态", "utf-8");

    const gateway1 = buildTestGateway(homeDir, "心跳正常");
    const runService1 = new EmployeeRunService(employeeRepo, skillRepo, runRepo, gateway1);
    const cron1 = new CronService(join(homeDir, "cron", "jobs.json"));
    const automation1 = new AutomationService(scheduleRepo, employeeRepo, runService1, cron1, gateway1);
    await automation1.start();

    const schedule = await automation1.upsertSchedule({
      employeeId: employee.id,
      scheduleKind: "heartbeat",
      everyMs: 60000, // 1 分钟
      enabled: true
    });

    expect(schedule.scheduleKind).toBe("heartbeat");
    expect(schedule.heartbeatEnabled).toBe(true);
    expect(schedule.heartbeatIntervalS).toBe(60);

    // 模拟重启：gateway 和 automation 均为全新实例
    const gateway2 = buildTestGateway(homeDir, "心跳恢复正常");
    const runService2 = new EmployeeRunService(employeeRepo, skillRepo, runRepo, gateway2);
    const cron2 = new CronService(join(homeDir, "cron", "jobs.json"));
    const automation2 = new AutomationService(scheduleRepo, employeeRepo, runService2, cron2, gateway2);
    await automation2.start();

    // 验证 heartbeat 已被重新注册到 gateway2
    const restoredSchedules = await scheduleRepo.listActiveByKind("heartbeat");
    expect(restoredSchedules).toHaveLength(1);
    expect(restoredSchedules[0]?.employeeId).toBe(employee.id);

    cron1.stop();
    cron2.stop();
    await db.destroy();
  });

  it("fires heartbeat tick using fake timers", async () => {
    vi.useFakeTimers();
    const homeDir = createTempDir("nextclaw-automation-heartbeat-tick-");
    const db = createPlatformKnex(join(homeDir, "platform.sqlite"));
    await ensurePlatformDatabase(db);

    const employeeRepo = new EmployeeRepository(db);
    const skillRepo = new EmployeeSkillRepository(db);
    const scheduleRepo = new EmployeeScheduleRepository(db);
    const runRepo = new RunRecordRepository(db);
    const employee = await employeeRepo.create({
      name: "心跳 tick 测试",
      code: "heartbeat-tick",
      description: "心跳 tick 触发测试",
      systemPrompt: "你是心跳测试员"
    });

    // 写入有效的 HEARTBEAT.md
    const wsDir = join(homeDir, "agents", employee.code);
    mkdirSync(wsDir, { recursive: true });
    writeFileSync(join(wsDir, "HEARTBEAT.md"), "# HEARTBEAT\n\n执行定期检查", "utf-8");

    const gateway = buildTestGateway(homeDir, "心跳 tick 触发成功");
    const runService = new EmployeeRunService(employeeRepo, skillRepo, runRepo, gateway);
    const cron = new CronService(join(homeDir, "cron", "jobs.json"));
    const automation = new AutomationService(scheduleRepo, employeeRepo, runService, cron, gateway);
    await automation.start();
    await automation.upsertSchedule({
      employeeId: employee.id,
      scheduleKind: "heartbeat",
      everyMs: 5000, // 5 秒间隔用于测试
      enabled: true
    });

    // 推进时间触发心跳
    await vi.advanceTimersByTimeAsync(6000);

    const runs = await runRepo.listByEmployeeId(employee.id);
    expect(runs.length).toBeGreaterThanOrEqual(1);
    expect(runs[0]?.summary).toContain("心跳 tick 触发成功");
    cron.stop();
    vi.useRealTimers();
    await db.destroy();
  });
});
