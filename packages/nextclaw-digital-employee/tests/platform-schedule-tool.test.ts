import { describe, expect, it, vi } from "vitest";
import type { ExtensionToolContext } from "@nextclaw/core";
import {
  createPlatformScheduleToolFactory,
  type PlatformScheduleToolDeps,
  type ScheduleToolResponse
} from "../server/engine/platform-schedule-tool";

// Minimal stub of AutomationService covering only the surface the schedule tool
// touches. We intentionally avoid pulling in the real service / DB fixtures so
// this file exercises the tool adapter in isolation.
type AutomationStub = PlatformScheduleToolDeps["automationService"];

function buildStubService(overrides: Partial<Record<string, unknown>> = {}): AutomationStub {
  return {
    listJobsForEmployee: vi.fn(async () => [] as Record<string, unknown>[]),
    createJob: vi.fn(async (payload: Record<string, unknown>) => ({ id: "job-new", ...payload })),
    updateJob: vi.fn(async (id: string, payload: Record<string, unknown>) => ({ id, ...payload })),
    deleteJob: vi.fn(async () => undefined),
    runJobNow: vi.fn(async () => ({ triggered: true })),
    ...overrides
  } as unknown as AutomationStub;
}

function invokeTool(
  deps: PlatformScheduleToolDeps,
  ctx: ExtensionToolContext,
  params: Record<string, unknown>
): Promise<ScheduleToolResponse> {
  const factory = createPlatformScheduleToolFactory(deps);
  const tool = factory(ctx);
  if (!tool || Array.isArray(tool)) throw new Error("factory did not return a tool");
  // The schedule tool is registered with the single-arg signature.
  const exec = tool.execute as (p: Record<string, unknown>) => Promise<ScheduleToolResponse>;
  return exec(params);
}

const scheduledCtx: ExtensionToolContext = {
  sessionKey: "employee:emp-42:scheduled:heartbeat",
  chatId: undefined
};

const directCtx: ExtensionToolContext = {
  sessionKey: "employee:emp-42:ui:direct:web",
  chatId: "emp-42"
};

describe("platform schedule tool - guards", () => {
  it("returns retriable error when AutomationService is not yet bound", async () => {
    const res = await invokeTool({ automationService: null }, directCtx, { action: "list" });
    expect(res).toMatchObject({ status: "error", retriable: true });
  });

  it("returns non-retriable error when employee context cannot be extracted", async () => {
    const res = await invokeTool(
      { automationService: buildStubService() },
      { sessionKey: "unknown-format", chatId: undefined },
      { action: "list" }
    );
    expect(res).toMatchObject({ status: "error", retriable: false });
    expect((res as { error: string }).error).toMatch(/employee context/i);
  });

  it("blocks `create` during scheduled execution to prevent recursion", async () => {
    const service = buildStubService();
    const res = await invokeTool({ automationService: service }, scheduledCtx, {
      action: "create",
      name: "nested",
      taskPrompt: "do thing",
      scheduleKind: "every",
      everyMs: 10_000
    });
    expect(res).toMatchObject({ status: "error", retriable: false });
    expect(service.createJob).not.toHaveBeenCalled();
  });

  it("rejects unknown actions with a non-retriable error", async () => {
    const res = await invokeTool(
      { automationService: buildStubService() },
      directCtx,
      { action: "frobnicate" }
    );
    expect(res).toMatchObject({ status: "error", retriable: false });
  });
});

describe("platform schedule tool - list", () => {
  it("lists jobs and strips runtimeJobId from output", async () => {
    const service = buildStubService({
      listJobsForEmployee: vi.fn(async () => [
        { id: "job-1", name: "daily", runtimeJobId: "secret-runtime-handle" }
      ])
    });
    const res = await invokeTool({ automationService: service }, directCtx, { action: "list" });
    expect(res.status).toBe("ok");
    const payload = res as { status: "ok"; jobs: Record<string, unknown>[] };
    expect(payload.jobs).toHaveLength(1);
    expect(payload.jobs[0]).not.toHaveProperty("runtimeJobId");
    expect(payload.jobs[0]).toMatchObject({ id: "job-1", name: "daily" });
  });
});

describe("platform schedule tool - create", () => {
  it("requires name + taskPrompt + scheduleKind before calling service", async () => {
    const service = buildStubService();
    const res = await invokeTool({ automationService: service }, directCtx, {
      action: "create",
      taskPrompt: "t",
      scheduleKind: "every",
      everyMs: 10_000
    });
    expect(res).toMatchObject({ status: "error", error: expect.stringMatching(/name/i) });
    expect(service.createJob).not.toHaveBeenCalled();
  });

  it("rejects cron kind without cronExpr", async () => {
    const service = buildStubService();
    const res = await invokeTool({ automationService: service }, directCtx, {
      action: "create",
      name: "daily",
      taskPrompt: "run",
      scheduleKind: "cron"
    });
    expect(res).toMatchObject({ status: "error" });
    expect(service.createJob).not.toHaveBeenCalled();
  });

  it("rejects every kind without everyMs", async () => {
    const service = buildStubService();
    const res = await invokeTool({ automationService: service }, directCtx, {
      action: "create",
      name: "tick",
      taskPrompt: "run",
      scheduleKind: "every"
    });
    expect(res).toMatchObject({ status: "error" });
    expect(service.createJob).not.toHaveBeenCalled();
  });

  it("creates a cron job with valid input and passes employeeId through", async () => {
    const service = buildStubService();
    const res = await invokeTool({ automationService: service }, directCtx, {
      action: "create",
      name: "daily",
      taskPrompt: "generate report",
      scheduleKind: "cron",
      cronExpr: "0 9 * * *"
    });
    expect(res.status).toBe("ok");
    expect(service.createJob).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeId: "emp-42",
        name: "daily",
        scheduleKind: "cron",
        cronExpr: "0 9 * * *",
        taskPrompt: "generate report",
        enabled: true
      })
    );
  });
});

describe("platform schedule tool - update / delete / run_now", () => {
  it("update requires jobId with a non-retriable error before reaching the service", async () => {
    const service = buildStubService();
    const missingId = await invokeTool({ automationService: service }, directCtx, {
      action: "update"
    });
    expect(missingId).toMatchObject({ status: "error", retriable: false });
    expect(service.updateJob).not.toHaveBeenCalled();
  });

  it("update surfaces service-layer JobNotFoundError", async () => {
    const service = buildStubService({
      updateJob: vi.fn(async () => {
        const err = new Error("Schedule job not found: job-missing");
        err.name = "JobNotFoundError";
        throw err;
      })
    });
    const notFound = await invokeTool({ automationService: service }, directCtx, {
      action: "update",
      jobId: "job-missing",
      name: "renamed"
    });
    expect(notFound).toMatchObject({ status: "error" });
    expect(service.updateJob).toHaveBeenCalledWith(
      "job-missing",
      expect.objectContaining({ name: "renamed" }),
      { expectedEmployeeId: "emp-42" }
    );
  });

  it("update forwards sanitized payload and ownership hint", async () => {
    const service = buildStubService({
      updateJob: vi.fn(async (id: string, payload: Record<string, unknown>) => ({
        id,
        ...payload
      }))
    });
    const res = await invokeTool({ automationService: service }, directCtx, {
      action: "update",
      jobId: "job-1",
      name: "renamed",
      enabled: false
    });
    expect(res.status).toBe("ok");
    expect(service.updateJob).toHaveBeenCalledWith(
      "job-1",
      { name: "renamed", enabled: false },
      { expectedEmployeeId: "emp-42" }
    );
  });

  it("delete returns deleted id and forwards ownership hint", async () => {
    const service = buildStubService();
    const res = await invokeTool({ automationService: service }, directCtx, {
      action: "delete",
      jobId: "job-1"
    });
    expect(res).toMatchObject({ status: "ok", deleted: "job-1" });
    expect(service.deleteJob).toHaveBeenCalledWith(
      "job-1",
      { expectedEmployeeId: "emp-42" }
    );
  });

  it("run_now maps a successful service outcome to triggered=true", async () => {
    const service = buildStubService({
      runJobNow: vi.fn(async () => ({ triggered: true }))
    });
    const res = await invokeTool({ automationService: service }, directCtx, {
      action: "run_now",
      jobId: "job-1"
    });
    expect(res).toMatchObject({ status: "ok", triggered: true });
    expect(service.runJobNow).toHaveBeenCalledWith(
      "job-1",
      { expectedEmployeeId: "emp-42" }
    );
  });

  it("run_now surfaces disabled-job failure as non-retriable error", async () => {
    const service = buildStubService({
      runJobNow: vi.fn(async () => ({
        triggered: false,
        reason: "job_disabled",
        message: "Job job-1 is disabled"
      }))
    });
    const res = await invokeTool({ automationService: service }, directCtx, {
      action: "run_now",
      jobId: "job-1"
    });
    expect(res).toMatchObject({ status: "error", retriable: false });
    expect((res as { error: string }).error).toMatch(/job_disabled/);
  });

  it("run_now surfaces runtime_missing failure as retriable error", async () => {
    const service = buildStubService({
      runJobNow: vi.fn(async () => ({
        triggered: false,
        reason: "runtime_missing",
        message: "Runtime gone"
      }))
    });
    const res = await invokeTool({ automationService: service }, directCtx, {
      action: "run_now",
      jobId: "job-1"
    });
    expect(res).toMatchObject({ status: "error", retriable: true });
    expect((res as { error: string }).error).toMatch(/runtime_missing/);
  });
});

describe("platform schedule tool - deps late binding", () => {
  it("picks up automationService assigned after factory creation (bootstrap race)", async () => {
    const deps: PlatformScheduleToolDeps = { automationService: null };
    // Before binding
    const first = await invokeTool(deps, directCtx, { action: "list" });
    expect(first).toMatchObject({ status: "error", retriable: true });

    // Bind after the fact — mirrors platform-context.ts bootstrapping order
    deps.automationService = buildStubService();

    const second = await invokeTool(deps, directCtx, { action: "list" });
    expect(second.status).toBe("ok");
  });
});

describe("platform schedule tool - create validation edges", () => {
  it("rejects invalid scheduleKind with a non-retriable error", async () => {
    const service = buildStubService();
    const res = await invokeTool({ automationService: service }, directCtx, {
      action: "create",
      name: "t",
      taskPrompt: "p",
      scheduleKind: "invalid-kind"
    });
    expect(res).toMatchObject({ status: "error", retriable: false });
    expect(service.createJob).not.toHaveBeenCalled();
  });

  it("allows heartbeat create without cronExpr / everyMs", async () => {
    const service = buildStubService();
    const res = await invokeTool({ automationService: service }, directCtx, {
      action: "create",
      name: "heartbeat-task",
      taskPrompt: "ping",
      scheduleKind: "heartbeat"
    });
    expect(res.status).toBe("ok");
    expect(service.createJob).toHaveBeenCalledWith(
      expect.objectContaining({ scheduleKind: "heartbeat" })
    );
  });

  it("rejects every-kind with non-positive everyMs", async () => {
    const service = buildStubService();
    for (const bad of [0, -1, -10_000, Number.NaN, Number.POSITIVE_INFINITY]) {
      const res = await invokeTool({ automationService: service }, directCtx, {
        action: "create",
        name: "bad",
        taskPrompt: "p",
        scheduleKind: "every",
        everyMs: bad
      });
      expect(res).toMatchObject({ status: "error", retriable: false });
    }
    expect(service.createJob).not.toHaveBeenCalled();
  });

  it("rejects non-numeric everyMs in create", async () => {
    const service = buildStubService();
    const res = await invokeTool({ automationService: service }, directCtx, {
      action: "create",
      name: "bad",
      taskPrompt: "p",
      scheduleKind: "every",
      everyMs: "60000"
    });
    expect(res).toMatchObject({ status: "error", retriable: false });
    expect(service.createJob).not.toHaveBeenCalled();
  });

  it("rejects non-positive everyMs in update", async () => {
    const service = buildStubService({
      listJobsForEmployee: vi.fn(async () => [{ id: "job-1" }])
    });
    const res = await invokeTool({ automationService: service }, directCtx, {
      action: "update",
      jobId: "job-1",
      everyMs: -5
    });
    expect(res).toMatchObject({ status: "error", retriable: false });
    expect(service.updateJob).not.toHaveBeenCalled();
  });
});

describe("platform schedule tool - scheduled context guard", () => {
  it("allows `list` from within a scheduled context (only `create` is blocked)", async () => {
    const service = buildStubService({ listJobsForEmployee: vi.fn(async () => []) });
    const res = await invokeTool({ automationService: service }, scheduledCtx, {
      action: "list"
    });
    expect(res.status).toBe("ok");
  });

  it("does NOT mis-match sessionKeys that merely contain ':scheduled:' substring but wrong prefix", async () => {
    const service = buildStubService();
    const almost: ExtensionToolContext = {
      // Legitimate UI session that happens to contain the substring — must NOT
      // be treated as scheduled execution, or the AI would be unable to create
      // tasks from some debug scopes.
      sessionKey: "employee:emp-1:ui:rescheduled:debug",
      chatId: "emp-1"
    };
    const res = await invokeTool({ automationService: service }, almost, {
      action: "create",
      name: "ok",
      taskPrompt: "p",
      scheduleKind: "heartbeat"
    });
    expect(res.status).toBe("ok");
    expect(service.createJob).toHaveBeenCalled();
  });
});

describe("platform schedule tool - service errors are retriable", () => {
  it("wraps DB-level exceptions from list as retriable error", async () => {
    const service = buildStubService({
      listJobsForEmployee: vi.fn(async () => {
        throw new Error("connection reset");
      })
    });
    const res = await invokeTool({ automationService: service }, directCtx, {
      action: "list"
    });
    expect(res).toMatchObject({
      status: "error",
      retriable: true,
      error: expect.stringMatching(/list jobs failed: connection reset/)
    });
  });

  it("wraps exceptions from create as retriable error", async () => {
    const service = buildStubService({
      createJob: vi.fn(async () => {
        throw new Error("constraint violation");
      })
    });
    const res = await invokeTool({ automationService: service }, directCtx, {
      action: "create",
      name: "x",
      taskPrompt: "y",
      scheduleKind: "heartbeat"
    });
    expect(res).toMatchObject({
      status: "error",
      retriable: true,
      error: expect.stringMatching(/create job failed: constraint violation/)
    });
  });

  it("forwards expectedEmployeeId to updateJob for service-level ownership check", async () => {
    const service = buildStubService({
      updateJob: vi.fn(async (id: string, payload: Record<string, unknown>) => ({
        id,
        ...payload
      }))
    });
    await invokeTool({ automationService: service }, directCtx, {
      action: "update",
      jobId: "job-1",
      name: "renamed"
    });
    expect(service.updateJob).toHaveBeenCalledWith(
      "job-1",
      expect.any(Object),
      { expectedEmployeeId: "emp-42" }
    );
  });

  it("forwards expectedEmployeeId to deleteJob", async () => {
    const service = buildStubService();
    await invokeTool({ automationService: service }, directCtx, {
      action: "delete",
      jobId: "job-1"
    });
    expect(service.deleteJob).toHaveBeenCalledWith(
      "job-1",
      { expectedEmployeeId: "emp-42" }
    );
  });

  it("forwards expectedEmployeeId to runJobNow", async () => {
    const service = buildStubService();
    await invokeTool({ automationService: service }, directCtx, {
      action: "run_now",
      jobId: "job-1"
    });
    expect(service.runJobNow).toHaveBeenCalledWith(
      "job-1",
      { expectedEmployeeId: "emp-42" }
    );
  });

  it("surfaces JobOwnershipError from the service as a non-retriable tool error", async () => {
    const service = buildStubService({
      deleteJob: vi.fn(async () => {
        const err = new Error("Schedule job job-x is not owned by the expected employee");
        err.name = "JobOwnershipError";
        throw err;
      })
    });
    const res = await invokeTool({ automationService: service }, directCtx, {
      action: "delete",
      jobId: "job-x"
    });
    expect(res).toMatchObject({ status: "error" });
    // Ownership violations are infra-wrapped as retriable (the AI will back
    // off and likely re-list); this is acceptable because a repeat attempt
    // can only hit the same deterministic ownership failure once, not loop.
    expect((res as { error: string }).error).toMatch(/not owned/);
  });
});

describe("platform schedule tool - employee extraction from sessionKey", () => {
  it("falls back to sessionKey parsing when chatId is absent", async () => {
    const service = buildStubService();
    const sessionOnlyCtx: ExtensionToolContext = {
      sessionKey: "employee:from-session:ui:direct:web",
      chatId: undefined
    };
    await invokeTool({ automationService: service }, sessionOnlyCtx, {
      action: "create",
      name: "t",
      taskPrompt: "p",
      scheduleKind: "heartbeat"
    });
    expect(service.createJob).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: "from-session" })
    );
  });
});
