/**
 * CronService unit tests — covers all three schedule modes (at / every / cron)
 */
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CronService } from "./service.js";

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

// ── at 模式 ──────────────────────────────────────────────────────────────────
describe("CronService - at (one-shot) schedule", () => {
  it("fires a future at-job when the timer elapses", async () => {
    vi.useFakeTimers();
    const homeDir = createTempDir("cron-at-future-");
    const calls: string[] = [];
    const svc = new CronService(join(homeDir, "jobs.json"), async (job) => {
      calls.push(job.id);
      return "done";
    });
    await svc.start();

    const future = Date.now() + 3_000;
    const job = svc.addJob({
      name: "at-future",
      schedule: { kind: "at", atMs: future },
      message: "hello",
      deleteAfterRun: false
    });

    expect(svc.listJobs()).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(4_000);

    expect(calls).toContain(job.id);
    // after firing, at-job becomes disabled (deleteAfterRun=false)
    const remaining = svc.listJobs(true);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.enabled).toBe(false);

    svc.stop();
    vi.useRealTimers();
  });

  it("fires an overdue at-job immediately on start (bug-fix: past atMs)", async () => {
    vi.useFakeTimers();
    const homeDir = createTempDir("cron-at-past-");
    const calls: string[] = [];
    const svc = new CronService(join(homeDir, "jobs.json"), async (job) => {
      calls.push(job.id);
      return "done";
    });
    await svc.start();

    // place atMs in the past — before fix this would never fire
    const past = Date.now() - 5_000;
    const job = svc.addJob({
      name: "at-past",
      schedule: { kind: "at", atMs: past },
      message: "overdue"
    });

    // advance by a tick (≥0 delay should fire immediately)
    await vi.advanceTimersByTimeAsync(100);

    expect(calls).toContain(job.id);

    svc.stop();
    vi.useRealTimers();
  });

  it("removes the at-job after run when deleteAfterRun=true", async () => {
    vi.useFakeTimers();
    const homeDir = createTempDir("cron-at-delete-");
    const svc = new CronService(join(homeDir, "jobs.json"), async () => "done");
    await svc.start();

    svc.addJob({
      name: "disposable",
      schedule: { kind: "at", atMs: Date.now() + 1_000 },
      message: "bye",
      deleteAfterRun: true
    });

    await vi.advanceTimersByTimeAsync(2_000);

    expect(svc.listJobs(true)).toHaveLength(0);

    svc.stop();
    vi.useRealTimers();
  });

  it("null atMs produces no nextRunAtMs and never fires", async () => {
    vi.useFakeTimers();
    const homeDir = createTempDir("cron-at-null-");
    const calls: string[] = [];
    const svc = new CronService(join(homeDir, "jobs.json"), async (job) => {
      calls.push(job.id);
      return "done";
    });
    await svc.start();

    const job = svc.addJob({
      name: "no-time",
      schedule: { kind: "at" }, // atMs omitted
      message: "silent"
    });

    await vi.advanceTimersByTimeAsync(60_000);

    expect(calls).not.toContain(job.id);

    svc.stop();
    vi.useRealTimers();
  });
});

// ── every 模式 ────────────────────────────────────────────────────────────────
describe("CronService - every (interval) schedule", () => {
  it("fires repeatedly at the configured interval", async () => {
    vi.useFakeTimers();
    const homeDir = createTempDir("cron-every-repeat-");
    const calls: string[] = [];
    const svc = new CronService(join(homeDir, "jobs.json"), async (job) => {
      calls.push(job.id);
      return "tick";
    });
    await svc.start();

    const job = svc.addJob({
      name: "interval",
      schedule: { kind: "every", everyMs: 2_000 },
      message: "tick"
    });

    await vi.advanceTimersByTimeAsync(7_000);

    // Should fire at ~2s, ~4s, ~6s → at least 3 times
    expect(calls.filter((id) => id === job.id).length).toBeGreaterThanOrEqual(3);

    svc.stop();
    vi.useRealTimers();
  });

  it("stops firing after the job is disabled", async () => {
    vi.useFakeTimers();
    const homeDir = createTempDir("cron-every-disable-");
    const calls: string[] = [];
    const svc = new CronService(join(homeDir, "jobs.json"), async (job) => {
      calls.push(job.id);
      return "tick";
    });
    await svc.start();

    const job = svc.addJob({
      name: "interval-disable",
      schedule: { kind: "every", everyMs: 2_000 },
      message: "tick"
    });

    await vi.advanceTimersByTimeAsync(3_000);
    const countBefore = calls.filter((id) => id === job.id).length;
    expect(countBefore).toBeGreaterThanOrEqual(1);

    svc.enableJob(job.id, false);

    await vi.advanceTimersByTimeAsync(10_000);
    const countAfter = calls.filter((id) => id === job.id).length;
    expect(countAfter).toBe(countBefore); // no new calls

    svc.stop();
    vi.useRealTimers();
  });

  it("persists and reloads every-job from disk", async () => {
    const homeDir = createTempDir("cron-every-persist-");
    const storePath = join(homeDir, "jobs.json");

    const svc1 = new CronService(storePath);
    await svc1.start();
    svc1.addJob({ name: "persist-interval", schedule: { kind: "every", everyMs: 60_000 }, message: "go" });
    svc1.stop();

    const svc2 = new CronService(storePath);
    await svc2.start();
    const jobs = svc2.listJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.name).toBe("persist-interval");
    svc2.stop();
  });

  it("everyMs <= 0 or missing never schedules a next run", () => {
    const homeDir = createTempDir("cron-every-invalid-");
    const svc = new CronService(join(homeDir, "jobs.json"));
    const job = svc.addJob({
      name: "zero-interval",
      schedule: { kind: "every", everyMs: 0 },
      message: "oops"
    });
    expect(job.state.nextRunAtMs).toBeNull();
  });
});

// ── cron 模式 ─────────────────────────────────────────────────────────────────
describe("CronService - cron expression schedule", () => {
  it("computes a valid nextRunAtMs from a cron expression", () => {
    const homeDir = createTempDir("cron-expr-next-");
    const svc = new CronService(join(homeDir, "jobs.json"));
    const job = svc.addJob({
      name: "daily",
      schedule: { kind: "cron", expr: "0 9 * * *" },
      message: "good morning"
    });

    expect(job.state.nextRunAtMs).not.toBeNull();
    expect(job.state.nextRunAtMs).toBeGreaterThan(Date.now());
  });

  it("respects tz field in cron schedule (bug-fix: tz was previously ignored)", () => {
    const homeDir = createTempDir("cron-expr-tz-");
    const svc = new CronService(join(homeDir, "jobs.json"));

    // Same expression with two different timezones should produce different next-run times
    const jobUtc = svc.addJob({
      name: "utc-daily",
      schedule: { kind: "cron", expr: "0 9 * * *", tz: "UTC" },
      message: "utc 9am"
    });
    const jobTokyo = svc.addJob({
      name: "tokyo-daily",
      schedule: { kind: "cron", expr: "0 9 * * *", tz: "Asia/Tokyo" },
      message: "tokyo 9am"
    });

    // UTC+9, so Tokyo 9am = UTC 0am (difference of 9 hours)
    expect(jobUtc.state.nextRunAtMs).not.toBeNull();
    expect(jobTokyo.state.nextRunAtMs).not.toBeNull();
    expect(jobUtc.state.nextRunAtMs).not.toBe(jobTokyo.state.nextRunAtMs);
  });

  it("invalid cron expression produces null nextRunAtMs and no crash", () => {
    const homeDir = createTempDir("cron-expr-invalid-");
    const svc = new CronService(join(homeDir, "jobs.json"));
    const job = svc.addJob({
      name: "broken-expr",
      schedule: { kind: "cron", expr: "not a cron expression" },
      message: "oops"
    });
    expect(job.state.nextRunAtMs).toBeNull();
  });

  it("fires when the cron expression comes due (fake timers)", async () => {
    // Use a fixed reference to set up cron that fires every minute
    vi.useFakeTimers();
    const now = new Date("2026-01-01T08:00:00Z").getTime();
    vi.setSystemTime(now);

    const homeDir = createTempDir("cron-expr-fire-");
    const calls: string[] = [];
    const svc = new CronService(join(homeDir, "jobs.json"), async (job) => {
      calls.push(job.id);
      return "fired";
    });
    await svc.start();

    const job = svc.addJob({
      name: "every-minute",
      schedule: { kind: "cron", expr: "* * * * *" }, // every minute
      message: "tick"
    });

    // advance 65 seconds — job should have fired at the :00 mark
    await vi.advanceTimersByTimeAsync(65_000);

    expect(calls).toContain(job.id);

    svc.stop();
    vi.useRealTimers();
  });

  it("persists cron-expr job to disk and reloads with correct nextRunAtMs", async () => {
    const homeDir = createTempDir("cron-expr-persist-");
    const storePath = join(homeDir, "jobs.json");

    const svc1 = new CronService(storePath);
    await svc1.start();
    svc1.addJob({ name: "daily-persist", schedule: { kind: "cron", expr: "0 9 * * *" }, message: "hello" });
    svc1.stop();

    const svc2 = new CronService(storePath);
    await svc2.start();
    const jobs = svc2.listJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.state.nextRunAtMs).not.toBeNull();
    svc2.stop();
  });
});

// ── 公共行为 ──────────────────────────────────────────────────────────────────
describe("CronService - common behavior", () => {
  it("runJob force-executes a disabled job", async () => {
    const homeDir = createTempDir("cron-runjob-force-");
    let fired = false;
    const svc = new CronService(join(homeDir, "jobs.json"), async () => {
      fired = true;
      return "ok";
    });
    await svc.start();

    const job = svc.addJob({
      name: "manual",
      schedule: { kind: "every", everyMs: 60_000 },
      message: "go"
    });
    svc.enableJob(job.id, false);

    const result = await svc.runJob(job.id, /* force= */ true);
    expect(result).toBe(true);
    expect(fired).toBe(true);
  });

  it("removeJob deletes the job and returns true", async () => {
    const homeDir = createTempDir("cron-remove-");
    const svc = new CronService(join(homeDir, "jobs.json"));
    await svc.start();

    const job = svc.addJob({
      name: "remove-me",
      schedule: { kind: "every", everyMs: 10_000 },
      message: "bye"
    });
    expect(svc.listJobs(true)).toHaveLength(1);

    const removed = svc.removeJob(job.id);
    expect(removed).toBe(true);
    expect(svc.listJobs(true)).toHaveLength(0);
  });

  it("status() reports correct job count and enabled state", async () => {
    const homeDir = createTempDir("cron-status-");
    const svc = new CronService(join(homeDir, "jobs.json"));
    await svc.start();

    svc.addJob({ name: "j1", schedule: { kind: "every", everyMs: 10_000 }, message: "a" });
    svc.addJob({ name: "j2", schedule: { kind: "cron", expr: "0 9 * * *" }, message: "b" });

    const s = svc.status();
    expect(s.enabled).toBe(true);
    expect(s.jobs).toBe(2);

    svc.stop();
    expect(svc.status().enabled).toBe(false);
  });

  it("executeJob records lastStatus=error on onJob rejection", async () => {
    vi.useFakeTimers();
    const homeDir = createTempDir("cron-error-");
    const svc = new CronService(join(homeDir, "jobs.json"), async () => {
      throw new Error("boom");
    });
    await svc.start();

    const job = svc.addJob({
      name: "will-fail",
      schedule: { kind: "every", everyMs: 1_000 },
      message: "fail"
    });

    await vi.advanceTimersByTimeAsync(1_500);

    const updated = svc.listJobs(true).find((j) => j.id === job.id);
    expect(updated?.state.lastStatus).toBe("error");
    expect(updated?.state.lastError).toContain("boom");

    svc.stop();
    vi.useRealTimers();
  });
});
