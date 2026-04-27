import { createError, getQuery, getRouterParam } from "h3";
import { getPlatformContext } from "../../../../runtime/platform-context";
import { requireAuth } from "../../../../utils/auth-guards";
import { resolveChatSessionAccessScope } from "../../../../utils/chat-session-access";

export default defineEventHandler(async (event) => {
  const user = requireAuth(event);
  const employeeId = getRouterParam(event, "id") ?? "";
  const query = getQuery(event);
  const sessionKey = typeof query.sessionKey === "string" ? query.sessionKey.trim() : "";
  if (!sessionKey) {
    throw createError({
      statusCode: 400,
      statusMessage: "sessionKey is required"
    });
  }
  const ctx = await getPlatformContext();
  const accessScope = await resolveChatSessionAccessScope(user, ctx.rolePermissionRepo);
  const result = await ctx.employeeRunService.getChatMessages({
    employeeId,
    sessionKey,
    limit: 50,
    actorUserId: user.id,
    accessScope
  });
  return {
    ok: true,
    data: {
      sessionKey: result.session.sessionKey,
      messages: result.items,
      nextCursor: result.nextCursor
    }
  };
});
