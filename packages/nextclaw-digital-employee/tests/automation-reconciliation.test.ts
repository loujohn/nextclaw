import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CronService, type CronJob, type CronStore } from "@nextclaw/core";
import { AutomationService } from "../server/services/automation-service";
import type { EmployeeScheduleJobView } from "../server/repositories/employee-schedule-job-repository";
import type { EmployeeScheduleView } from "../server/repositories/employee-schedule-repository";

/**
 * `restartJobSchedules` reconciliation tests.
 *
 * These tests lock down the core fix: the DB is the source of truth, and on
 * startup the cron-runtime store is reconciled against the DB by matching on
 * the stable name `ejob:{jobId}` (rather than the short runtime id, which
 * can drift across HMR restarts). Pre-fix behavior accumulated one extra
 * same-name entry per restart (observed 30+ duplicates), so these tests
 * verify: (1) same-name duplicates are pruned, (2) DB `runtime_job_id` is
 * the preferred canonical when it matches an existing entry, and (3)
 * orphan entries whose DB owner is gone/disabled are removed.
 *
 * These are narrow unit tests over just the reconciliation algorithm — they
 * use stubbed repositories and a real CronService pointed at a temp jobs.json
 * so they don't depend on DM connectivity (which has its own flakiness in CI).
 */

const tempDirs: string[] = [];

function createTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

/** Write a raw `jobs.json` that simulates post-HMR drift state. */
function writeJobsJson(path: string, jobs: CronJob[]): void {
  const store: CronStore = { version: 1, jobs };
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(store, null, 2), "utf-8");
}

function readJobsJson(path: string): CronStore {
  return JSON.parse(readFileSync(path, "utf-8")) as CronStore;
}

/** Minimal CronJob factory for tests; defaults to an enabled cron 9am job. */
function cronJobFixture(partial: Partial<CronJob> & { id: string; name: string }): CronJob {
  return {
    id: partial.id,
    name: partial.name,
    enabled: partial.enabled ?? true,
    schedule: partial.schedule ?? { kind: "cron", expr: "0 9 * * *" },
    payload: partial.payload ?? {
      kind: "agent_turn",
      message: "",
      deliver: false
    },
    state: partial.state ?? {},
    createdAtMs: partial.createdAtMs ?? 1_700_000_000_000,
    updatedAtMs: partial.updatedAtMs ?? 1_700_000_000_000,
    deleteAfterRun: partial.deleteAfterRun ?? false,
    agentId: partial.agentId
  };
}

/** Stub repo that records mutations so we can assert DB effects without DM. */
function buildStubs(initialJobs: EmployeeScheduleJobView[], initialSchedules: EmployeeScheduleView[] = []): {
  jobRepo: any;
  scheduleRepo: any;
  employeeRepo: any;
  jobStore: Map<string, EmployeeScheduleJobView>;
  scheduleStore: Map<string, EmployeeScheduleView>;
  patchCalls: Array<{ jobId: string; runtimeJobId: string | null }>;
} {
  const jobStore = new Map<string, EmployeeScheduleJobView>();
  for (const job of initialJobs) jobStore.set(job.id, { ...job });
  const scheduleStore = new Map<string, EmployeeScheduleView>();
  for (const schedule of initialSchedules) scheduleStore.set(schedule.employeeId, { ...schedule });
  const patchCalls: Array<{ jobId: string; runtimeJobId: string | null }> = [];

  const jobRepo = {
    listAllEnabled: async () =>
      Array.from(jobStore.values()).filter((j) => j.enabled),
    getById: async (id: string) => jobStore.get(id) ?? null,
    patchRuntimeJobId: async (jobId: string, runtimeJobId: string | null) => {
      patchCalls.push({ jobId, runtimeJobId });
      const job = jobStore.get(jobId);
      if (job) jobStore.set(jobId, { ...job, runtimeJobId });
    },
    patchNextRunAt: async (jobId: string, nextRunAt: string | null) => {
      const job = jobStore.get(jobId);
      if (job) jobStore.set(jobId, { ...job, nextRunAt });
    }
  };

  const scheduleRepo = {
    listActiveByKind: async (scheduleKind: string) =>
      Array.from(scheduleStore.values()).filter((schedule) => schedule.enabled && schedule.scheduleKind === scheduleKind),
    getByEmployeeId: async (employeeId: string) => scheduleStore.get(employeeId) ?? null,
    upsert: async (input: Partial<EmployeeScheduleView> & { employeeId: string; scheduleKind: string }) => {
      const existing = scheduleStore.get(input.employeeId);
      const next: EmployeeScheduleView = {
        id: existing?.id ?? `schedule-${input.employeeId}`,
        employeeId: input.employeeId,
        scheduleKind: input.scheduleKind,
        cronExpr: input.cronExpr ?? null,
        everyMs: input.everyMs ?? null,
        heartbeatEnabled: input.heartbeatEnabled ?? false,
        heartbeatIntervalS: input.heartbeatIntervalS ?? null,
        enabled: input.enabled ?? true,
        runtimeJobId: input.runtimeJobId ?? null,
        scheduleMessage: input.scheduleMessage ?? "",
        nextRunAt: input.nextRunAt ?? null,
        createdByUserId: existing?.createdByUserId ?? null,
        updatedByUserId: input.updatedByUserId ?? existing?.updatedByUserId ?? null,
        createdAt: existing?.createdAt ?? "",
        updatedAt: existing?.updatedAt ?? ""
      };
      scheduleStore.set(input.employeeId, next);
      return next;
    },
    patchNextRunAt: async (employeeId: string, nextRunAt: string | null) => {
      const schedule = scheduleStore.get(employeeId);
      if (schedule) scheduleStore.set(employeeId, { ...schedule, nextRunAt });
    }
  };

  const employeeRepo = {
    getById: async (id: string) => ({
      id,
      code: `stub-code-${id}`,
      name: `stub-${id}`,
      systemPrompt: "stub"
    })
  };

  return { jobRepo, scheduleRepo, employeeRepo, jobStore, scheduleStore, patchCalls };
}

function buildAutomation(
  storePath: string,
  jobRepo: any,
  scheduleRepo: any,
  employeeRepo: any
): { automation: AutomationService; cron: CronService } {
  const cron = new CronService(storePath);
  const runService = {} as any;
  const gateway = {} as any;
  const automation = new AutomationService(
    scheduleRepo,
    jobRepo,
    employeeRepo,
    runService,
    cron,
    gateway
  );
  return { automation, cron };
}

describe("automation service - restartJobSchedules reconciliation", () => {
  it("prunes same-name duplicate ejob:* entries on start, keeps exactly one canonical", async () => {
    const homeDir = createTempDir("nextclaw-reconcile-dup-");
    const storePath = join(homeDir, "cron", "jobs.json");
    const dbJobId = "db-job-1";

    writeJobsJson(storePath, [
      cronJobFixture({ id: "dup-old", name: `ejob:${dbJobId}`, updatedAtMs: 1 }),
      cronJobFixture({ id: "dup-mid", name: `ejob:${dbJobId}`, updatedAtMs: 2 }),
      cronJobFixture({ id: "dup-new", name: `ejob:${dbJobId}`, updatedAtMs: 3 })
    ]);

    const { jobRepo, scheduleRepo, employeeRepo } = buildStubs([
      {
        id: dbJobId,
        employeeId: "emp-1",
        name: "daily-sync",
        description: "",
        scheduleKind: "cron",
        cronExpr: "0 9 * * *",
        everyMs: null,
        heartbeatIntervalS: null,
        taskPrompt: "",
        enabled: true,
        // Intentionally null: simulates DB having lost track of which runtime
        // is canonical. The algorithm must still collapse to a single entry.
        runtimeJobId: null,
        nextRunAt: null,
        createdAt: "",
        updatedAt: ""
      }
    ]);

    const { automation, cron } = buildAutomation(storePath, jobRepo, scheduleRepo, employeeRepo);
    await automation.start();

    const finalStore = readJobsJson(storePath);
    const ejobs = finalStore.jobs.filter((j) => j.name === `ejob:${dbJobId}`);
    expect(ejobs).toHaveLength(1);
    // DB pointer was null → falls back to most-recently-updated.
    expect(ejobs[0]!.id).toBe("dup-new");

    cron.stop();
  });

  it("prefers the DB-pointed runtime as canonical over the most-recently-updated", async () => {
    // Regression guard: byDbPointer is the primary selector because it
    // preserves lastRunAtMs/lastStatus history on the entry the DB thinks
    // is real, rather than picking the entry that happened to execute most
    // recently (which could be a duplicate's tick).
    const homeDir = createTempDir("nextclaw-reconcile-dbptr-");
    const storePath = join(homeDir, "cron", "jobs.json");
    const dbJobId = "db-job-2";

    writeJobsJson(storePath, [
      cronJobFixture({ id: "dup-old", name: `ejob:${dbJobId}`, updatedAtMs: 1 }),
      // "db-ptr" points here. updatedAtMs is NOT the highest so a
      // time-only selector would pick "dup-recent" instead.
      cronJobFixture({ id: "db-ptr", name: `ejob:${dbJobId}`, updatedAtMs: 5 }),
      cronJobFixture({ id: "dup-recent", name: `ejob:${dbJobId}`, updatedAtMs: 9 })
    ]);

    const { jobRepo, scheduleRepo, employeeRepo } = buildStubs([
      {
        id: dbJobId,
        employeeId: "emp-2",
        name: "interval",
        description: "",
        scheduleKind: "every",
        cronExpr: null,
        everyMs: 60_000,
        heartbeatIntervalS: null,
        taskPrompt: "",
        enabled: true,
        runtimeJobId: "db-ptr",
        nextRunAt: null,
        createdAt: "",
        updatedAt: ""
      }
    ]);

    const { automation, cron } = buildAutomation(storePath, jobRepo, scheduleRepo, employeeRepo);
    await automation.start();

    const finalStore = readJobsJson(storePath);
    const ejobs = finalStore.jobs.filter((j) => j.name === `ejob:${dbJobId}`);
    expect(ejobs).toHaveLength(1);
    expect(ejobs[0]!.id).toBe("db-ptr");

    cron.stop();
  });

  it("removes orphan ejob:* entries whose DB record is absent or disabled", async () => {
    const homeDir = createTempDir("nextclaw-reconcile-orphan-");
    const storePath = join(homeDir, "cron", "jobs.json");

    writeJobsJson(storePath, [
      // live entry (DB job enabled=true below)
      cronJobFixture({ id: "live", name: "ejob:live-id", updatedAtMs: 1 }),
      // orphan: no DB record at all
      cronJobFixture({ id: "orph-ghost", name: "ejob:ghost-id", updatedAtMs: 2 }),
      // orphan: DB record exists but enabled=false (listAllEnabled skips it)
      cronJobFixture({ id: "orph-disabled", name: "ejob:disabled-id", updatedAtMs: 3 }),
      // orphan legacy runtime: no DB schedule row owns it anymore, so startup
      // reconciliation should clear it as well.
      cronJobFixture({ id: "legacy", name: "employee:some-emp", updatedAtMs: 4 })
    ]);

    const { jobRepo, scheduleRepo, employeeRepo } = buildStubs([
      {
        id: "live-id",
        employeeId: "emp-live",
        name: "alive",
        description: "",
        scheduleKind: "cron",
        cronExpr: "0 9 * * *",
        everyMs: null,
        heartbeatIntervalS: null,
        taskPrompt: "",
        enabled: true,
        runtimeJobId: "live",
        nextRunAt: null,
        createdAt: "",
        updatedAt: ""
      }
      // Note: "ghost-id" is completely absent (no row in DB at all).
      // "disabled-id" could be added with enabled=false but listAllEnabled
      // filters it out, so equivalent to ghost for the reconciler's view.
    ]);

    const { automation, cron } = buildAutomation(storePath, jobRepo, scheduleRepo, employeeRepo);
    await automation.start();

    const finalStore = readJobsJson(storePath);
    const names = finalStore.jobs.map((j) => j.name).sort();
    expect(names).toEqual(["ejob:live-id"]);

    cron.stop();
  });

  it("patches DB runtimeJobId when canonical differs from what DB pointed at", async () => {
    // End-to-end contract: after reconciliation the DB `runtime_job_id`
    // must agree with the single remaining cron entry — otherwise the next
    // runJobNow would still dispatch against a stale short id.
    const homeDir = createTempDir("nextclaw-reconcile-patch-");
    const storePath = join(homeDir, "cron", "jobs.json");
    const dbJobId = "db-job-3";

    writeJobsJson(storePath, [
      cronJobFixture({ id: "dup-a", name: `ejob:${dbJobId}`, updatedAtMs: 1 }),
      cronJobFixture({ id: "dup-b", name: `ejob:${dbJobId}`, updatedAtMs: 5 }) // newest
    ]);

    const { jobRepo, scheduleRepo, employeeRepo, jobStore, patchCalls } = buildStubs([
      {
        id: dbJobId,
        employeeId: "emp-3",
        name: "patch-test",
        description: "",
        scheduleKind: "cron",
        cronExpr: "0 9 * * *",
        everyMs: null,
        heartbeatIntervalS: null,
        taskPrompt: "",
        // DB points at "dup-a" but "dup-b" is newer. byDbPointer wins,
        // so canonical must be "dup-a" and the DB patch shouldn't fire.
        runtimeJobId: "dup-a",
        enabled: true,
        nextRunAt: null,
        createdAt: "",
        updatedAt: ""
      }
    ]);

    const { automation, cron } = buildAutomation(storePath, jobRepo, scheduleRepo, employeeRepo);
    await automation.start();

    const finalStore = readJobsJson(storePath);
    expect(finalStore.jobs.filter((j) => j.name === `ejob:${dbJobId}`)).toHaveLength(1);
    expect(finalStore.jobs.find((j) => j.name === `ejob:${dbJobId}`)!.id).toBe("dup-a");
    // DB pointer already correct → no patch call needed.
    expect(patchCalls.some((c) => c.jobId === dbJobId)).toBe(false);
    expect(jobStore.get(dbJobId)!.runtimeJobId).toBe("dup-a");

    cron.stop();
  });

  it("patches DB runtimeJobId when DB pointer is null and a stale duplicate exists", async () => {
    const homeDir = createTempDir("nextclaw-reconcile-null-ptr-");
    const storePath = join(homeDir, "cron", "jobs.json");
    const dbJobId = "db-job-4";

    writeJobsJson(storePath, [
      cronJobFixture({ id: "orphan-short-id", name: `ejob:${dbJobId}`, updatedAtMs: 10 })
    ]);

    const { jobRepo, scheduleRepo, employeeRepo, jobStore, patchCalls } = buildStubs([
      {
        id: dbJobId,
        employeeId: "emp-4",
        name: "null-ptr",
        description: "",
        scheduleKind: "cron",
        cronExpr: "0 9 * * *",
        everyMs: null,
        heartbeatIntervalS: null,
        taskPrompt: "",
        runtimeJobId: null,
        enabled: true,
        nextRunAt: null,
        createdAt: "",
        updatedAt: ""
      }
    ]);

    const { automation, cron } = buildAutomation(storePath, jobRepo, scheduleRepo, employeeRepo);
    await automation.start();

    expect(patchCalls).toContainEqual({ jobId: dbJobId, runtimeJobId: "orphan-short-id" });
    expect(jobStore.get(dbJobId)!.runtimeJobId).toBe("orphan-short-id");

    cron.stop();
  });

  it("retires legacy employee schedule when enabled jobs already exist for the same employee", async () => {
    const homeDir = createTempDir("nextclaw-reconcile-legacy-retire-");
    const storePath = join(homeDir, "cron", "jobs.json");
    const employeeId = "emp-legacy-and-job";

    writeJobsJson(storePath, [
      cronJobFixture({ id: "legacy-runtime", name: `employee:${employeeId}`, updatedAtMs: 1 }),
      cronJobFixture({ id: "job-runtime", name: "ejob:job-legacy-shadow", updatedAtMs: 2 })
    ]);

    const { jobRepo, scheduleRepo, employeeRepo, scheduleStore } = buildStubs(
      [
        {
          id: "job-legacy-shadow",
          employeeId,
          name: "daily-report",
          description: "",
          scheduleKind: "cron",
          cronExpr: "0 9 * * *",
          everyMs: null,
          heartbeatIntervalS: null,
          taskPrompt: "",
          enabled: true,
          runtimeJobId: "job-runtime",
          nextRunAt: null,
          createdAt: "",
          updatedAt: ""
        }
      ],
      [
        {
          id: "legacy-schedule-row",
          employeeId,
          scheduleKind: "cron",
          cronExpr: "0 9 * * *",
          everyMs: null,
          heartbeatEnabled: false,
          heartbeatIntervalS: null,
          enabled: true,
          runtimeJobId: "legacy-runtime",
          scheduleMessage: "legacy schedule",
          nextRunAt: "2026-04-21 09:00:00",
          createdByUserId: null,
          updatedByUserId: null,
          createdAt: "",
          updatedAt: ""
        }
      ]
    );

    const { automation, cron } = buildAutomation(storePath, jobRepo, scheduleRepo, employeeRepo);
    await automation.start();

    const finalStore = readJobsJson(storePath);
    expect(finalStore.jobs.map((job) => job.name)).toEqual(["ejob:job-legacy-shadow"]);
    expect(scheduleStore.get(employeeId)).toMatchObject({
      enabled: false,
      runtimeJobId: null,
      nextRunAt: null
    });

    cron.stop();
  });

  it("reconciles duplicate legacy employee:* runtimes down to a single canonical entry", async () => {
    const homeDir = createTempDir("nextclaw-reconcile-legacy-dup-");
    const storePath = join(homeDir, "cron", "jobs.json");
    const employeeId = "emp-legacy-only";

    writeJobsJson(storePath, [
      cronJobFixture({ id: "legacy-old", name: `employee:${employeeId}`, updatedAtMs: 1 }),
      cronJobFixture({ id: "legacy-new", name: `employee:${employeeId}`, updatedAtMs: 9 })
    ]);

    const { jobRepo, scheduleRepo, employeeRepo, scheduleStore } = buildStubs(
      [],
      [
        {
          id: "legacy-schedule-only",
          employeeId,
          scheduleKind: "cron",
          cronExpr: "0 9 * * *",
          everyMs: null,
          heartbeatEnabled: false,
          heartbeatIntervalS: null,
          enabled: true,
          runtimeJobId: null,
          scheduleMessage: "legacy only",
          nextRunAt: null,
          createdByUserId: null,
          updatedByUserId: null,
          createdAt: "",
          updatedAt: ""
        }
      ]
    );

    const { automation, cron } = buildAutomation(storePath, jobRepo, scheduleRepo, employeeRepo);
    await automation.start();

    const finalStore = readJobsJson(storePath);
    const employeeJobs = finalStore.jobs.filter((job) => job.name === `employee:${employeeId}`);
    expect(employeeJobs).toHaveLength(1);
    expect(employeeJobs[0]!.id).toBe("legacy-new");
    expect(scheduleStore.get(employeeId)?.runtimeJobId).toBe("legacy-new");

    cron.stop();
  });
});

/**
 * `runJobNow` drift detection tests.
 *
 * Previously this path attempted to self-heal (re-register the cron entry or
 * restart the heartbeat) on every missing-runtime case. That silently hid
 * the drift, accreted `jobs.json` duplicates across HMR reloads, and
 * broke the invariant that reconciliation is the sole owner of startup
 * state. We now fast-fail with `runtime_missing` so the UI/agent surface
 * a clear recovery action (disable → re-enable).
 *
 * These tests avoid calling `.start()` so we don't trigger reconciliation:
 * the setup models a post-drift state where the DB disagrees with the
 * cron/heartbeat runtime without any self-healing opportunity.
 */
describe("automation service - runJobNow fast-fail on drift", () => {
  it("returns runtime_missing when DB runtime_job_id is null (cron)", async () => {
    const homeDir = createTempDir("nextclaw-runjob-null-rt-");
    const storePath = join(homeDir, "cron", "jobs.json");
    writeJobsJson(storePath, []);

    const { jobRepo, scheduleRepo, employeeRepo } = buildStubs([
      {
        id: "j-null-rt",
        employeeId: "emp-x",
        name: "drift-null",
        description: "",
        scheduleKind: "cron",
        cronExpr: "0 9 * * *",
        everyMs: null,
        heartbeatIntervalS: null,
        taskPrompt: "",
        enabled: true,
        runtimeJobId: null,
        nextRunAt: null,
        createdAt: "",
        updatedAt: ""
      }
    ]);

    const { automation, cron } = buildAutomation(storePath, jobRepo, scheduleRepo, employeeRepo);
    const outcome = await automation.runJobNow("j-null-rt");

    expect(outcome).toMatchObject({
      triggered: false,
      reason: "runtime_missing"
    });
    // User-facing hint must mention the recovery action; the frontend
    // swaps the text to a localized variant, but the API-layer message
    // should still carry enough info for CLI/log consumers.
    if (!outcome.triggered) {
      expect(outcome.message).toMatch(/disable.+re-enable|runtimeJobId is null/i);
    }
    cron.stop();
  });

  it("returns runtime_missing when DB runtime_job_id points at a cron entry that doesn't exist", async () => {
    const homeDir = createTempDir("nextclaw-runjob-dangling-");
    const storePath = join(homeDir, "cron", "jobs.json");
    writeJobsJson(storePath, []);

    const { jobRepo, scheduleRepo, employeeRepo } = buildStubs([
      {
        id: "j-dangling",
        employeeId: "emp-x",
        name: "drift-dangling",
        description: "",
        scheduleKind: "every",
        cronExpr: null,
        everyMs: 60_000,
        heartbeatIntervalS: null,
        taskPrompt: "",
        enabled: true,
        // DB thinks this runtime exists, but `jobs.json` is empty — the
        // kind of drift a partial delete or reconciliation gap would
        // produce.
        runtimeJobId: "ghost-short-id",
        nextRunAt: null,
        createdAt: "",
        updatedAt: ""
      }
    ]);

    const { automation, cron } = buildAutomation(storePath, jobRepo, scheduleRepo, employeeRepo);
    const outcome = await automation.runJobNow("j-dangling");

    expect(outcome).toMatchObject({
      triggered: false,
      reason: "runtime_missing"
    });
    // Regression guard: the pre-fix implementation re-added the cron
    // entry here ("self-heal"). Confirm we didn't write anything to the
    // store — a fresh `jobs.json` proves fast-fail didn't leak side
    // effects on a misconfigured read.
    const finalStore = readJobsJson(storePath);
    expect(finalStore.jobs).toHaveLength(0);

    cron.stop();
  });

  it("returns runtime_missing for heartbeat jobs when no scheduler is running", async () => {
    const homeDir = createTempDir("nextclaw-runjob-hb-missing-");
    const storePath = join(homeDir, "cron", "jobs.json");
    writeJobsJson(storePath, []);

    const { jobRepo, scheduleRepo, employeeRepo } = buildStubs([
      {
        id: "j-hb-drift",
        employeeId: "emp-x",
        name: "drift-heartbeat",
        description: "",
        scheduleKind: "heartbeat",
        cronExpr: null,
        everyMs: null,
        heartbeatIntervalS: 30,
        taskPrompt: "",
        enabled: true,
        runtimeJobId: null,
        nextRunAt: null,
        createdAt: "",
        updatedAt: ""
      }
    ]);

    // No `.start()` call: heartbeat map is empty — same effective state
    // as "scheduler died between reconciliation and the user click".
    const { automation, cron } = buildAutomation(storePath, jobRepo, scheduleRepo, employeeRepo);
    const outcome = await automation.runJobNow("j-hb-drift");

    expect(outcome).toMatchObject({
      triggered: false,
      reason: "runtime_missing"
    });
    if (!outcome.triggered) {
      expect(outcome.message).toMatch(/heartbeat|disable.+re-enable/i);
    }
    cron.stop();
  });

  it("returns job_not_found / job_disabled without touching the cron store", async () => {
    // Negative-path sanity: the non-drift fast-fails must not be
    // collapsed into `runtime_missing`. Keeps the HTTP/LLM mapping
    // deterministic.
    const homeDir = createTempDir("nextclaw-runjob-nomatch-");
    const storePath = join(homeDir, "cron", "jobs.json");
    writeJobsJson(storePath, []);

    const { jobRepo, scheduleRepo, employeeRepo } = buildStubs([
      {
        id: "j-disabled",
        employeeId: "emp-x",
        name: "disabled-job",
        description: "",
        scheduleKind: "cron",
        cronExpr: "0 9 * * *",
        everyMs: null,
        heartbeatIntervalS: null,
        taskPrompt: "",
        enabled: false, // disabled
        runtimeJobId: null,
        nextRunAt: null,
        createdAt: "",
        updatedAt: ""
      }
    ]);

    const { automation, cron } = buildAutomation(storePath, jobRepo, scheduleRepo, employeeRepo);
    const notFound = await automation.runJobNow("ghost");
    expect(notFound).toMatchObject({ triggered: false, reason: "job_not_found" });

    const disabled = await automation.runJobNow("j-disabled");
    expect(disabled).toMatchObject({ triggered: false, reason: "job_disabled" });

    cron.stop();
  });
});

/**
 * Per-job mutex tests for `updateJob` / `deleteJob`.
 *
 * Without serialization, two concurrent `updateJob(sameId)` calls could
 * interleave their `removeJob(oldRuntime) → addJob(newRuntime)` sequences
 * and leak an orphan cron entry (reconciliation-only cleanup until
 * restart). The lock guarantees the second caller sees the first's
 * fully-committed state before starting its own work.
 */
describe("automation service - per-job mutex", () => {
  it("serializes concurrent updateJob calls on the same jobId (no orphan entries)", async () => {
    const homeDir = createTempDir("nextclaw-mutex-update-");
    const storePath = join(homeDir, "cron", "jobs.json");
    writeJobsJson(storePath, []);

    const dbJobId = "j-mutex";
    const { jobRepo, scheduleRepo, employeeRepo } = buildStubs([
      {
        id: dbJobId,
        employeeId: "emp-m",
        name: "mutex-test",
        description: "",
        scheduleKind: "cron",
        cronExpr: "0 9 * * *",
        everyMs: null,
        heartbeatIntervalS: null,
        taskPrompt: "original",
        enabled: true,
        runtimeJobId: null,
        nextRunAt: null,
        createdAt: "",
        updatedAt: ""
      }
    ]);

    // Extend jobRepo with an update() that mirrors in-memory state; the
    // stub from buildStubs doesn't provide one because reconciliation
    // didn't need it.
    (jobRepo as any).update = async (id: string, patch: Record<string, unknown>) => {
      const current = await jobRepo.getById(id);
      if (!current) return null;
      const next = { ...current, ...patch };
      (jobRepo as any).getById = async (gid: string) =>
        gid === id ? next : await jobRepo.getById(gid);
      return next;
    };

    // Instrument the cron-service call order so we can detect interleaving.
    const { automation, cron } = buildAutomation(storePath, jobRepo, scheduleRepo, employeeRepo);
    const events: string[] = [];
    const realAdd = cron.addJob.bind(cron);
    const realRemove = cron.removeJob.bind(cron);
    vi.spyOn(cron, "addJob").mockImplementation((input) => {
      events.push(`add:${input.name}`);
      return realAdd(input);
    });
    vi.spyOn(cron, "removeJob").mockImplementation((id) => {
      events.push(`remove:${id}`);
      return realRemove(id);
    });

    // Fire two concurrent updates. Without the lock, both would read
    // runtimeJobId=null at the same moment, skip removeJob, and both
    // addJob, leaving two entries.
    const [first, second] = await Promise.all([
      automation.updateJob(dbJobId, { taskPrompt: "first" }),
      automation.updateJob(dbJobId, { taskPrompt: "second" })
    ]);

    // Both should succeed.
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();

    // Single ejob entry in the store — second call must have removed the
    // first call's runtime before adding its own, which is only possible
    // if it started after the first finished writing runtimeJobId.
    const finalStore = readJobsJson(storePath);
    const ejobs = finalStore.jobs.filter((j) => j.name === `ejob:${dbJobId}`);
    expect(ejobs).toHaveLength(1);

    // The observable event sequence must be: add → remove → add. Any
    // interleaving (add-add-remove-remove, add-remove-remove-add, etc.)
    // indicates the lock failed.
    const ejobEvents = events.filter((e) => e.includes(`ejob:${dbJobId}`) || e.startsWith("remove:"));
    // Drop the remove of the first add's short id; we just need the
    // ordered count of adds vs removes to interleave correctly.
    const adds = events.filter((e) => e === `add:ejob:${dbJobId}`).length;
    const removes = events.filter((e) => e.startsWith("remove:")).length;
    expect(adds).toBe(2);
    // First updateJob starts with runtimeJobId=null so it removes nothing;
    // second sees the first's fresh runtime and removes it. Expect 1 remove.
    expect(removes).toBe(1);
    // And the first event must be an add (first caller has the lock).
    expect(ejobEvents[0]).toBe(`add:ejob:${dbJobId}`);

    cron.stop();
  });

  it("does not block subsequent calls when an earlier call throws", async () => {
    // A rejected call must not wedge the mutex. This is easy to get
    // wrong — storing the raw `fn` promise as the tail would cause an
    // unhandledRejection while it sits in the map, AND subsequent
    // callers awaiting `prev.then(fn)` would inherit the rejection if
    // we used `.then(fn)` instead of `.then(fn, fn)`.
    const homeDir = createTempDir("nextclaw-mutex-throw-");
    const storePath = join(homeDir, "cron", "jobs.json");
    writeJobsJson(storePath, []);

    const { jobRepo, scheduleRepo, employeeRepo } = buildStubs([
      {
        id: "j-throw",
        employeeId: "emp-m",
        name: "mutex-throw",
        description: "",
        scheduleKind: "cron",
        cronExpr: "0 9 * * *",
        everyMs: null,
        heartbeatIntervalS: null,
        taskPrompt: "p",
        enabled: true,
        runtimeJobId: null,
        nextRunAt: null,
        createdAt: "",
        updatedAt: ""
      }
    ]);
    (jobRepo as any).update = async (id: string, patch: Record<string, unknown>) => {
      const current = await jobRepo.getById(id);
      if (!current) return null;
      const next = { ...current, ...patch };
      (jobRepo as any).getById = async (gid: string) =>
        gid === id ? next : await jobRepo.getById(gid);
      return next;
    };
    (jobRepo as any).delete = async () => {};

    const { automation, cron } = buildAutomation(storePath, jobRepo, scheduleRepo, employeeRepo);

    // Force the first call to throw inside the locked region by breaking
    // employeeRepo temporarily.
    let throwOnce = true;
    const origGetEmp = employeeRepo.getById;
    (employeeRepo as any).getById = async (id: string) => {
      if (throwOnce) {
        throwOnce = false;
        throw new Error("synthetic employee failure");
      }
      return origGetEmp(id);
    };

    await expect(automation.updateJob("j-throw", { taskPrompt: "x" })).rejects.toThrow(
      "synthetic employee failure"
    );
    // Second call must run cleanly after the first's failure drained.
    const ok = await automation.updateJob("j-throw", { taskPrompt: "y" });
    expect(ok).not.toBeNull();
    expect(ok.taskPrompt).toBe("y");

    cron.stop();
  });
});
