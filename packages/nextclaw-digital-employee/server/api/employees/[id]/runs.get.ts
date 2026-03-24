import { getQuery, getRouterParam } from "h3";
import { getPlatformContext } from "../../../runtime/platform-context";
import { buildRunListEntries } from "../../../../shared/ui-models";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const employeeId = getRouterParam(event, "id") ?? "";
  const rawPage = typeof query.page === "string" ? Number.parseInt(query.page, 10) : 1;
  const rawPageSize = typeof query.pageSize === "string" ? Number.parseInt(query.pageSize, 10) : 10;
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const pageSize = Number.isFinite(rawPageSize) && rawPageSize > 0 ? Math.min(rawPageSize, 100) : 10;
  const rawJobId = typeof query.jobId === "string" ? query.jobId : undefined;
  const scheduleJobId = rawJobId && UUID_RE.test(rawJobId) ? rawJobId : undefined;
  const ctx = await getPlatformContext();
  const [employee, pagedRuns, jobs] = await Promise.all([
    ctx.employeeRepo.getById(employeeId),
    ctx.runRepo.listPagedByEmployeeId({ employeeId, page, pageSize, scheduleJobId }),
    ctx.employeeScheduleJobRepo.listByEmployeeId(employeeId)
  ]);
  return {
    ok: true,
    data: {
      items: buildRunListEntries({
        employees: employee ? [{ id: employee.id, name: employee.name }] : [],
        jobs: jobs.map((job) => ({ id: job.id, name: job.name })),
        runs: pagedRuns.items
      }),
      total: pagedRuns.total,
      page,
      pageSize
    }
  };
});
