import { CronService, HeartbeatService, type CronJob } from "@nextclaw/core";
import { formatTimestamp } from "../db/knex";
import { createLogger } from "../utils/logger";

const logger = createLogger("AutomationService");
import { EmployeeRepository } from "../repositories/employee-repository";
import {
  EmployeeScheduleRepository,
  type EmployeeScheduleView
} from "../repositories/employee-schedule-repository";
import {
  EmployeeScheduleJobRepository,
  type EmployeeScheduleJobView
} from "../repositories/employee-schedule-job-repository";

export type { EmployeeScheduleJobView } from "../repositories/employee-schedule-job-repository";

/** Optional ownership assertion accepted by `updateJob` / `deleteJob` /
 * `runJobNow`. Callers that already know which employee should own the job
 * (e.g. the `schedule` tool, keyed by `employeeId` in the session context, or
 * HTTP endpoints keyed by `:id` in the URL) can pass this in so the service
 * layer enforces the check — protecting any future caller that forgets to do
 * it itself. Internal administrative callers (e.g. lifecycle bulk updates)
 * may omit the option. */
export type JobOwnershipOptions = { expectedEmployeeId?: string };

/** Structured outcome of `runJobNow`. Callers (HTTP / LLM tool / tests) can
 * map `reason` to a user-facing message + HTTP status code instead of
 * squashing every failure into a vague 400.
 *
 * Only four reasons survive by design. `runtime_missing` is the single
 * "state-drift" reason: whatever the underlying cause (DB null pointer,
 * short id not in cron store, heartbeat scheduler missing), the right user
 * action is the same — disable then re-enable the job to reset the
 * scheduler. Collapsing these into one reason avoids the previous leak
 * where `runtime_missing` vs `heartbeat_not_running` forced the LLM tool
 * to distinguish cases it couldn't act on differently.
 *
 * `engine_failed` stays separate because it signals the dispatch path
 * itself worked (cron runtime found, onJob callback invoked) but the
 * agent/engine turn threw. CronService swallows that into
 * `job.state.lastError` to keep the auto scheduler alive; we surface it
 * here so manual invocations don't appear as silent successes. */
export type RunJobNowReason =
  | "job_not_found"
  | "job_disabled"
  | "runtime_missing"
  | "engine_failed";

export type RunJobNowOutcome =
  | { triggered: true }
  | { triggered: false; reason: RunJobNowReason; message: string };

class JobNotFoundError extends Error {
  constructor(public readonly jobId: string) {
    super(`Schedule job not found: ${jobId}`);
    this.name = "JobNotFoundError";
  }
}

class JobOwnershipError extends Error {
  constructor(public readonly jobId: string) {
    super(`Schedule job ${jobId} is not owned by the expected employee`);
    this.name = "JobOwnershipError";
  }
}

export { JobNotFoundError, JobOwnershipError };
import { EmployeeRunService } from "./employee-run-service";
import type { NextclawEngineGateway } from "../engine/NextclawEngineGateway";
import { resolveEmployeeWorkspace } from "../engine/employee-workspace";

function buildScheduledSessionKey(employeeId: string, scope: string): string {
  return `employee:${employeeId}:scheduled:${scope}`;
}

function buildScheduledSessionTitle(title: string): string {
  return `定时任务 · ${title}`;
}

function buildLegacyScheduleRuntimeName(employeeId: string): string {
  return `employee:${employeeId}`;
}

function buildJobScheduleRuntimeName(jobId: string): string {
  return `ejob:${jobId}`;
}

function buildScheduledPrompt(
  taskPrompt: string | undefined,
): string {
  return taskPrompt?.trim()
    ? taskPrompt
    : "请按你的职责执行一次定时任务，并输出当前最新摘要。";
}

export class AutomationService {
  private started = false;
  private readonly heartbeats: Map<string, HeartbeatService> = new Map();
  private readonly jobHeartbeats: Map<string, HeartbeatService> = new Map();
  /** Per-job mutex chain. `updateJob` and `deleteJob` touch DB + cron store
   * + heartbeat map in several non-atomic steps; concurrent callers on the
   * same jobId could race and leave orphan runtime entries (the same kind
   * of drift reconciliation already fixes). We serialize those writers on
   * a per-job basis. Map value is the "tail" promise — next caller chains
   * after it. Tails always resolve (errors are swallowed for the chain
   * only; the `await` path re-throws the real error to the caller). */
  private readonly jobLocks: Map<string, Promise<void>> = new Map();

  constructor(
    private readonly scheduleRepo: EmployeeScheduleRepository,
    private readonly jobRepo: EmployeeScheduleJobRepository,
    private readonly employeeRepo: EmployeeRepository,
    private readonly runService: EmployeeRunService,
    private readonly cronService: CronService,
    private readonly gateway: NextclawEngineGateway,
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
        const message = buildScheduledPrompt(schedJob.taskPrompt);
        const result = await this.runService.runEmployeeTurn({
          employeeId: schedJob.employeeId,
          message,
          triggerType: "scheduled",
          triggerSource: schedJob.id,
          sessionKey: buildScheduledSessionKey(schedJob.employeeId, `job:${schedJob.id}`),
          sessionTitle: buildScheduledSessionTitle(schedJob.name),
          actorUserId: schedJob.createdByUserId ?? undefined
        });
        return result.reply;
      }
      // @deprecated Legacy format: employee:{employeeId} — will be removed after full migration to ejob:
      const employeeId = job.name.startsWith("employee:") ? job.name.slice("employee:".length) : "";
      if (employeeId) {
        logger.warn(`Legacy job format "employee:" detected for ${job.name}, migrate to ejob: format`);
        const employee = await this.employeeRepo.getById(employeeId);
        if (!employee) return null;
        const schedule = await this.scheduleRepo.getByEmployeeId(employeeId);
        const message = buildScheduledPrompt(job.payload.message as string | undefined);
        const result = await this.runService.runEmployeeTurn({
          employeeId,
          message,
          triggerType: "scheduled",
          triggerSource: "cron",
          sessionKey: buildScheduledSessionKey(employeeId, "legacy-schedule"),
          sessionTitle: buildScheduledSessionTitle("默认计划"),
          actorUserId: schedule?.createdByUserId ?? undefined
        });
        return result.reply;
      }
      // @deprecated Agent-created tasks via agentId — should migrate to ejob: format in v0.16
      if (job.agentId) {
        const employee = await this.employeeRepo.getByCode(job.agentId);
        if (!employee) {
          logger.warn(`对话创建的任务 "${job.name}" (${job.id}) 关联的 agent "${job.agentId}" 不存在`);
          return null;
        }
        const message = job.payload.message || "执行定时任务";
        const result = await this.runService.runEmployeeTurn({
          employeeId: employee.id,
          message,
          triggerType: "scheduled",
          triggerSource: job.id,
          sessionKey: buildScheduledSessionKey(employee.id, `runtime:${job.id}`),
          sessionTitle: buildScheduledSessionTitle(job.name || "对话创建任务")
        });
        return result.reply;
      }
      logger.warn(`无法识别的任务格式: "${job.name}" (${job.id}), 无 agentId 且无已知前缀`);
      return null;
    };

    // After each automatic execution batch, sync updated nextRunAtMs back to DB.
    this.cronService.onBatchComplete = (executedJobs) => {
      void this.syncNextRunForJobs(executedJobs);
    };
    await this.cronService.start();
    const enabledJobs = await this.jobRepo.listAllEnabled();
    const employeesWithEnabledJobs = new Set(enabledJobs.map((job) => job.employeeId));
    await this.restartHeartbeatSchedules(employeesWithEnabledJobs);
    await this.restartLegacySchedules(employeesWithEnabledJobs);
    await this.restartJobSchedules(enabledJobs);
    this.started = true;
  }

  private async restartHeartbeatSchedules(employeesWithEnabledJobs: ReadonlySet<string>): Promise<void> {
    const schedules = await this.scheduleRepo.listActiveByKind("heartbeat");
    for (const schedule of schedules) {
      if (employeesWithEnabledJobs.has(schedule.employeeId)) {
        await this.retireLegacySchedule(schedule);
        continue;
      }
      const employee = await this.employeeRepo.getById(schedule.employeeId);
      if (!employee || !schedule.heartbeatEnabled) {
        continue;
      }
      const intervalS = schedule.heartbeatIntervalS ?? undefined;
      this.startHeartbeatForEmployee(
        schedule.employeeId,
        employee.code,
        intervalS,
        schedule.createdByUserId ?? undefined
      );
    }
  }

  private removeCronJobsByName(name: string): number {
    let removed = 0;
    for (const job of [...this.cronService.listJobs(true)]) {
      if (job.name === name && this.cronService.removeJob(job.id)) {
        removed += 1;
      }
    }
    return removed;
  }

  private async retireLegacySchedule(schedule: EmployeeScheduleView): Promise<void> {
    if (schedule.scheduleKind === "heartbeat") {
      this.stopHeartbeatForEmployee(schedule.employeeId);
    } else {
      this.removeCronJobsByName(buildLegacyScheduleRuntimeName(schedule.employeeId));
    }

    if (!schedule.enabled && !schedule.runtimeJobId && !schedule.nextRunAt) {
      return;
    }

    await this.scheduleRepo.upsert({
      employeeId: schedule.employeeId,
      scheduleKind: schedule.scheduleKind,
      cronExpr: schedule.cronExpr,
      everyMs: schedule.everyMs,
      heartbeatEnabled: schedule.heartbeatEnabled,
      heartbeatIntervalS: schedule.heartbeatIntervalS,
      enabled: false,
      runtimeJobId: null,
      scheduleMessage: schedule.scheduleMessage,
      nextRunAt: null
    });
  }

  private async restartLegacySchedules(employeesWithEnabledJobs: ReadonlySet<string>): Promise<void> {
    const [cronSchedules, everySchedules] = await Promise.all([
      this.scheduleRepo.listActiveByKind("cron"),
      this.scheduleRepo.listActiveByKind("every")
    ]);
    const schedules = [...cronSchedules, ...everySchedules];

    const cronByName = new Map<string, CronJob[]>();
    for (const cj of this.cronService.listJobs(true)) {
      if (!cj.name.startsWith("employee:")) {
        continue;
      }
      const list = cronByName.get(cj.name);
      if (list) list.push(cj);
      else cronByName.set(cj.name, [cj]);
    }

    const canonicalRuntimeIds = new Set<string>();
    let retiredSchedules = 0;
    let prunedDuplicates = 0;

    for (const schedule of schedules) {
      if (employeesWithEnabledJobs.has(schedule.employeeId)) {
        await this.retireLegacySchedule(schedule);
        retiredSchedules += 1;
        continue;
      }

      const employee = await this.employeeRepo.getById(schedule.employeeId);
      if (!employee) {
        continue;
      }

      const cronName = buildLegacyScheduleRuntimeName(schedule.employeeId);
      const existing = cronByName.get(cronName) ?? [];

      let canonical: CronJob;
      if (existing.length > 0) {
        const byDbPointer = schedule.runtimeJobId
          ? existing.find((job) => job.id === schedule.runtimeJobId)
          : undefined;
        canonical = byDbPointer ?? existing.slice().sort((a, b) => (b.updatedAtMs ?? 0) - (a.updatedAtMs ?? 0))[0]!;
        for (const dup of existing) {
          if (dup.id !== canonical.id) {
            this.cronService.removeJob(dup.id);
            prunedDuplicates += 1;
          }
        }
      } else {
        canonical = this.cronService.addJob({
          name: cronName,
          schedule:
            schedule.scheduleKind === "cron"
              ? { kind: "cron", expr: schedule.cronExpr ?? "0 9 * * *" }
              : { kind: "every", everyMs: Math.max(1_000, Math.trunc(schedule.everyMs ?? 60_000)) },
          message: schedule.scheduleMessage,
          deliver: false
        });
      }

      canonicalRuntimeIds.add(canonical.id);

      const nextRunAt = canonical.state.nextRunAtMs
        ? formatTimestamp(new Date(canonical.state.nextRunAtMs))
        : null;
      if (schedule.runtimeJobId !== canonical.id) {
        await this.scheduleRepo.upsert({
          employeeId: schedule.employeeId,
          scheduleKind: schedule.scheduleKind,
          cronExpr: schedule.cronExpr,
          everyMs: schedule.everyMs,
          heartbeatEnabled: schedule.heartbeatEnabled,
          heartbeatIntervalS: schedule.heartbeatIntervalS,
          enabled: schedule.enabled,
          runtimeJobId: canonical.id,
          scheduleMessage: schedule.scheduleMessage,
          nextRunAt
        });
      } else {
        await this.scheduleRepo.patchNextRunAt(schedule.employeeId, nextRunAt);
      }
    }

    let orphansRemoved = 0;
    for (const [name, list] of cronByName.entries()) {
      if (!name.startsWith("employee:")) continue;
      for (const cj of list) {
        if (!canonicalRuntimeIds.has(cj.id) && this.cronService.removeJob(cj.id)) {
          orphansRemoved += 1;
        }
      }
    }

    if (retiredSchedules > 0 || prunedDuplicates > 0 || orphansRemoved > 0) {
      logger.info(
        `restartLegacySchedules: retired ${retiredSchedules} legacy schedules, ` +
          `pruned ${prunedDuplicates} duplicate + ${orphansRemoved} orphan cron entries`
      );
    }
  }

  /** Reconcile the cron-runtime store with the DB on service start.
   *
   * Pre-fix behavior matched on the runtime short id (`job.runtimeJobId`)
   * stored in DB. Under Nitro HMR / concurrent server instances, the DB
   * `runtime_job_id` column and the in-memory cron store can drift: the DB
   * column points at a short id that isn't in the current store snapshot,
   * the reconciliation code treats that as "runtime gone" and `addJob` adds
   * *another* entry with the same `ejob:{jobId}` name but a fresh short id.
   * Over multiple restarts this accumulates one extra entry per restart per
   * enabled job (we observed 30+ duplicates for some jobs), while the
   * newest short id the DB points at isn't guaranteed to match either
   * entry — stale entries outnumber the live one.
   *
   * The stable identity of a runtime is `ejob:{jobId}` (by construction),
   * so match on *name*, not short id. For each DB job we pick exactly one
   * canonical runtime — preferring the one the DB currently points at,
   * else the most-recently-updated existing one, else freshly registered.
   * All other same-name runtimes are removed, and cron entries whose DB
   * owner no longer exists (disabled/deleted) are also pruned. Heartbeat
   * jobs still go through their own scheduler. */
  private async restartJobSchedules(jobs?: EmployeeScheduleJobView[]): Promise<void> {
    const enabledJobs = jobs ?? (await this.jobRepo.listAllEnabled());

    // Bucket all existing cron runtimes by name so we can diff against DB.
    // Include disabled entries so stale disabled duplicates get pruned too.
    const cronByName = new Map<string, CronJob[]>();
    for (const cj of this.cronService.listJobs(true)) {
      const list = cronByName.get(cj.name);
      if (list) list.push(cj);
      else cronByName.set(cj.name, [cj]);
    }

    const canonicalRuntimeIds = new Set<string>();
    let prunedDuplicates = 0;

    for (const job of enabledJobs) {
      const employee = await this.employeeRepo.getById(job.employeeId);
      if (!employee) continue;

      if (job.scheduleKind === "heartbeat") {
        const intervalS = job.heartbeatIntervalS ?? undefined;
        this.startJobHeartbeat(
          job.id,
          job.employeeId,
          employee.code,
          intervalS,
          job.taskPrompt,
          job.name,
          job.createdByUserId ?? undefined
        );
        continue;
      }

      const cronName = buildJobScheduleRuntimeName(job.id);
      const existing = cronByName.get(cronName) ?? [];

      let canonical: CronJob;
      if (existing.length > 0) {
        // Prefer the runtime the DB already points at (preserves its lastRun
        // state history); otherwise the most-recently-updated entry.
        const byDbPointer = job.runtimeJobId
          ? existing.find((c) => c.id === job.runtimeJobId)
          : undefined;
        canonical = byDbPointer ?? existing.slice().sort((a, b) => (b.updatedAtMs ?? 0) - (a.updatedAtMs ?? 0))[0]!;
        // Delete every same-name duplicate except the canonical one.
        for (const dup of existing) {
          if (dup.id !== canonical.id) {
            this.cronService.removeJob(dup.id);
            prunedDuplicates += 1;
          }
        }
      } else {
        // No runtime registered yet — synthesize from DB schedule definition.
        canonical = this.cronService.addJob({
          name: cronName,
          schedule:
            job.scheduleKind === "cron"
              ? { kind: "cron", expr: job.cronExpr ?? "0 9 * * *" }
              : { kind: "every", everyMs: Math.max(1_000, Math.trunc(job.everyMs ?? 60_000)) },
          message: job.taskPrompt,
          deliver: false
        });
      }

      canonicalRuntimeIds.add(canonical.id);

      if (job.runtimeJobId !== canonical.id) {
        await this.jobRepo.patchRuntimeJobId(job.id, canonical.id);
      }
      const nextRunAt = canonical.state.nextRunAtMs
        ? formatTimestamp(new Date(canonical.state.nextRunAtMs))
        : null;
      await this.jobRepo.patchNextRunAt(job.id, nextRunAt);
    }

    // Drop orphan `ejob:*` runtimes whose DB job is disabled or deleted.
    let orphansRemoved = 0;
    for (const [name, list] of cronByName.entries()) {
      if (!name.startsWith("ejob:")) continue;
      for (const cj of list) {
        if (!canonicalRuntimeIds.has(cj.id)) {
          // Only remove if still present — we may have already deleted it as
          // a same-name duplicate above, in which case removeJob is a no-op.
          if (this.cronService.removeJob(cj.id)) {
            orphansRemoved += 1;
          }
        }
      }
    }

    if (prunedDuplicates > 0 || orphansRemoved > 0) {
      logger.info(
        `restartJobSchedules: pruned ${prunedDuplicates} duplicate + ${orphansRemoved} orphan cron entries; ` +
          `canonical runtimes=${canonicalRuntimeIds.size}`
      );
    }
  }

  private startHeartbeatForEmployee(
    employeeId: string,
    employeeCode: string,
    intervalS?: number,
    actorUserId?: string,
  ): void {
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
          triggerSource: "heartbeat",
          sessionKey: buildScheduledSessionKey(employeeId, "heartbeat"),
          sessionTitle: buildScheduledSessionTitle("心跳巡检"),
          actorUserId
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

  /** Serialize async operations on a given jobId. Callers are queued
   * FIFO; a failure in one call does NOT block subsequent calls (the
   * tail promise always resolves). Cleans up the map once the tail
   * drains to avoid unbounded growth.
   *
   * Why not `async-mutex` or similar: we only need per-key serialization
   * across a handful of write paths, and a plain promise chain keeps the
   * dependency list the same. */
  private withJobLock<T>(jobId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.jobLocks.get(jobId) ?? Promise.resolve();
    // `then(fn, fn)` runs `fn` whether `prev` resolved or rejected —
    // treating the previous caller's failure as "not our problem, our
    // turn now". The value-carrying promise (`run`) is what we await.
    const run = prev.then(fn, fn);
    // The chain's *tail* must always resolve, otherwise a thrown fn
    // triggers an unhandledRejection while it sits in the map.
    const tail: Promise<void> = run.then(
      () => undefined,
      () => undefined
    );
    this.jobLocks.set(jobId, tail);
    const cleanup = () => {
      // Only delete if we're still the most recent tail; otherwise a
      // follow-up caller has already chained after us and owns the slot.
      if (this.jobLocks.get(jobId) === tail) {
        this.jobLocks.delete(jobId);
      }
    };
    return run.finally(cleanup);
  }

  private startJobHeartbeat(
    jobId: string,
    employeeId: string,
    employeeCode: string,
    intervalS?: number,
    taskPrompt?: string,
    jobName?: string,
    actorUserId?: string,
  ): void {
    const existing = this.jobHeartbeats.get(jobId);
    if (existing) {
      existing.stop();
    }
    const workspace = resolveEmployeeWorkspace(this.gateway.homeDir, employeeCode);
    const hb = new HeartbeatService(
      workspace,
      async (_prompt) => {
        const message = buildScheduledPrompt(taskPrompt);
        const result = await this.runService.runEmployeeTurn({
          employeeId,
          message,
          triggerType: "scheduled",
          triggerSource: "heartbeat",
          sessionKey: buildScheduledSessionKey(employeeId, `job-heartbeat:${jobId}`),
          sessionTitle: buildScheduledSessionTitle(jobName || "心跳任务"),
          actorUserId
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

  // ── Legacy single-schedule API ──────────
  // @deprecated Use createJob / updateJob instead. Will be removed in v0.16.

  async upsertSchedule(input: {
    employeeId: string;
    scheduleKind: "cron" | "every" | "heartbeat";
    cronExpr?: string | null;
    everyMs?: number | null;
    enabled?: boolean;
    actorUserId?: string;
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

    const scheduleMessage = "请按你的职责执行一次定时任务，并输出当前最新摘要。";

    if (input.scheduleKind === "heartbeat") {
      const intervalS = Math.max(1, Math.floor((input.everyMs ?? 30 * 60 * 1000) / 1000));
      if (input.enabled !== false) {
        this.startHeartbeatForEmployee(
          input.employeeId,
          employee.code,
          intervalS,
          existing?.createdByUserId ?? input.actorUserId
        );
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
        nextRunAt: null,
        createdByUserId: existing?.createdByUserId ?? input.actorUserId,
        updatedByUserId: input.actorUserId
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
      nextRunAt: job.state.nextRunAtMs ? formatTimestamp(new Date(job.state.nextRunAtMs)) : null,
      createdByUserId: existing?.createdByUserId ?? input.actorUserId,
      updatedByUserId: input.actorUserId
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
    actorUserId?: string;
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
        enabled: input.enabled ?? true,
        createdByUserId: input.actorUserId,
      });
      if (input.enabled !== false) {
        this.startJobHeartbeat(
          job.id,
          input.employeeId,
          employee.code,
          intervalS,
          input.taskPrompt,
          input.name,
          job.createdByUserId ?? undefined
        );
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
      enabled: input.enabled ?? true,
      createdByUserId: input.actorUserId,
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
      const nextRunAt = cronJob.state.nextRunAtMs ? formatTimestamp(new Date(cronJob.state.nextRunAtMs)) : null;
      return (await this.jobRepo.update(job.id, { runtimeJobId: cronJob.id, nextRunAt, updatedByUserId: input.actorUserId })) ?? job;
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
      actorUserId?: string;
    },
    opts?: JobOwnershipOptions
  ): Promise<EmployeeScheduleJobView> {
    // Serialize per-job: two concurrent `updateJob(sameId)` calls (or an
    // update racing a delete) used to produce orphan cron entries in
    // `jobs.json` — we'd `removeJob(oldRuntime)` then `addJob(new)`, and
    // an interleaved second call could `removeJob(stillOldRuntime)` and
    // then add a second new entry, leaving the first new entry abandoned
    // with no DB pointer. Reconciliation would clean it up on restart,
    // but it's better not to create it in the first place.
    return this.withJobLock(jobId, async () => {
      const existing = await this.jobRepo.getById(jobId);
      if (!existing) throw new JobNotFoundError(jobId);
      if (opts?.expectedEmployeeId && existing.employeeId !== opts.expectedEmployeeId) {
        throw new JobOwnershipError(jobId);
      }

      const employee = await this.employeeRepo.getById(existing.employeeId);
      if (!employee) throw new Error(`Employee not found: ${existing.employeeId}`);

      if (existing.runtimeJobId) {
        this.cronService.removeJob(existing.runtimeJobId);
      }
      this.stopJobHeartbeat(jobId);

      const newKind = input.scheduleKind ?? existing.scheduleKind;
      const newEnabled = input.enabled ?? existing.enabled;

      const updated = await this.jobRepo.update(jobId, {
        ...input,
        runtimeJobId: null,
        nextRunAt: null,
        updatedByUserId: input.actorUserId
      });
      if (!updated) throw new Error(`Failed to update job: ${jobId}`);

      if (!newEnabled) return updated;

      if (newKind === "heartbeat") {
        const newEveryMs = input.everyMs ?? existing.everyMs ?? 30 * 60 * 1000;
        const intervalS = Math.max(1, Math.floor(newEveryMs / 1000));
        await this.jobRepo.update(jobId, { heartbeatIntervalS: intervalS, updatedByUserId: input.actorUserId });
        this.startJobHeartbeat(
          jobId,
          existing.employeeId,
          employee.code,
          intervalS,
          input.taskPrompt ?? existing.taskPrompt,
          input.name ?? existing.name,
          existing.createdByUserId ?? undefined,
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
      const nextRunAt = cronJob.state.nextRunAtMs ? formatTimestamp(new Date(cronJob.state.nextRunAtMs)) : null;
      return (await this.jobRepo.update(jobId, { runtimeJobId: cronJob.id, nextRunAt, updatedByUserId: input.actorUserId })) ?? updated;
    });
  }

  async deleteJob(jobId: string, opts?: JobOwnershipOptions): Promise<void> {
    return this.withJobLock(jobId, async () => {
      const existing = await this.jobRepo.getById(jobId);
      if (!existing) {
        // Idempotent: deleting a non-existent job is a no-op, but callers
        // that asserted ownership deserve a firm error so they can't be
        // tricked into "success" by guessing ids outside their scope.
        if (opts?.expectedEmployeeId) {
          throw new JobNotFoundError(jobId);
        }
        return;
      }
      if (opts?.expectedEmployeeId && existing.employeeId !== opts.expectedEmployeeId) {
        throw new JobOwnershipError(jobId);
      }
      if (existing.runtimeJobId) {
        this.cronService.removeJob(existing.runtimeJobId);
      }
      this.stopJobHeartbeat(jobId);
      await this.jobRepo.delete(jobId);
    });
  }

  async runJobNow(jobId: string, opts?: JobOwnershipOptions): Promise<RunJobNowOutcome> {
    const job = await this.jobRepo.getById(jobId);
    if (!job) {
      if (opts?.expectedEmployeeId) {
        throw new JobNotFoundError(jobId);
      }
      logger.warn(`runJobNow failed: job ${jobId} not found in DB`);
      return { triggered: false, reason: "job_not_found", message: `Job ${jobId} not found` };
    }
    if (opts?.expectedEmployeeId && job.employeeId !== opts.expectedEmployeeId) {
      throw new JobOwnershipError(jobId);
    }

    if (!job.enabled) {
      logger.warn(`runJobNow refused: job ${jobId} is disabled`);
      return { triggered: false, reason: "job_disabled", message: `Job ${jobId} is disabled, enable it before running` };
    }

    // Heartbeat: reconciliation (`restartJobSchedules`) is the single source
    // of truth for starting heartbeat schedulers. If one is missing at
    // runtime, the DB→runtime relationship drifted after start() — no
    // silent self-heal here, because that exact pattern is what caused the
    // `jobs.json` duplicate accumulation in the first place. Surface a
    // structured drift signal instead and let the user reset the scheduler
    // via a disable/enable cycle, which takes the well-exercised
    // `updateJob` path.
    if (job.scheduleKind === "heartbeat") {
      const hb = this.jobHeartbeats.get(jobId);
      if (!hb) {
        logger.error(
          `runJobNow: heartbeat scheduler for job ${jobId} is not running. ` +
            `Drift detected since last start(). ` +
            `User should disable then re-enable the job to recover.`
        );
        return {
          triggered: false,
          reason: "runtime_missing",
          message:
            `Heartbeat scheduler for job ${jobId} is not running. ` +
            `Please disable and re-enable the job to reset the schedule.`
        };
      }
      await hb.triggerNow();
      return { triggered: true };
    }

    // cron / every: reconciliation keeps DB `runtime_job_id` pointing at a
    // live cron entry. If it's null or stale at this point, something
    // between start() and this call broke the invariant — again, fast-fail
    // rather than paper over it.
    if (!job.runtimeJobId) {
      logger.error(
        `runJobNow: job ${jobId} has null runtimeJobId after reconciliation. ` +
          `Drift detected; user should disable then re-enable to reset.`
      );
      return {
        triggered: false,
        reason: "runtime_missing",
        message:
          `Runtime for job ${jobId} is out of sync (runtimeJobId is null). ` +
          `Please disable and re-enable the job to reset the schedule.`
      };
    }

    const didRun = await this.cronService.runJob(job.runtimeJobId, true);
    if (!didRun) {
      logger.error(
        `runJobNow: cronService.runJob(${job.runtimeJobId}) returned false for job ${jobId}. ` +
          `Drift detected between DB runtime_job_id and cron store; reset required.`
      );
      return {
        triggered: false,
        reason: "runtime_missing",
        message:
          `Cron runtime ${job.runtimeJobId} was not found in the scheduler. ` +
          `Please disable and re-enable the job to reset the schedule.`
      };
    }

    // CronService#executeJob internally catches engine/agent failures so the
    // auto-dispatch loop stays alive, and stores the error on the job's
    // `lastStatus`/`lastError` state fields. For manual invocations we want
    // that failure to be visible (otherwise the UI shows a false-positive
    // "triggered" toast while the underlying run errored). Inspect the
    // job's post-run state to recover visibility.
    const runtimeAfter = this.cronService.listJobs(true).find((j) => j.id === job.runtimeJobId);
    if (runtimeAfter?.state.lastStatus === "error") {
      const errMsg = runtimeAfter.state.lastError ?? "Unknown engine failure";
      logger.error(`runJobNow: engine failed for job ${jobId} runtime=${job.runtimeJobId}: ${errMsg}`);
      return {
        triggered: false,
        reason: "engine_failed",
        message: `Engine failed while executing job ${jobId}: ${errMsg}`
      };
    }
    return { triggered: true };
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
      const nextRunAt = job.state.nextRunAtMs ? formatTimestamp(new Date(job.state.nextRunAtMs)) : null;
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
