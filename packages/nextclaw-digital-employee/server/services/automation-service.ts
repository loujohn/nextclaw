import { CronService, HeartbeatService, type CronJob } from "@nextclaw/core";
import { EmployeeRepository } from "../repositories/employee-repository";
import {
  EmployeeScheduleRepository,
  type EmployeeScheduleView
} from "../repositories/employee-schedule-repository";
import {
  EmployeeScheduleJobRepository,
  type EmployeeScheduleJobView
} from "../repositories/employee-schedule-job-repository";
import { EmployeeRunService } from "./employee-run-service";
import type { NextclawEngineGateway } from "../engine/NextclawEngineGateway";
import { resolveEmployeeWorkspace } from "../engine/employee-workspace";

export class AutomationService {
  private started = false;
  private readonly heartbeats: Map<string, HeartbeatService> = new Map();
  private readonly jobHeartbeats: Map<string, HeartbeatService> = new Map();

  constructor(
    private readonly scheduleRepo: EmployeeScheduleRepository,
    private readonly jobRepo: EmployeeScheduleJobRepository,
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
      // New multi-job format: ejob:{jobId}
      if (job.name.startsWith("ejob:")) {
        const jobId = job.name.slice("ejob:".length);
        const schedJob = await this.jobRepo.getById(jobId);
        if (!schedJob) return null;
        const employee = await this.employeeRepo.getById(schedJob.employeeId);
        if (!employee) return null;
        const message = schedJob.taskPrompt?.trim()
          ? schedJob.taskPrompt
          : `${employee.systemPrompt}\n\n请按你的职责执行一次定时任务，并输出当前最新摘要。`;
        const result = await this.runService.runEmployeeTurn({
          employeeId: schedJob.employeeId,
          message,
          triggerType: "scheduled",
          triggerSource: "cron"
        });
        return result.reply;
      }
      // Legacy format: employee:{employeeId}
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

    // After each automatic execution batch, sync updated nextRunAtMs back to DB.
    this.cronService.onBatchComplete = (executedJobs) => {
      void this.syncNextRunForJobs(executedJobs);
    };
    await this.cronService.start();
    await this.restartHeartbeatSchedules();
    await this.restartJobSchedules();
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

  private async restartJobSchedules(): Promise<void> {
    const jobs = await this.jobRepo.listAllEnabled();
    const existingCronJobIds = new Set(this.cronService.listJobs(true).map((j) => j.id));

    for (const job of jobs) {
      const employee = await this.employeeRepo.getById(job.employeeId);
      if (!employee) continue;

      if (job.scheduleKind === "heartbeat") {
        const intervalS = job.heartbeatIntervalS ?? undefined;
        this.startJobHeartbeat(job.id, job.employeeId, employee.code, intervalS, job.taskPrompt);
        continue;
      }

      // If already loaded from jobs.json on CronService start, skip re-registration
      if (job.runtimeJobId && existingCronJobIds.has(job.runtimeJobId)) {
        continue;
      }

      // Not in CronService yet (e.g. jobs.json was cleared), re-register fresh
      const cronJob = this.cronService.addJob({
        name: `ejob:${job.id}`,
        schedule:
          job.scheduleKind === "cron"
            ? { kind: "cron", expr: job.cronExpr ?? "0 9 * * *" }
            : { kind: "every", everyMs: Math.max(1_000, Math.trunc(job.everyMs ?? 60_000)) },
        message: job.taskPrompt,
        deliver: false
      });
      await this.jobRepo.patchRuntimeJobId(job.id, cronJob.id);
      const nextRunAt = cronJob.state.nextRunAtMs ? new Date(cronJob.state.nextRunAtMs).toISOString() : null;
      await this.jobRepo.patchNextRunAt(job.id, nextRunAt);
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

  private startJobHeartbeat(
    jobId: string,
    employeeId: string,
    employeeCode: string,
    intervalS?: number,
    taskPrompt?: string
  ): void {
    const existing = this.jobHeartbeats.get(jobId);
    if (existing) {
      existing.stop();
    }
    const workspace = resolveEmployeeWorkspace(this.gateway.homeDir, employeeCode);
    const hb = new HeartbeatService(
      workspace,
      async (prompt) => {
        const message = taskPrompt?.trim() ? taskPrompt : prompt;
        const result = await this.runService.runEmployeeTurn({
          employeeId,
          message,
          triggerType: "scheduled",
          triggerSource: "heartbeat"
        });
        return result.reply;
      },
      intervalS,
      true
    );
    this.jobHeartbeats.set(jobId, hb);
    void hb.start();
  }

  private stopJobHeartbeat(jobId: string): void {
    const existing = this.jobHeartbeats.get(jobId);
    if (existing) {
      existing.stop();
      this.jobHeartbeats.delete(jobId);
    }
  }

  // ── Legacy single-schedule API (kept for backward compatibility) ──────────

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

  async clearSchedule(employeeId: string): Promise<void> {
    const existing = await this.scheduleRepo.getByEmployeeId(employeeId);
    if (existing?.runtimeJobId) {
      this.cronService.removeJob(existing.runtimeJobId);
    }
    this.stopHeartbeatForEmployee(employeeId);
    await this.scheduleRepo.deleteByEmployeeId(employeeId);
  }

  // ── Multi-job API ─────────────────────────────────────────────────────────

  async listJobsForEmployee(employeeId: string): Promise<EmployeeScheduleJobView[]> {
    return this.jobRepo.listByEmployeeId(employeeId);
  }

  async createJob(input: {
    employeeId: string;
    name: string;
    description?: string;
    scheduleKind: "cron" | "every" | "heartbeat";
    cronExpr?: string | null;
    everyMs?: number | null;
    taskPrompt?: string;
    enabled?: boolean;
  }): Promise<EmployeeScheduleJobView> {
    const employee = await this.employeeRepo.getById(input.employeeId);
    if (!employee) throw new Error(`Employee not found: ${input.employeeId}`);

    if (input.scheduleKind === "heartbeat") {
      const intervalS = Math.max(1, Math.floor((input.everyMs ?? 30 * 60 * 1000) / 1000));
      const job = await this.jobRepo.create({
        employeeId: input.employeeId,
        name: input.name,
        description: input.description,
        scheduleKind: "heartbeat",
        everyMs: input.everyMs ?? null,
        heartbeatIntervalS: intervalS,
        taskPrompt: input.taskPrompt ?? "",
        enabled: input.enabled ?? true
      });
      if (input.enabled !== false) {
        this.startJobHeartbeat(job.id, input.employeeId, employee.code, intervalS, input.taskPrompt);
      }
      return job;
    }

    // Create DB record first to get the stable jobId, then register CronService job
    const job = await this.jobRepo.create({
      employeeId: input.employeeId,
      name: input.name,
      description: input.description,
      scheduleKind: input.scheduleKind,
      cronExpr: input.cronExpr ?? null,
      everyMs: input.everyMs ?? null,
      taskPrompt: input.taskPrompt ?? "",
      enabled: input.enabled ?? true
    });

    if (input.enabled !== false) {
      const cronJob = this.cronService.addJob({
        name: `ejob:${job.id}`,
        schedule:
          input.scheduleKind === "cron"
            ? { kind: "cron", expr: input.cronExpr ?? "0 9 * * *" }
            : { kind: "every", everyMs: Math.max(1_000, Math.trunc(input.everyMs ?? 60_000)) },
        message: input.taskPrompt ?? "",
        deliver: false
      });
      const nextRunAt = cronJob.state.nextRunAtMs ? new Date(cronJob.state.nextRunAtMs).toISOString() : null;
      return (await this.jobRepo.update(job.id, { runtimeJobId: cronJob.id, nextRunAt })) ?? job;
    }
    return job;
  }

  async updateJob(
    jobId: string,
    input: {
      name?: string;
      description?: string;
      scheduleKind?: "cron" | "every" | "heartbeat";
      cronExpr?: string | null;
      everyMs?: number | null;
      taskPrompt?: string;
      enabled?: boolean;
    }
  ): Promise<EmployeeScheduleJobView> {
    const existing = await this.jobRepo.getById(jobId);
    if (!existing) throw new Error(`Schedule job not found: ${jobId}`);

    const employee = await this.employeeRepo.getById(existing.employeeId);
    if (!employee) throw new Error(`Employee not found: ${existing.employeeId}`);

    // Clean up existing runtime resources
    if (existing.runtimeJobId) {
      this.cronService.removeJob(existing.runtimeJobId);
    }
    this.stopJobHeartbeat(jobId);

    const newKind = input.scheduleKind ?? existing.scheduleKind;
    const newEnabled = input.enabled ?? existing.enabled;

    const updated = await this.jobRepo.update(jobId, {
      ...input,
      runtimeJobId: null,
      nextRunAt: null
    });
    if (!updated) throw new Error(`Failed to update job: ${jobId}`);

    if (!newEnabled) return updated;

    if (newKind === "heartbeat") {
      const newEveryMs = input.everyMs ?? existing.everyMs ?? 30 * 60 * 1000;
      const intervalS = Math.max(1, Math.floor(newEveryMs / 1000));
      await this.jobRepo.update(jobId, { heartbeatIntervalS: intervalS });
      this.startJobHeartbeat(
        jobId,
        existing.employeeId,
        employee.code,
        intervalS,
        input.taskPrompt ?? existing.taskPrompt
      );
      return (await this.jobRepo.getById(jobId)) ?? updated;
    }

    const cronJobName = `ejob:${jobId}`;
    const cronExpr = input.cronExpr ?? existing.cronExpr ?? "0 9 * * *";
    const everyMs = input.everyMs ?? existing.everyMs ?? 60_000;
    const cronJob = this.cronService.addJob({
      name: cronJobName,
      schedule:
        newKind === "cron"
          ? { kind: "cron", expr: cronExpr }
          : { kind: "every", everyMs: Math.max(1_000, Math.trunc(everyMs)) },
      message: input.taskPrompt ?? existing.taskPrompt,
      deliver: false
    });
    const nextRunAt = cronJob.state.nextRunAtMs ? new Date(cronJob.state.nextRunAtMs).toISOString() : null;
    return (await this.jobRepo.update(jobId, { runtimeJobId: cronJob.id, nextRunAt })) ?? updated;
  }

  async deleteJob(jobId: string): Promise<void> {
    const existing = await this.jobRepo.getById(jobId);
    if (!existing) return;
    if (existing.runtimeJobId) {
      this.cronService.removeJob(existing.runtimeJobId);
    }
    this.stopJobHeartbeat(jobId);
    await this.jobRepo.delete(jobId);
  }

  async runJobNow(jobId: string): Promise<boolean> {
    const job = await this.jobRepo.getById(jobId);
    if (!job) return false;

    if (job.scheduleKind === "heartbeat") {
      const hb = this.jobHeartbeats.get(jobId);
      if (!hb) return false;
      await hb.triggerNow();
      return true;
    }
    if (!job.runtimeJobId) return false;
    return this.cronService.runJob(job.runtimeJobId, true);
  }

  stop(): void {
    for (const employeeId of [...this.heartbeats.keys()]) {
      this.stopHeartbeatForEmployee(employeeId);
    }
    for (const jobId of [...this.jobHeartbeats.keys()]) {
      this.stopJobHeartbeat(jobId);
    }
    this.cronService.stop();
    this.started = false;
  }

  /** Sync nextRunAtMs from CronService into DB after automatic execution. */
  private async syncNextRunForJobs(executedJobs: CronJob[]): Promise<void> {
    for (const job of executedJobs) {
      const nextRunAt = job.state.nextRunAtMs ? new Date(job.state.nextRunAtMs).toISOString() : null;
      if (job.name.startsWith("ejob:")) {
        const jobId = job.name.slice("ejob:".length);
        await this.jobRepo.patchNextRunAt(jobId, nextRunAt);
      } else if (job.name.startsWith("employee:")) {
        const employeeId = job.name.slice("employee:".length);
        await this.scheduleRepo.patchNextRunAt(employeeId, nextRunAt);
      }
    }
  }
}
