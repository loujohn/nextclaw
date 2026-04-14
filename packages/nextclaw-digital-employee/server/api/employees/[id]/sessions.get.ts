import { getQuery, getRouterParam } from "h3";
import { getPlatformContext } from "../../../runtime/platform-context";

export default defineEventHandler(async (event) => {
  const employeeId = getRouterParam(event, "id") ?? "";
  const query = getQuery(event);
  const rawLimit = typeof query.limit === "string" ? Number.parseInt(query.limit, 10) : 30;
  const before = typeof query.before === "string" ? query.before : null;
  const ctx = await getPlatformContext();
  const sessions = await ctx.employeeRunService.listChatSessions({
    employeeId,
    limit: Number.isFinite(rawLimit) ? rawLimit : 30,
    before
  });
  return {
    ok: true,
    data: {
      items: sessions.items,
      nextCursor: sessions.nextCursor
    }
  };
});
