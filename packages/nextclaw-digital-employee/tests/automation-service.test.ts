import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CronService } from "@nextclaw/core";
import { createTestKnex, ensureTestDatabase } from "./test-db";
import { EmployeeRepository } from "../server/repositories/employee-repository";
import { EmployeeScheduleRepository } from "../server/repositories/employee-schedule-repository";
import { EmployeeScheduleJobRepository } from "../server/repositories/employee-schedule-job-repository";
import { EmployeeSkillRepository } from "../server/repositories/employee-skill-repository";
import { RunRecordRepository } from "../server/repositories/run-record-repository";
import { ChatSessionRepository } from "../server/repositories/chat-session-repository";
import { ChatMessageRepository } from "../server/repositories/chat-message-repository";
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

function buildRejectingGateway(homeDir: string, message = "定时任务执行异常"): NextclawEngineGateway {
  const gateway = buildTestGateway(homeDir);
  vi.spyOn(gateway, "runEmployeeTurn").mockRejectedValue(new Error(message));
  return gateway;
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
    const db = createTestKnex();
    await ensureTestDatabase(db);

    const employeeRepo = new EmployeeRepository(db);
    const skillRepo = new EmployeeSkillRepository(db);
    const scheduleRepo = new EmployeeScheduleRepository(db);
    const jobRepo = new EmployeeScheduleJobRepository(db);    const runRepo = new RunRecordRepository(db);
    const employee = await employeeRepo.create({
      name: "项目管理助手",
      code: "project-manager",
      description: "每天自动汇总项目状态",
      systemPrompt: "你是项目管理助手"
    });

    const gateway = buildTestGateway(homeDir, "cron 任务已完成");
    const runService = new EmployeeRunService(employeeRepo, skillRepo, runRepo, gateway);
    const cron = new CronService(join(homeDir, "cron", "jobs.json"));
    const automation = new AutomationService(scheduleRepo, jobRepo, employeeRepo, runService, cron, gateway);
    await automation.start();

    const schedule = await automation.upsertSchedule({
      employeeId: employee.id,
      scheduleKind: "cron",
      cronExpr: "0 18 * * *",
      enabled: true,
      actorUserId: "user-schedule-owner"
    });

    await automation.runNow(employee.id);
    const runs = await runRepo.listByEmployeeId(employee.id);

    expect(schedule.scheduleKind).toBe("cron");
    expect(schedule.createdByUserId).toBe("user-schedule-owner");
    expect(schedule.updatedByUserId).toBe("user-schedule-owner");
    expect(schedule.runtimeJobId).toBeTruthy();
    expect(runs).toHaveLength(1);
    expect(runs[0]?.summary).toContain("cron 任务已完成");
    cron.stop();
    await db.destroy();
  });

  it("persists cron job to disk so it survives a server restart", async () => {
    const homeDir = createTempDir("nextclaw-automation-cron-restart-");
    const db = createTestKnex();
    await ensureTestDatabase(db);

    const employeeRepo = new EmployeeRepository(db);
    const skillRepo = new EmployeeSkillRepository(db);
    const scheduleRepo = new EmployeeScheduleRepository(db);
    const jobRepo = new EmployeeScheduleJobRepository(db);    const runRepo = new RunRecordRepository(db);
    const employee = await employeeRepo.create({
      name: "日报助手",
      code: "daily-reporter",
      description: "生成日报",
      systemPrompt: "你是日报助手"
    });

    const gateway = buildTestGateway(homeDir, "日报已生成");
    const runService = new EmployeeRunService(employeeRepo, skillRepo, runRepo, gateway);
    const cron1 = new CronService(join(homeDir, "cron", "jobs.json"));
    const automation1 = new AutomationService(scheduleRepo, jobRepo, employeeRepo, runService, cron1, gateway);
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
    const automation2 = new AutomationService(scheduleRepo, jobRepo, employeeRepo, runService, cron2, gateway);
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
    const db = createTestKnex();
    await ensureTestDatabase(db);

    const employeeRepo = new EmployeeRepository(db);
    const skillRepo = new EmployeeSkillRepository(db);
    const scheduleRepo = new EmployeeScheduleRepository(db);
    const jobRepo = new EmployeeScheduleJobRepository(db);    const runRepo = new RunRecordRepository(db);
    const employee = await employeeRepo.create({
      name: "监控助手",
      code: "monitor",
      description: "每隔 30 分钟巡检",
      systemPrompt: "你是监控助手"
    });

    const gateway = buildTestGateway(homeDir, "巡检完毕");
    const runService = new EmployeeRunService(employeeRepo, skillRepo, runRepo, gateway);
    const cron = new CronService(join(homeDir, "cron", "jobs.json"));
    const automation = new AutomationService(scheduleRepo, jobRepo, employeeRepo, runService, cron, gateway);
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
    const db = createTestKnex();
    await ensureTestDatabase(db);

    const employeeRepo = new EmployeeRepository(db);
    const skillRepo = new EmployeeSkillRepository(db);
    const scheduleRepo = new EmployeeScheduleRepository(db);
    const jobRepo = new EmployeeScheduleJobRepository(db);    const runRepo = new RunRecordRepository(db);
    const employee = await employeeRepo.create({
      name: "定时检测",
      code: "interval-worker",
      description: "每 5 秒自动触发",
      systemPrompt: "你是定时检测助手"
    });

    const gateway = buildTestGateway(homeDir, "interval 触发成功");
    const runService = new EmployeeRunService(employeeRepo, skillRepo, runRepo, gateway);
    const cron = new CronService(join(homeDir, "cron", "jobs.json"));
    const automation = new AutomationService(scheduleRepo, jobRepo, employeeRepo, runService, cron, gateway);
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
    vi.useFakeTimers();
    const homeDir = createTempDir("nextclaw-automation-heartbeat-");
    const db = createTestKnex();
    await ensureTestDatabase(db);

    const employeeRepo = new EmployeeRepository(db);
    const skillRepo = new EmployeeSkillRepository(db);
    const scheduleRepo = new EmployeeScheduleRepository(db);
    const jobRepo = new EmployeeScheduleJobRepository(db);    const runRepo = new RunRecordRepository(db);
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
    const automation1 = new AutomationService(scheduleRepo, jobRepo, employeeRepo, runService1, cron1, gateway1);
    await automation1.start();

    const schedule = await automation1.upsertSchedule({
      employeeId: employee.id,
      scheduleKind: "heartbeat",
      everyMs: 5_000, // 5 秒，配合 fake timer 快速触发
      enabled: true
    });

    expect(schedule.scheduleKind).toBe("heartbeat");
    expect(schedule.heartbeatEnabled).toBe(true);
    expect(schedule.heartbeatIntervalS).toBe(5);

    // 模拟干净关闭（同时停止 cron + 所有 heartbeat timer）
    automation1.stop();

    // 模拟重启：gateway 和 automation 均为全新实例
    const gateway2 = buildTestGateway(homeDir, "心跳恢复正常");
    const runService2 = new EmployeeRunService(employeeRepo, skillRepo, runRepo, gateway2);
    const cron2 = new CronService(join(homeDir, "cron", "jobs.json"));
    const automation2 = new AutomationService(scheduleRepo, jobRepo, employeeRepo, runService2, cron2, gateway2);
    await automation2.start();

    // DB 记录应已被 automation2 恢复
    const restoredSchedules = await scheduleRepo.listActiveByKind("heartbeat");
    expect(restoredSchedules).toHaveLength(1);
    expect(restoredSchedules[0]?.employeeId).toBe(employee.id);

    // 推进 fake timer，触发 automation2 的心跳 tick
    await vi.advanceTimersByTimeAsync(6_000);

    // 核心验证：automation2 的 HeartbeatService 确实重新注册并触发，产生了新的运行记录
    const runs = await runRepo.listByEmployeeId(employee.id);
    expect(runs.length).toBeGreaterThanOrEqual(1);
    // gateway2 的 reply 是 "心跳恢复正常"，证明是新实例的 timer 触发，而不是重启前已有的 DB 记录
    expect(runs.some((r) => r.summary?.includes("心跳恢复正常"))).toBe(true);

    automation2.stop();
    vi.useRealTimers();
    await db.destroy();
  });

  it("fires heartbeat tick using fake timers", async () => {
    vi.useFakeTimers();
    const homeDir = createTempDir("nextclaw-automation-heartbeat-tick-");
    const db = createTestKnex();
    await ensureTestDatabase(db);

    const employeeRepo = new EmployeeRepository(db);
    const skillRepo = new EmployeeSkillRepository(db);
    const scheduleRepo = new EmployeeScheduleRepository(db);
    const jobRepo = new EmployeeScheduleJobRepository(db);    const runRepo = new RunRecordRepository(db);
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
    const automation = new AutomationService(scheduleRepo, jobRepo, employeeRepo, runService, cron, gateway);
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

  it("runNow works for a heartbeat schedule", async () => {
    const homeDir = createTempDir("nextclaw-automation-heartbeat-runnow-");
    const db = createTestKnex();
    await ensureTestDatabase(db);

    const employeeRepo = new EmployeeRepository(db);
    const skillRepo = new EmployeeSkillRepository(db);
    const scheduleRepo = new EmployeeScheduleRepository(db);
    const jobRepo = new EmployeeScheduleJobRepository(db);    const runRepo = new RunRecordRepository(db);
    const employee = await employeeRepo.create({
      name: "手动触发心跳",
      code: "manual-heartbeat",
      description: "手动触发心跳测试",
      systemPrompt: "你是心跳测试员"
    });

    const wsDir = join(homeDir, "agents", employee.code);
    mkdirSync(wsDir, { recursive: true });
    writeFileSync(join(wsDir, "HEARTBEAT.md"), "# HEARTBEAT\n\n立即执行检查", "utf-8");

    const gateway = buildTestGateway(homeDir, "手动心跳已触发");
    const runService = new EmployeeRunService(employeeRepo, skillRepo, runRepo, gateway);
    const cron = new CronService(join(homeDir, "cron", "jobs.json"));
    const automation = new AutomationService(scheduleRepo, jobRepo, employeeRepo, runService, cron, gateway);
    await automation.start();
    await automation.upsertSchedule({
      employeeId: employee.id,
      scheduleKind: "heartbeat",
      everyMs: 60_000,
      enabled: true
    });

    // runNow 必须对 heartbeat 类型返回 true 并产生 run record
    const triggered = await automation.runNow(employee.id);
    expect(triggered).toBe(true);

    const runs = await runRepo.listByEmployeeId(employee.id);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.summary).toContain("手动心跳已触发");
    automation.stop();
    await db.destroy();
  });

  it("stores heartbeat runNow records in chat sessions", async () => {
    const homeDir = createTempDir("nextclaw-automation-heartbeat-chat-session-");
    const db = createTestKnex();
    await ensureTestDatabase(db);

    const employeeRepo = new EmployeeRepository(db);
    const skillRepo = new EmployeeSkillRepository(db);
    const scheduleRepo = new EmployeeScheduleRepository(db);
    const jobRepo = new EmployeeScheduleJobRepository(db);    const runRepo = new RunRecordRepository(db);
    const chatSessionRepo = new ChatSessionRepository(db);
    const chatMessageRepo = new ChatMessageRepository(db);
    const employee = await employeeRepo.create({
      name: "聊天归档心跳",
      code: "heartbeat-chat-archive",
      description: "验证心跳运行写入会话",
      systemPrompt: "你是心跳测试员"
    });

    const wsDir = join(homeDir, "agents", employee.code);
    mkdirSync(wsDir, { recursive: true });
    writeFileSync(join(wsDir, "HEARTBEAT.md"), "# HEARTBEAT\n\n执行聊天归档检查", "utf-8");

    const gateway = buildTestGateway(homeDir, "心跳聊天归档成功");
    const runService = new EmployeeRunService(
      employeeRepo,
      skillRepo,
      runRepo,
      gateway,
      undefined,
      chatSessionRepo,
      chatMessageRepo
    );
    const cron = new CronService(join(homeDir, "cron", "jobs.json"));
    const automation = new AutomationService(scheduleRepo, jobRepo, employeeRepo, runService, cron, gateway);
    await automation.start();
    await automation.upsertSchedule({
      employeeId: employee.id,
      scheduleKind: "heartbeat",
      everyMs: 60_000,
      enabled: true
    });

    const triggered = await automation.runNow(employee.id);
    expect(triggered).toBe(true);

    const sessionKey = `employee:${employee.id}:scheduled:heartbeat`;
    const sessions = await chatSessionRepo.listByEmployeeId(employee.id);
    expect(sessions.some((session) => session.sessionKey === sessionKey)).toBe(true);

    const storedSession = sessions.find((session) => session.sessionKey === sessionKey);
    const page = await chatMessageRepo.listBySessionId({
      sessionId: storedSession!.id,
      limit: 10
    });
    expect(page.items.some((item) => item.role === "assistant" && item.content.includes("心跳聊天归档成功"))).toBe(true);

    automation.stop();
    await db.destroy();
  });

  it("disabled heartbeat schedule does not start the timer", async () => {
    vi.useFakeTimers();
    const homeDir = createTempDir("nextclaw-automation-heartbeat-disabled-");
    const db = createTestKnex();
    await ensureTestDatabase(db);

    const employeeRepo = new EmployeeRepository(db);
    const skillRepo = new EmployeeSkillRepository(db);
    const scheduleRepo = new EmployeeScheduleRepository(db);
    const jobRepo = new EmployeeScheduleJobRepository(db);    const runRepo = new RunRecordRepository(db);
    const employee = await employeeRepo.create({
      name: "禁用心跳",
      code: "disabled-heartbeat",
      description: "禁用状态心跳不应触发",
      systemPrompt: "你是禁用心跳测试员"
    });

    const wsDir = join(homeDir, "agents", employee.code);
    mkdirSync(wsDir, { recursive: true });
    writeFileSync(join(wsDir, "HEARTBEAT.md"), "# HEARTBEAT\n\n执行检查", "utf-8");

    const gateway = buildTestGateway(homeDir, "不应出现的触发");
    const runService = new EmployeeRunService(employeeRepo, skillRepo, runRepo, gateway);
    const cron = new CronService(join(homeDir, "cron", "jobs.json"));
    const automation = new AutomationService(scheduleRepo, jobRepo, employeeRepo, runService, cron, gateway);
    await automation.start();

    // 以 enabled: false 创建 heartbeat 调度
    await automation.upsertSchedule({
      employeeId: employee.id,
      scheduleKind: "heartbeat",
      everyMs: 5_000,
      enabled: false
    });

    // 推进时间，不应有任何触发
    await vi.advanceTimersByTimeAsync(10_000);

    const runs = await runRepo.listByEmployeeId(employee.id);
    expect(runs).toHaveLength(0);

    automation.stop();
    vi.useRealTimers();
    await db.destroy();
  });

  it("HeartbeatService.start() is idempotent - double call does not create duplicate timers", async () => {
    vi.useFakeTimers();
    const homeDir = createTempDir("nextclaw-automation-heartbeat-idem-");
    const db = createTestKnex();
    await ensureTestDatabase(db);

    const employeeRepo = new EmployeeRepository(db);
    const skillRepo = new EmployeeSkillRepository(db);
    const scheduleRepo = new EmployeeScheduleRepository(db);
    const jobRepo = new EmployeeScheduleJobRepository(db);    const runRepo = new RunRecordRepository(db);
    const employee = await employeeRepo.create({
      name: "幂等心跳",
      code: "idempotent-heartbeat",
      description: "幂等启动测试",
      systemPrompt: "你是幂等测试员"
    });

    const wsDir = join(homeDir, "agents", employee.code);
    mkdirSync(wsDir, { recursive: true });
    writeFileSync(join(wsDir, "HEARTBEAT.md"), "# HEARTBEAT\n\n执行检查", "utf-8");

    const gateway = buildTestGateway(homeDir, "幂等触发");
    const runService = new EmployeeRunService(employeeRepo, skillRepo, runRepo, gateway);
    const cron = new CronService(join(homeDir, "cron", "jobs.json"));
    const automation = new AutomationService(scheduleRepo, jobRepo, employeeRepo, runService, cron, gateway);
    await automation.start();

    // 连续两次 upsert 相同 heartbeat（第二次内部会调用 existing.stop() + new start()，
    // 但若 HeartbeatService.start() 不幂等，旧 timer 可能未被清理就再次 start）
    await automation.upsertSchedule({
      employeeId: employee.id,
      scheduleKind: "heartbeat",
      everyMs: 5_000,
      enabled: true
    });
    // 第二次 upsert：stopHeartbeatForEmployee + startHeartbeatForEmployee
    await automation.upsertSchedule({
      employeeId: employee.id,
      scheduleKind: "heartbeat",
      everyMs: 5_000,
      enabled: true
    });

    await vi.advanceTimersByTimeAsync(6_000);

    const runs = await runRepo.listByEmployeeId(employee.id);
    // 如果有 timer 泄漏，run 数量可能 > 1；正确实现应恰好为 1
    expect(runs).toHaveLength(1);

    automation.stop();
    vi.useRealTimers();
    await db.destroy();
  });
});

describe("automation service - chat persistence", () => {
  it("persists manually triggered job replies into scheduled chat sessions", async () => {
    const homeDir = createTempDir("nextclaw-automation-job-chat-session-");
    const db = createTestKnex();
    await ensureTestDatabase(db);

    const employeeRepo = new EmployeeRepository(db);
    const skillRepo = new EmployeeSkillRepository(db);
    const scheduleRepo = new EmployeeScheduleRepository(db);
    const jobRepo = new EmployeeScheduleJobRepository(db);
    const runRepo = new RunRecordRepository(db);
    const chatSessionRepo = new ChatSessionRepository(db);
    const chatMessageRepo = new ChatMessageRepository(db);
    const employee = await employeeRepo.create({
      name: "手动任务归档",
      code: "manual-job-chat",
      description: "验证立即执行任务写入聊天会话",
      systemPrompt: "你是任务归档测试员"
    });

    const gateway = buildTestGateway(homeDir, "立即执行任务已完成");
    const runService = new EmployeeRunService(
      employeeRepo,
      skillRepo,
      runRepo,
      gateway,
      undefined,
      chatSessionRepo,
      chatMessageRepo
    );
    const cron = new CronService(join(homeDir, "cron", "jobs.json"));
    const automation = new AutomationService(scheduleRepo, jobRepo, employeeRepo, runService, cron, gateway);
    await automation.start();

    const job = await automation.createJob({
      employeeId: employee.id,
      name: "每日同步",
      scheduleKind: "cron",
      cronExpr: "0 9 * * *",
      taskPrompt: "请执行每日同步并给出摘要",
      enabled: true,
      actorUserId: "user-job-creator"
    });

    expect(job.createdByUserId).toBe("user-job-creator");
    expect(job.updatedByUserId).toBe("user-job-creator");

    const outcome = await automation.runJobNow(job.id);
    expect(outcome.triggered).toBe(true);

    const sessionKey = `employee:${employee.id}:scheduled:job:${job.id}`;
    const sessions = await chatSessionRepo.listByEmployeeId(employee.id);
    expect(sessions.some((session) => session.sessionKey === sessionKey)).toBe(true);

    const storedSession = sessions.find((session) => session.sessionKey === sessionKey);
    expect(storedSession).toMatchObject({
      createdByUserId: "user-job-creator",
      source: "scheduled",
      sourceLabel: "定时任务"
    });
    const page = await chatMessageRepo.listBySessionId({
      sessionId: storedSession!.id,
      limit: 10
    });
    expect(page.items.some((item) => item.role === "assistant" && item.content.includes("立即执行任务已完成"))).toBe(true);

    automation.stop();
    await db.destroy();
  });

  it("records updater when a schedule job is modified", async () => {
    const homeDir = createTempDir("nextclaw-automation-job-audit-update-");
    const db = createTestKnex();
    await ensureTestDatabase(db);

    const employeeRepo = new EmployeeRepository(db);
    const skillRepo = new EmployeeSkillRepository(db);
    const scheduleRepo = new EmployeeScheduleRepository(db);
    const jobRepo = new EmployeeScheduleJobRepository(db);
    const runRepo = new RunRecordRepository(db);
    const employee = await employeeRepo.create({
      name: "任务审计",
      code: "job-audit",
      description: "验证定时任务修改人记录",
      systemPrompt: "你是任务审计测试员"
    });

    const gateway = buildTestGateway(homeDir, "任务更新成功");
    const runService = new EmployeeRunService(employeeRepo, skillRepo, runRepo, gateway);
    const cron = new CronService(join(homeDir, "cron", "jobs.json"));
    const automation = new AutomationService(scheduleRepo, jobRepo, employeeRepo, runService, cron, gateway);
    await automation.start();

    const job = await automation.createJob({
      employeeId: employee.id,
      name: "初始任务",
      scheduleKind: "every",
      everyMs: 60_000,
      enabled: true,
      actorUserId: "user-job-creator"
    });

    const updated = await automation.updateJob(job.id, {
      name: "更新后任务",
      actorUserId: "user-job-updater"
    });

    expect(updated.name).toBe("更新后任务");
    expect(updated.createdByUserId).toBe("user-job-creator");
    expect(updated.updatedByUserId).toBe("user-job-updater");

    automation.stop();
    await db.destroy();
  });

  it("persists failed scheduled job replies into chat sessions", async () => {
    const homeDir = createTempDir("nextclaw-automation-job-chat-failure-");
    const db = createTestKnex();
    await ensureTestDatabase(db);

    const employeeRepo = new EmployeeRepository(db);
    const skillRepo = new EmployeeSkillRepository(db);
    const scheduleRepo = new EmployeeScheduleRepository(db);
    const jobRepo = new EmployeeScheduleJobRepository(db);
    const runRepo = new RunRecordRepository(db);
    const chatSessionRepo = new ChatSessionRepository(db);
    const chatMessageRepo = new ChatMessageRepository(db);
    const employee = await employeeRepo.create({
      name: "失败任务归档",
      code: "failed-job-chat",
      description: "验证失败任务写入聊天会话",
      systemPrompt: "你是失败任务测试员"
    });

    const gateway = buildRejectingGateway(homeDir, "engine crash");
    const runService = new EmployeeRunService(
      employeeRepo,
      skillRepo,
      runRepo,
      gateway,
      undefined,
      chatSessionRepo,
      chatMessageRepo
    );
    const cron = new CronService(join(homeDir, "cron", "jobs.json"));
    const automation = new AutomationService(scheduleRepo, jobRepo, employeeRepo, runService, cron, gateway);
    await automation.start();

    const job = await automation.createJob({
      employeeId: employee.id,
      name: "失败同步",
      scheduleKind: "cron",
      cronExpr: "0 9 * * *",
      taskPrompt: "请执行失败同步",
      enabled: true
    });

    const outcome = await automation.runJobNow(job.id);
    expect(outcome).toMatchObject({
      triggered: false,
      reason: "engine_failed"
    });
    expect((outcome as { message: string }).message).toContain("engine crash");

    const sessionKey = `employee:${employee.id}:scheduled:job:${job.id}`;
    const sessions = await chatSessionRepo.listByEmployeeId(employee.id);
    expect(sessions.some((session) => session.sessionKey === sessionKey)).toBe(true);

    const storedSession = sessions.find((session) => session.sessionKey === sessionKey);
    const page = await chatMessageRepo.listBySessionId({
      sessionId: storedSession!.id,
      limit: 10
    });
    expect(page.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: "assistant",
        content: "执行失败：engine crash"
      })
    ]));

    const runs = await runRepo.listByEmployeeIdAndSessionKey({
      employeeId: employee.id,
      sessionKey,
      limit: 1
    });
    expect(runs[0]?.status).toBe("failed");

    automation.stop();
    await db.destroy();
  });
});

// ── nextRunAt 同步回归测试 ────────────────────────────────────────────────────
// Bug: AutomationService 仅在 upsertSchedule 时向 DB 写入初始 nextRunAt，
//      任务自动执行后 CronService 内存里的 nextRunAtMs 已更新，但 DB 里的
//      nextRunAt 从未同步，导致 Dashboard/UI 始终显示初始值（"下次运行时间"不更新）。
// Fix: onBatchComplete 回调在每次批量执行后调用 scheduleRepo.patchNextRunAt。
describe("automation service - nextRunAt syncs to DB after automatic execution (regression)", () => {
  it("scheduleRepo.nextRunAt updates after every-interval job fires automatically", async () => {
    vi.useFakeTimers();
    const homeDir = createTempDir("nextclaw-automation-nextrun-every-");
    const db = createTestKnex();
    await ensureTestDatabase(db);

    const employeeRepo = new EmployeeRepository(db);
    const skillRepo = new EmployeeSkillRepository(db);
    const scheduleRepo = new EmployeeScheduleRepository(db);
    const jobRepo = new EmployeeScheduleJobRepository(db);    const runRepo = new RunRecordRepository(db);
    const employee = await employeeRepo.create({
      name: "自动同步测试员",
      code: "auto-sync-worker",
      description: "每 5 秒触发，验证 nextRunAt 同步",
      systemPrompt: "你是同步测试员"
    });

    const gateway = buildTestGateway(homeDir, "自动执行完毕");
    const runService = new EmployeeRunService(employeeRepo, skillRepo, runRepo, gateway);
    const cron = new CronService(join(homeDir, "cron", "jobs.json"));
    const automation = new AutomationService(scheduleRepo, jobRepo, employeeRepo, runService, cron, gateway);
    await automation.start();

    const schedule = await automation.upsertSchedule({
      employeeId: employee.id,
      scheduleKind: "every",
      everyMs: 5_000,
      enabled: true
    });

    const initialNextRunAt = schedule.nextRunAt;
    expect(initialNextRunAt).not.toBeNull();

    // 让定时器自动触发
    await vi.advanceTimersByTimeAsync(6_000);

    // 核心断言：DB 里的 nextRunAt 必须更新，不能仍是初始值
    const updatedSchedule = await scheduleRepo.getByEmployeeId(employee.id);
    expect(updatedSchedule?.nextRunAt).not.toBeNull();
    expect(updatedSchedule?.nextRunAt).not.toBe(initialNextRunAt);
    // 更新后的时间应大于初始 nextRunAt
    expect(new Date(updatedSchedule!.nextRunAt!).getTime()).toBeGreaterThan(
      new Date(initialNextRunAt!).getTime()
    );

    cron.stop();
    vi.useRealTimers();
    await db.destroy();
  });

  it("scheduleRepo.nextRunAt updates after cron-expr job fires automatically", async () => {
    vi.useFakeTimers();
    const baseTime = new Date("2026-01-01T00:00:00.000Z").getTime();
    vi.setSystemTime(baseTime);

    const homeDir = createTempDir("nextclaw-automation-nextrun-cron-");
    const db = createTestKnex();
    await ensureTestDatabase(db);

    const employeeRepo = new EmployeeRepository(db);
    const skillRepo = new EmployeeSkillRepository(db);
    const scheduleRepo = new EmployeeScheduleRepository(db);
    const jobRepo = new EmployeeScheduleJobRepository(db);    const runRepo = new RunRecordRepository(db);
    const employee = await employeeRepo.create({
      name: "每20分钟员工",
      code: "every-20min-worker",
      description: "验证 cron 表达式任务自动执行后 nextRunAt 更新",
      systemPrompt: "你是每20分钟员工"
    });

    const gateway = buildTestGateway(homeDir, "cron 自动执行完毕");
    const runService = new EmployeeRunService(employeeRepo, skillRepo, runRepo, gateway);
    const cron = new CronService(join(homeDir, "cron", "jobs.json"));
    const automation = new AutomationService(scheduleRepo, jobRepo, employeeRepo, runService, cron, gateway);
    await automation.start();

    // 每 5 秒触发一次，使用 every 模式便于精确控制时序（不受本机时区影响）
    const schedule = await automation.upsertSchedule({
      employeeId: employee.id,
      scheduleKind: "every",
      everyMs: 5_000,
      enabled: true
    });

    const initialNextRunAt = schedule.nextRunAt;
    expect(initialNextRunAt).not.toBeNull();
    // initialNextRunAt 应为 5 秒后
    expect(new Date(initialNextRunAt!).getTime()).toBe(baseTime + 5_000);

    // 推进 6 秒，触发第一次自动执行
    await vi.advanceTimersByTimeAsync(6_000);

    // 关键断言：scheduleRepo 里的 nextRunAt 必须更新，不应停留在初始值
    const updatedSchedule = await scheduleRepo.getByEmployeeId(employee.id);
    expect(updatedSchedule?.nextRunAt).not.toBeNull();
    expect(updatedSchedule?.nextRunAt).not.toBe(initialNextRunAt);
    // 更新后的时间应大于初始 nextRunAt
    expect(new Date(updatedSchedule!.nextRunAt!).getTime()).toBeGreaterThan(
      new Date(initialNextRunAt!).getTime()
    );

    // 确认任务确实执行了
    const runs = await runRepo.listByEmployeeId(employee.id);
    expect(runs.length).toBeGreaterThanOrEqual(1);

    cron.stop();
    vi.useRealTimers();
    await db.destroy();
  });

  it("scheduleRepo.nextRunAt does NOT update on manual runNow (only auto-timer)", async () => {
    const homeDir = createTempDir("nextclaw-automation-nextrun-manual-");
    const db = createTestKnex();
    await ensureTestDatabase(db);

    const employeeRepo = new EmployeeRepository(db);
    const skillRepo = new EmployeeSkillRepository(db);
    const scheduleRepo = new EmployeeScheduleRepository(db);
    const jobRepo = new EmployeeScheduleJobRepository(db);    const runRepo = new RunRecordRepository(db);
    const employee = await employeeRepo.create({
      name: "手动触发员工",
      code: "manual-trigger-worker",
      description: "手动触发不影响 nextRunAt",
      systemPrompt: "你是手动触发测试员"
    });

    const gateway = buildTestGateway(homeDir, "手动执行完毕");
    const runService = new EmployeeRunService(employeeRepo, skillRepo, runRepo, gateway);
    const cron = new CronService(join(homeDir, "cron", "jobs.json"));
    const automation = new AutomationService(scheduleRepo, jobRepo, employeeRepo, runService, cron, gateway);
    await automation.start();

    const schedule = await automation.upsertSchedule({
      employeeId: employee.id,
      scheduleKind: "every",
      everyMs: 3_600_000, // 1 小时，确保测试期间不自动触发
      enabled: true
    });

    const initialNextRunAt = schedule.nextRunAt;

    // 手动立即执行
    await automation.runNow(employee.id);

    // 手动执行后 scheduleRepo.nextRunAt 不应改变
    // （nextRunAt 保留到下次自动执行时间，而不是"刚才手动执行的时间"）
    const afterManual = await scheduleRepo.getByEmployeeId(employee.id);
    expect(afterManual?.nextRunAt).toBe(initialNextRunAt);

    cron.stop();
    await db.destroy();
  });
});
