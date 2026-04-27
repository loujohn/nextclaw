import { getQuery, getRouterParam } from "h3";
import { getPlatformContext } from "../../../runtime/platform-context";
import { requireAuth } from "../../../utils/auth-guards";
import { resolveChatSessionAccessScope } from "../../../utils/chat-session-access";

export default defineEventHandler(async (event) => {
  const user = requireAuth(event);
  const employeeId = getRouterParam(event, "id") ?? "";
  const query = getQuery(event);
  const rawLimit = typeof query.limit === "string" ? Number.parseInt(query.limit, 10) : 30;
  const before = typeof query.before === "string" ? query.before : null;
  const ctx = await getPlatformContext();
  const accessScope = await resolveChatSessionAccessScope(user, ctx.rolePermissionRepo);
  const sessions = await ctx.employeeRunService.listChatSessions({
    employeeId,
    limit: Number.isFinite(rawLimit) ? rawLimit : 30,
    before,
    actorUserId: user.id,
    accessScope
  });
  return {
    ok: true,
    data: {
      items: sessions.items,
      nextCursor: sessions.nextCursor
    }
  };
});
