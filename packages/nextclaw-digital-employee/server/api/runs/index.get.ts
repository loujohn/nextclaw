import { getQuery } from "h3";
import { getPlatformContext } from "../../runtime/platform-context";
import { buildRunListEntries } from "../../../shared/ui-models";

const ALLOWED_STATUSES = new Set(["completed", "running", "failed"]);

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const rawPage = typeof query.page === "string" ? Number.parseInt(query.page, 10) : 1;
  const rawPageSize = typeof query.pageSize === "string" ? Number.parseInt(query.pageSize, 10) : 10;
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const pageSize = Number.isFinite(rawPageSize) && rawPageSize > 0 ? Math.min(rawPageSize, 100) : 10;
  const rawStatus = typeof query.status === "string" ? query.status : undefined;
  const status = rawStatus && ALLOWED_STATUSES.has(rawStatus) ? rawStatus : undefined;
  const ctx = await getPlatformContext();
  const [{ items: runs, total }, employees, allJobs] = await Promise.all([
    ctx.runRepo.listPaged({ page, pageSize, status }),
    ctx.employeeRepo.list(),
    ctx.employeeScheduleJobRepo.listAllEnabled()
  ]);
  return {
    ok: true,
    data: {
      items: buildRunListEntries({
        employees: employees.map((employee) => ({ id: employee.id, name: employee.name })),
        jobs: allJobs.map((job) => ({ id: job.id, name: job.name })),
        runs
      }),
      total,
      page,
      pageSize
    }
  };
});
