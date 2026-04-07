import { getQuery } from "h3";
import { getPlatformContext } from "../../runtime/platform-context";
import { buildRunListEntriesFromJoin } from "../../../shared/ui-models";

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
  const { items, total } = await ctx.runRepo.listPagedWithNames({ page, pageSize, status });
  return {
    ok: true,
    data: {
      items: buildRunListEntriesFromJoin(items),
      total,
      page,
      pageSize
    }
  };
});
