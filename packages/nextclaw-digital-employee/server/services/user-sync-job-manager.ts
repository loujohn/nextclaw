import { randomUUID } from "node:crypto";
import type { Knex } from "knex";
import { dbNow } from "../db/knex";
import { createLogger } from "../utils/logger";
import {
  explainUserSyncError,
  runUserPersonnelSync,
  type UserSyncProgressSnapshot,
  type UserSyncStage,
  type UserSyncSummary,
} from "./user-sync-service";

const log = createLogger("UserSyncJobManager");

type UserSyncJobStatus = "running" | "completed" | "failed";

export type UserSyncJobView = {
  jobId: string;
  alreadyRunning: boolean;
  status: UserSyncJobStatus;
  stage: UserSyncStage;
  message: string;
  total: number | null;
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  autoBound: number;
  summary: string;
  createdUsers: string[];
  unboundUsers: Array<{ name: string; dingTalkId: string }>;
  startedAt: string;
  finishedAt: string | null;
};

type UserSyncJobState = UserSyncJobView;

const JOB_RETENTION_MS = 60 * 60 * 1000;

function createInitialJob(jobId: string): UserSyncJobState {
  return {
    jobId,
    alreadyRunning: false,
    status: "running",
    stage: "queued",
    message: "同步任务已创建，等待执行。",
    total: null,
    processed: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    autoBound: 0,
    summary: "",
    createdUsers: [],
    unboundUsers: [],
    startedAt: dbNow(),
    finishedAt: null,
  };
}

class UserSyncJobManager {
  private readonly jobs = new Map<string, UserSyncJobState>();
  private activeJobId: string | null = null;

  start(db: Knex): UserSyncJobView {
    const activeJob = this.getActiveJob();
    if (activeJob) {
      return { ...activeJob, alreadyRunning: true };
    }

    const jobId = randomUUID();
    const job = createInitialJob(jobId);
    this.jobs.set(jobId, job);
    this.activeJobId = jobId;
    void this.run(jobId, db);
    return { ...job };
  }

  get(jobId: string): UserSyncJobView | null {
    const job = this.jobs.get(jobId);
    return job ? { ...job } : null;
  }

  private getActiveJob(): UserSyncJobState | null {
    if (!this.activeJobId) {
      return null;
    }
    const job = this.jobs.get(this.activeJobId);
    if (!job || job.status !== "running") {
      return null;
    }
    return job;
  }

  private update(jobId: string, patch: Partial<UserSyncProgressSnapshot>): void {
    const job = this.jobs.get(jobId);
    if (!job) {
      return;
    }

    if (patch.stage) job.stage = patch.stage;
    if (patch.message !== undefined) job.message = patch.message;
    if (patch.total !== undefined) job.total = patch.total;
    if (patch.processed !== undefined) job.processed = patch.processed;
    if (patch.created !== undefined) job.created = patch.created;
    if (patch.updated !== undefined) job.updated = patch.updated;
    if (patch.skipped !== undefined) job.skipped = patch.skipped;
    if (patch.failed !== undefined) job.failed = patch.failed;
    if (patch.summary !== undefined) job.summary = patch.summary;
  }

  private complete(jobId: string, summary: UserSyncSummary): void {
    const job = this.jobs.get(jobId);
    if (!job) {
      return;
    }

    job.status = "completed";
    job.stage = "completed";
    job.message = "用户同步完成。";
    job.total = summary.total;
    job.processed = summary.total;
    job.created = summary.created;
    job.updated = summary.updated;
    job.skipped = summary.skipped;
    job.failed = summary.failed;
    job.autoBound = summary.autoBound;
    job.summary = summary.summary;
    job.createdUsers = summary.createdUsers;
    job.unboundUsers = summary.unboundUsers;
    job.finishedAt = dbNow();
    job.alreadyRunning = false;
    if (this.activeJobId === jobId) {
      this.activeJobId = null;
    }
    this.scheduleCleanup(jobId);
  }

  private fail(jobId: string, error: unknown): void {
    const job = this.jobs.get(jobId);
    if (!job) {
      return;
    }

    log.error(error instanceof Error ? `用户同步任务失败: ${error.stack ?? error.message}` : `用户同步任务失败: ${String(error)}`);

    job.status = "failed";
    job.stage = "failed";
    job.message = explainUserSyncError(error);
    job.failed = Math.max(job.failed, 1);
    job.finishedAt = dbNow();
    job.alreadyRunning = false;
    if (this.activeJobId === jobId) {
      this.activeJobId = null;
    }
    this.scheduleCleanup(jobId);
  }

  private scheduleCleanup(jobId: string): void {
    setTimeout(() => {
      this.jobs.delete(jobId);
    }, JOB_RETENTION_MS);
  }

  private async run(jobId: string, db: Knex): Promise<void> {
    try {
      const result = await runUserPersonnelSync(db, (progress) => this.update(jobId, progress));
      this.complete(jobId, result.data);
    } catch (error) {
      this.fail(jobId, error);
    }
  }
}

const userSyncJobManager = new UserSyncJobManager();

export function startUserSyncJob(db: Knex): UserSyncJobView {
  return userSyncJobManager.start(db);
}

export function getUserSyncJob(jobId: string): UserSyncJobView | null {
  return userSyncJobManager.get(jobId);
}