import { CronService, HeartbeatService } from "@nextclaw/core";
import { EmployeeRepository } from "../repositories/employee-repository";
import {
  EmployeeScheduleRepository,
  type EmployeeScheduleView
} from "../repositories/employee-schedule-repository";
import { EmployeeRunService } from "./employee-run-service";
import type { NextclawEngineGateway } from "../engine/NextclawEngineGateway";
import { resolveEmployeeWorkspace } from "../engine/employee-workspace";

export class AutomationService {
  private started = false;
  private readonly heartbeats: Map<string, HeartbeatService> = new Map();

  constructor(
    private readonly scheduleRepo: EmployeeScheduleRepository,
    private readonly employeeRepo: EmployeeRepository,
    private readonly runService: EmployeeRunService,
    private readonly cronService: CronService,
    private readonly gateway: NextclawEngineGateway
  ) {}

  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    this.cronService.onJob = async (job) => {
      const employeeId = job.name.startsWith("employee:") ? job.name.slice("employee:".length) : "";
      if (!employeeId) {
        return null;
      }
      const employee = await this.employeeRepo.getById(employeeId);
      if (!employee) {
        return null;
      }
      const message = job.payload.message || `${employee.systemPrompt}\n\n请执行一次定时任务并输出最新摘要。`;
      const result = await this.runService.runEmployeeTurn({
        employeeId,
        message,
        triggerType: "scheduled",
        triggerSource: "cron"
      });
      return result.reply;
    };
    await this.cronService.start();
    await this.restartHeartbeatSchedules();
    this.started = true;
  }

  private async restartHeartbeatSchedules(): Promise<void> {
    const schedules = await this.scheduleRepo.listActiveByKind("heartbeat");
    for (const schedule of schedules) {
      const employee = await this.employeeRepo.getById(schedule.employeeId);
      if (!employee || !schedule.heartbeatEnabled) {
        continue;
      }
      const intervalS = schedule.heartbeatIntervalS ?? undefined;
      this.startHeartbeatForEmployee(schedule.employeeId, employee.code, intervalS);
    }
  }

  private startHeartbeatForEmployee(employeeId: string, employeeCode: string, intervalS?: number): void {
    const existing = this.heartbeats.get(employeeId);
    if (existing) {
      existing.stop();
    }
    const workspace = resolveEmployeeWorkspace(this.gateway.homeDir, employeeCode);
    const hb = new HeartbeatService(
      workspace,
      async (prompt) => {
        const result = await this.runService.runEmployeeTurn({
          employeeId,
          message: prompt,
          triggerType: "scheduled",
          triggerSource: "heartbeat"
        });
        return result.reply;
      },
      intervalS,
      true
    );
    this.heartbeats.set(employeeId, hb);
    void hb.start();
  }

  private stopHeartbeatForEmployee(employeeId: string): void {
    const existing = this.heartbeats.get(employeeId);
    if (existing) {
      existing.stop();
      this.heartbeats.delete(employeeId);
    }
  }

  async upsertSchedule(input: {
    employeeId: string;
    scheduleKind: "cron" | "every" | "heartbeat";
    cronExpr?: string | null;
    everyMs?: number | null;
    enabled?: boolean;
  }): Promise<EmployeeScheduleView> {
    const employee = await this.employeeRepo.getById(input.employeeId);
    if (!employee) {
      throw new Error(`Employee not found: ${input.employeeId}`);
    }
    const existing = await this.scheduleRepo.getByEmployeeId(input.employeeId);
    if (existing?.runtimeJobId) {
      this.cronService.removeJob(existing.runtimeJobId);
    }
    this.stopHeartbeatForEmployee(input.employeeId);

    const scheduleMessage = `${employee.systemPrompt}\n\n请按你的职责执行一次定时任务，并输出当前最新摘要。`;

    if (input.scheduleKind === "heartbeat") {
      const intervalS = Math.max(1, Math.floor((input.everyMs ?? 30 * 60 * 1000) / 1000));
      if (input.enabled !== false) {
        this.startHeartbeatForEmployee(input.employeeId, employee.code, intervalS);
      }
      return this.scheduleRepo.upsert({
        employeeId: input.employeeId,
        scheduleKind: "heartbeat",
        cronExpr: null,
        everyMs: input.everyMs ?? null,
        heartbeatEnabled: true,
        heartbeatIntervalS: intervalS,
        enabled: input.enabled ?? true,
        runtimeJobId: null,
        scheduleMessage,
        nextRunAt: null
      });
    }

    const job = this.cronService.addJob({
      name: `employee:${input.employeeId}`,
      schedule:
        input.scheduleKind === "cron"
          ? { kind: "cron", expr: input.cronExpr ?? "0 9 * * *" }
          : { kind: "every", everyMs: Math.max(1_000, Math.trunc(input.everyMs ?? 60_000)) },
      message: scheduleMessage,
      deliver: false
    });
    return this.scheduleRepo.upsert({
      employeeId: input.employeeId,
      scheduleKind: input.scheduleKind,
      cronExpr: input.cronExpr ?? null,
      everyMs: input.everyMs ?? null,
      heartbeatEnabled: false,
      heartbeatIntervalS: null,
      enabled: input.enabled ?? true,
      runtimeJobId: job.id,
      scheduleMessage,
      nextRunAt: job.state.nextRunAtMs ? new Date(job.state.nextRunAtMs).toISOString() : null
    });
  }

  async runNow(employeeId: string): Promise<boolean> {
    const schedule = await this.scheduleRepo.getByEmployeeId(employeeId);
    if (!schedule) {
      return false;
    }
    if (schedule.scheduleKind === "heartbeat") {
      const hb = this.heartbeats.get(employeeId);
      if (!hb) {
        return false;
      }
      await hb.triggerNow();
      return true;
    }
    if (!schedule.runtimeJobId) {
      return false;
    }
    return this.cronService.runJob(schedule.runtimeJobId, true);
  }

  stop(): void {
    for (const employeeId of [...this.heartbeats.keys()]) {
      this.stopHeartbeatForEmployee(employeeId);
    }
    this.cronService.stop();
    this.started = false;
  }

  async clearSchedule(employeeId: string): Promise<void> {
    const existing = await this.scheduleRepo.getByEmployeeId(employeeId);
    if (existing?.runtimeJobId) {
      this.cronService.removeJob(existing.runtimeJobId);
    }
    this.stopHeartbeatForEmployee(employeeId);
    await this.scheduleRepo.deleteByEmployeeId(employeeId);
  }
}
