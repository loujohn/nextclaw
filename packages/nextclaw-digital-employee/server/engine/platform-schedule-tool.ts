import type { ExtensionTool, ExtensionToolContext, ExtensionToolFactory } from "@nextclaw/core";
import type {
  AutomationService,
  EmployeeScheduleJobView
} from "../services/automation-service";

export type PlatformScheduleToolDeps = {
  automationService: AutomationService | null;
};

/** Structured response envelope returned by every `schedule` tool invocation.
 *
 * Modeled as a discriminated union on `status` so both sides of the AI-facing
 * contract (prompt documentation, tool handler code, and future response
 * inspection logic) can rely on `status === "ok" | "error"` to branch safely.
 * `retriable` is mandatory on error paths because the AI tool-loop uses it to
 * decide whether to retry; see `err()` below for the construction helper. */
export type ScheduleToolResponse =
  | { status: "ok"; jobs: SanitizedJob[] }
  | { status: "ok"; job: SanitizedJob }
  | { status: "ok"; deleted: string }
  | { status: "ok"; triggered: boolean }
  | { status: "error"; error: string; retriable: boolean };

/** AI-facing view of a schedule job. Mirrors `EmployeeScheduleJobView`
 * with the internal cron-engine handle (`runtimeJobId`) stripped, so the
 * AI never sees (or relays) an opaque runtime id the platform considers
 * internal. */
export type SanitizedJob = Omit<EmployeeScheduleJobView, "runtimeJobId">;

/** `employee:<id>:scheduled:<scope>` is the canonical format for scheduled
 * execution contexts (see `automation-service.ts#buildScheduledSessionKey`).
 * A strict prefix regex avoids false positives from other sessionKeys that
 * happen to contain the substring `:scheduled:` (e.g. a debug scope like
 * `employee:x:ui:rescheduled:debug` or a future `:rescheduled:` namespace). */
const SCHEDULED_SESSION_KEY_RE = /^employee:[^:]+:scheduled:/;

function extractEmployeeId(ctx: ExtensionToolContext): string | null {
  if (ctx.chatId) return ctx.chatId;
  const sk = ctx.sessionKey ?? "";
  const match = sk.match(/^employee:([^:]+):/);
  return match?.[1] ?? null;
}

function isScheduledContext(ctx: ExtensionToolContext): boolean {
  return SCHEDULED_SESSION_KEY_RE.test(ctx.sessionKey ?? "");
}

function sanitizeJobForOutput(job: EmployeeScheduleJobView): SanitizedJob {
  const { runtimeJobId: _rid, ...rest } = job;
  return rest;
}

/** Uniform error-envelope helper so every `status: "error"` path includes an
 * explicit `retriable` flag. AI tool-loop heuristics look at this flag to
 * decide whether to retry, so mixing present/absent values is subtly
 * hazardous — e.g. a transient error without the flag could be treated as
 * permanent, or an input-validation error without the flag could be retried
 * forever. */
function err(message: string, opts?: { retriable?: boolean }): {
  status: "error";
  error: string;
  retriable: boolean;
} {
  return { status: "error", error: message, retriable: opts?.retriable ?? false };
}

/** Wraps `AutomationService` calls into the `ScheduleToolResponse` contract.
 *
 * The schedule tool returns a structured union that the AI tool-loop uses to
 * decide whether to retry (`retriable: true` for transient/infra issues,
 * `false` for deterministic input/authorization issues). Without this wrapper
 * a raw service exception would bypass the union and surface as an uncaught
 * tool error, which is ambiguous for the AI. All infra failures here are
 * treated as retriable so the loop can back off rather than giving up. */
async function callService<T>(
  op: string,
  fn: () => Promise<T>
): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `${op} failed: ${detail}` };
  }
}

export function createPlatformScheduleToolFactory(
  deps: PlatformScheduleToolDeps
): ExtensionToolFactory {
  return (ctx: ExtensionToolContext): ExtensionTool => ({
    name: "schedule",
    description:
      "Manage scheduled tasks for the current employee. Actions: list, create, update, delete, run_now.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["list", "create", "update", "delete", "run_now"],
          description: "Action to perform"
        },
        jobId: {
          type: "string",
          description: "Job ID (required for update, delete, run_now)"
        },
        name: { type: "string", description: "Task name (required for create)" },
        description: { type: "string", description: "Task description" },
        scheduleKind: {
          type: "string",
          enum: ["cron", "every", "heartbeat"],
          description: "Schedule type (required for create)"
        },
        cronExpr: {
          type: "string",
          description: 'Cron expression, e.g. "0 9 * * *" (for scheduleKind=cron)'
        },
        everyMs: {
          type: "integer",
          description: "Interval in milliseconds (for scheduleKind=every)"
        },
        taskPrompt: {
          type: "string",
          description: "The prompt message to execute at trigger time (required for create)"
        },
        enabled: { type: "boolean", description: "Whether the task is enabled (default true)" }
      },
      required: ["action"]
    },
    execute: async (params: Record<string, unknown>): Promise<ScheduleToolResponse> => {
      // IMPORTANT: read `deps.automationService` on EVERY invocation, not
      // once at factory construction time. `platform-context.ts` intentionally
      // registers this tool before `AutomationService` exists (circular bootstrap
      // dependency: AutomationService needs Gateway; Gateway needs tool registry).
      // The shared `deps` object gets its `.automationService` field populated
      // right after the gateway is constructed. See the comment next to
      // `scheduleDeps` in platform-context.ts for the full rationale.
      const service = deps.automationService;
      if (!service) {
        // Transient startup race: the engine can be invoked before the
        // automation service finishes booting. The structured error lets
        // the AI surface it to the user instead of blindly retrying and
        // stacking up redundant tool calls.
        return err(
          "Schedule service is not ready yet (platform still initializing). Please try again in a moment.",
          { retriable: true }
        );
      }

      const employeeId = extractEmployeeId(ctx);
      if (!employeeId) {
        return err("Cannot determine employee context");
      }

      const action = String(params.action ?? "").trim();

      switch (action) {
        case "list": {
          const r = await callService("list jobs", () =>
            service.listJobsForEmployee(employeeId)
          );
          if (!r.ok) return err(r.error, { retriable: true });
          return { status: "ok", jobs: r.value.map(sanitizeJobForOutput) };
        }

        case "create": {
          if (isScheduledContext(ctx)) {
            return err("Cannot create tasks during scheduled execution (recursion prevention)");
          }
          const name = String(params.name ?? "").trim();
          const taskPrompt = String(params.taskPrompt ?? "").trim();
          const scheduleKind = String(params.scheduleKind ?? "").trim();
          if (!name) return err("name is required");
          if (!taskPrompt) return err("taskPrompt is required");
          if (!["cron", "every", "heartbeat"].includes(scheduleKind)) {
            return err('scheduleKind must be "cron", "every", or "heartbeat"');
          }
          const cronExpr = params.cronExpr ? String(params.cronExpr) : undefined;
          let everyMs: number | undefined;
          if (params.everyMs !== undefined) {
            if (typeof params.everyMs !== "number" || !Number.isFinite(params.everyMs)) {
              return err("everyMs must be a finite number of milliseconds");
            }
            const truncated = Math.trunc(params.everyMs);
            if (truncated <= 0) {
              return err("everyMs must be a positive integer when scheduleKind is every");
            }
            everyMs = truncated;
          }
          if (scheduleKind === "cron" && !cronExpr) {
            return err("cronExpr is required when scheduleKind is cron");
          }
          if (scheduleKind === "every" && everyMs === undefined) {
            return err("everyMs must be a positive integer when scheduleKind is every");
          }
          const r = await callService("create job", () =>
            service.createJob({
              employeeId,
              name,
              description: params.description ? String(params.description) : undefined,
              scheduleKind: scheduleKind as "cron" | "every" | "heartbeat",
              cronExpr,
              everyMs,
              taskPrompt,
              enabled: typeof params.enabled === "boolean" ? params.enabled : true
            })
          );
          if (!r.ok) return err(r.error, { retriable: true });
          return { status: "ok", job: sanitizeJobForOutput(r.value) };
        }

        case "update": {
          const jobId = String(params.jobId ?? "").trim();
          if (!jobId) return err("jobId is required");
          const updates: {
            name?: string;
            description?: string;
            scheduleKind?: "cron" | "every" | "heartbeat";
            cronExpr?: string;
            everyMs?: number;
            taskPrompt?: string;
            enabled?: boolean;
          } = {};
          if (params.name !== undefined) updates.name = String(params.name);
          if (params.description !== undefined) updates.description = String(params.description);
          if (params.scheduleKind !== undefined) {
            const kind = String(params.scheduleKind).trim();
            if (!["cron", "every", "heartbeat"].includes(kind)) {
              return err('scheduleKind must be "cron", "every", or "heartbeat"');
            }
            updates.scheduleKind = kind as "cron" | "every" | "heartbeat";
          }
          if (params.cronExpr !== undefined) updates.cronExpr = String(params.cronExpr);
          if (params.everyMs !== undefined) {
            if (typeof params.everyMs !== "number" || !Number.isFinite(params.everyMs)) {
              return err("everyMs must be a finite number of milliseconds");
            }
            const truncated = Math.trunc(params.everyMs);
            if (truncated <= 0) {
              return err("everyMs must be a positive integer");
            }
            updates.everyMs = truncated;
          }
          if (params.taskPrompt !== undefined) updates.taskPrompt = String(params.taskPrompt);
          if (params.enabled !== undefined) updates.enabled = Boolean(params.enabled);
          const r = await callService("update job", () =>
            service.updateJob(jobId, updates, { expectedEmployeeId: employeeId })
          );
          if (!r.ok) return err(r.error, { retriable: true });
          return { status: "ok", job: sanitizeJobForOutput(r.value) };
        }

        case "delete": {
          const jobId = String(params.jobId ?? "").trim();
          if (!jobId) return err("jobId is required");
          const r = await callService("delete job", () =>
            service.deleteJob(jobId, { expectedEmployeeId: employeeId })
          );
          if (!r.ok) return err(r.error, { retriable: true });
          return { status: "ok", deleted: jobId };
        }

        case "run_now": {
          const jobId = String(params.jobId ?? "").trim();
          if (!jobId) return err("jobId is required");
          const r = await callService("run job now", () =>
            service.runJobNow(jobId, { expectedEmployeeId: employeeId })
          );
          if (!r.ok) return err(r.error, { retriable: true });
          if (!r.value.triggered) {
            // Classify the structured reason for the AI tool loop:
            //
            // - `job_not_found` / `job_disabled`: state mismatch with what
            //   the agent believes, non-retriable — the agent should re-plan
            //   (list jobs, enable, or recreate) rather than spin.
            // - `runtime_missing`: the DB↔runtime invariant broke; retrying
            //   the same call will keep failing identically until a human
            //   disables→enables the job. Non-retriable from the tool's
            //   perspective; surface the drift to the agent so it can
            //   suggest or execute the recovery action explicitly.
            // - `engine_failed`: a live agent turn errored (network, model
            //   hiccup, downstream API). That's the only genuinely
            //   transient class, so keep it retriable.
            const retriable = r.value.reason === "engine_failed";
            return err(`${r.value.message} (reason=${r.value.reason})`, { retriable });
          }
          return { status: "ok", triggered: true };
        }

        default:
          return err(`Unknown action "${action}". Use list, create, update, delete, or run_now.`);
      }
    }
  });
}
