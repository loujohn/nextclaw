import { getQuery } from "h3";
import { getPlatformContext } from "../../runtime/platform-context";
import { buildRunListEntries } from "../../../shared/ui-models";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const rawLimit = typeof query.limit === "string" ? Number.parseInt(query.limit, 10) : 50;
  const limit = Number.isFinite(rawLimit) ? rawLimit : 50;
  const ctx = await getPlatformContext();
  const [runs, employees] = await Promise.all([ctx.runRepo.list(limit), ctx.employeeRepo.list()]);
  return {
    ok: true,
    data: {
      items: buildRunListEntries({
        employees: employees.map((employee) => ({ id: employee.id, name: employee.name })),
        runs
      }),
      raw: runs
    }
  };
});
