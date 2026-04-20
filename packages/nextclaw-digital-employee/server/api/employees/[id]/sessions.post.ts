import { getRouterParam } from "h3";
import { getPlatformContext } from "../../../runtime/platform-context";
import { requireAuth } from "../../../utils/auth-guards";

export default defineEventHandler(async (event) => {
  const user = requireAuth(event);
  const employeeId = getRouterParam(event, "id") ?? "";
  const ctx = await getPlatformContext();
  const session = await ctx.employeeRunService.createChatSession(employeeId, user.id);
  return {
    ok: true,
    data: {
      sessionKey: session.sessionKey,
      title: session.title,
      createdAt: session.createdAt
    }
  };
});
