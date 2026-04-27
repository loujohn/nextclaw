import { createError, getRouterParam } from "h3";
import { getPlatformContext } from "../../../../runtime/platform-context";
import { requireAuth } from "../../../../utils/auth-guards";
import { resolveRolePermissionAccessScope } from "../../../../utils/chat-session-access";
import { SCHEDULE_JOB_VIEW_ALL_PERMISSION } from "../../../../../shared/role-permissions";

export default defineEventHandler(async (event) => {
  const user = requireAuth(event);
  const employeeId = getRouterParam(event, "id") ?? "";
  const jobId = getRouterParam(event, "jobId") ?? "";
  if (!jobId) {
    throw createError({ statusCode: 400, statusMessage: "jobId is required" });
  }
  const ctx = await getPlatformContext();
  const accessScope = await resolveRolePermissionAccessScope(user, ctx.rolePermissionRepo, SCHEDULE_JOB_VIEW_ALL_PERMISSION);
  await ctx.automationService.deleteJob(jobId, {
    expectedEmployeeId: employeeId || undefined,
    actorUserId: user.id,
    accessScope
  });
  return { ok: true };
});
