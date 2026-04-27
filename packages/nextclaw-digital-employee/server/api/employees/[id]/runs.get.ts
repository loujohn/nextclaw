import { getQuery, getRouterParam } from "h3";
import { getPlatformContext } from "../../../runtime/platform-context";
import { buildRunListEntries } from "../../../../shared/ui-models";
import { requireAuth } from "../../../utils/auth-guards";
import { resolveRolePermissionAccessScope } from "../../../utils/chat-session-access";
import { RUN_RECORD_VIEW_ALL_PERMISSION, SCHEDULE_JOB_VIEW_ALL_PERMISSION } from "../../../../shared/role-permissions";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default defineEventHandler(async (event) => {
  const user = requireAuth(event);
  const query = getQuery(event);
  const employeeId = getRouterParam(event, "id") ?? "";
  const rawPage = typeof query.page === "string" ? Number.parseInt(query.page, 10) : 1;
  const rawPageSize = typeof query.pageSize === "string" ? Number.parseInt(query.pageSize, 10) : 10;
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const pageSize = Number.isFinite(rawPageSize) && rawPageSize > 0 ? Math.min(rawPageSize, 100) : 10;
  const rawJobId = typeof query.jobId === "string" ? query.jobId : undefined;
  const scheduleJobId = rawJobId && UUID_RE.test(rawJobId) ? rawJobId : undefined;
  const ctx = await getPlatformContext();
  const [runAccessScope, jobAccessScope] = await Promise.all([
    resolveRolePermissionAccessScope(user, ctx.rolePermissionRepo, RUN_RECORD_VIEW_ALL_PERMISSION),
    resolveRolePermissionAccessScope(user, ctx.rolePermissionRepo, SCHEDULE_JOB_VIEW_ALL_PERMISSION)
  ]);
  const [employee, pagedRuns, jobs] = await Promise.all([
    ctx.employeeRepo.getById(employeeId),
    ctx.runRepo.listPagedByEmployeeId({
      employeeId,
      page,
      pageSize,
      scheduleJobId,
      actorUserId: user.id,
      accessScope: runAccessScope
    }),
    ctx.automationService.listJobsForEmployee({
      employeeId,
      actorUserId: user.id,
      accessScope: jobAccessScope
    })
  ]);
  const creatorIds = [...new Set(pagedRuns.items
    .map((run) => run.createdByUserId)
    .filter((value): value is string => Boolean(value)))];
  const displayNamesById = creatorIds.length > 0
    ? await ctx.userRepo.listDisplayNamesByIds(creatorIds)
    : {};
  return {
    ok: true,
    data: {
      items: buildRunListEntries({
        employees: employee ? [{ id: employee.id, name: employee.name }] : [],
        jobs: jobs.map((job) => ({ id: job.id, name: job.name })),
        runs: pagedRuns.items.map((run) => ({
          ...run,
          createdByUserDisplayName: run.createdByUserId ? displayNamesById[run.createdByUserId] ?? null : null
        }))
      }),
      total: pagedRuns.total,
      page,
      pageSize
    }
  };
});
