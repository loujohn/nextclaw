import { getQuery, getRouterParam } from "h3";
import { getPlatformContext } from "../../../runtime/platform-context";
import { buildRunListEntries } from "../../../../shared/ui-models";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const employeeId = getRouterParam(event, "id") ?? "";
  const rawPage = typeof query.page === "string" ? Number.parseInt(query.page, 10) : 1;
  const rawPageSize = typeof query.pageSize === "string" ? Number.parseInt(query.pageSize, 10) : 10;
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const pageSize = Number.isFinite(rawPageSize) && rawPageSize > 0 ? Math.min(rawPageSize, 100) : 10;
  const ctx = await getPlatformContext();
  const [employee, pagedRuns] = await Promise.all([
    ctx.employeeRepo.getById(employeeId),
    ctx.runRepo.listPagedByEmployeeId({ employeeId, page, pageSize })
  ]);
  return {
    ok: true,
    data: {
      items: buildRunListEntries({
        employees: employee ? [{ id: employee.id, name: employee.name }] : [],
        runs: pagedRuns.items
      }),
      total: pagedRuns.total,
      page,
      pageSize
    }
  };
});
