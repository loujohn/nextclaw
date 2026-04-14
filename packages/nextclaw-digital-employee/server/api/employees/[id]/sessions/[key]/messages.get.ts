import { createError, getQuery, getRouterParam } from "h3";
import { getPlatformContext } from "../../../../../runtime/platform-context";

export default defineEventHandler(async (event) => {
  const employeeId = getRouterParam(event, "id") ?? "";
  const sessionKey = getRouterParam(event, "key") ?? "";
  if (!sessionKey) {
    throw createError({
      statusCode: 400,
      statusMessage: "session key is required"
    });
  }
  const query = getQuery(event);
  const rawLimit = typeof query.limit === "string" ? Number.parseInt(query.limit, 10) : 50;
  const before = typeof query.before === "string" ? query.before : null;
  const ctx = await getPlatformContext();
  const result = await ctx.employeeRunService.getChatMessages({
    employeeId,
    sessionKey,
    limit: Number.isFinite(rawLimit) ? rawLimit : 50,
    before
  });
  return {
    ok: true,
    data: {
      sessionKey: result.session.sessionKey,
      items: result.items,
      nextCursor: result.nextCursor
    }
  };
});
