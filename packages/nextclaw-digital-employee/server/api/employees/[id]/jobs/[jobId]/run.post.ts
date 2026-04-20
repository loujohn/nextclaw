import { createError, getRouterParam } from "h3";
import { getPlatformContext } from "../../../../../runtime/platform-context";
import { JobNotFoundError, JobOwnershipError, type RunJobNowReason } from "../../../../../services/automation-service";

/** Map the structured failure reason to an HTTP status code.
 *
 * `runtime_missing` is 409 (Conflict) because it signals the resource is
 * in a state that doesn't permit the operation — the correct user action
 * is to reset the schedule (disable → enable), not retry the same call
 * expecting a different result. That's a client-visible state problem,
 * not a 500. `engine_failed` stays 500 because the request made it all
 * the way to execution and the server-side agent turn itself errored. */
function statusCodeForReason(reason: RunJobNowReason): number {
  switch (reason) {
    case "job_not_found":
      return 404;
    case "job_disabled":
    case "runtime_missing":
      return 409;
    case "engine_failed":
      return 500;
  }
}

export default defineEventHandler(async (event) => {
  const employeeId = getRouterParam(event, "id") ?? "";
  const jobId = getRouterParam(event, "jobId") ?? "";
  if (!jobId) {
    throw createError({ statusCode: 400, statusMessage: "jobId is required" });
  }
  const ctx = await getPlatformContext();
  try {
    const outcome = await ctx.automationService.runJobNow(jobId, {
      expectedEmployeeId: employeeId || undefined
    });
    if (!outcome.triggered) {
      throw createError({
        statusCode: statusCodeForReason(outcome.reason),
        statusMessage: outcome.message,
        // Mirror the message under `data` as well. Nuxt's `$fetch` puts the
        // `statusMessage` at `err.statusMessage`, not `err.data.statusMessage`;
        // exposing `message` on `data` gives the client a canonical place
        // to read the user-facing copy regardless of which field it's
        // looking for. Also lets the reason drive UI behavior (e.g.
        // auto-refresh on `job_not_found`).
        data: { reason: outcome.reason, message: outcome.message }
      });
    }
    return { ok: true };
  } catch (err) {
    if (err instanceof JobNotFoundError) {
      throw createError({
        statusCode: 404,
        statusMessage: `Job ${jobId} not found`,
        data: { reason: "job_not_found", message: `Job ${jobId} not found` }
      });
    }
    if (err instanceof JobOwnershipError) {
      throw createError({
        statusCode: 403,
        statusMessage: `Job ${jobId} does not belong to employee ${employeeId}`,
        data: {
          reason: "ownership_mismatch",
          message: `Job ${jobId} does not belong to employee ${employeeId}`
        }
      });
    }
    throw err;
  }
});
