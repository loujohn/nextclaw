import { defineEventHandler, getQuery } from "h3";
import { getPlatformContext } from "../../runtime/platform-context";
import { requireRole } from "../../utils/auth-guards";

export default defineEventHandler(async (event) => {
  requireRole(event, "admin");
  const query = getQuery(event);
  const rawPage = typeof query.page === "string" ? Number.parseInt(query.page, 10) : 1;
  const search = typeof query.search === "string" ? query.search : undefined;
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const pageSize = 10;
  const ctx = await getPlatformContext();
  const result = await ctx.userRepo.listPage({ page, pageSize, search });
  return { ok: true, ...result };
});
