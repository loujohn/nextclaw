import { getRouterParam } from "h3";
import { getPlatformContext } from "../../../runtime/platform-context";

export default defineEventHandler(async (event) => {
  const employeeId = getRouterParam(event, "id") ?? "";
  const ctx = await getPlatformContext();
  const session = await ctx.employeeRunService.createChatSession(employeeId);
  return {
    ok: true,
    data: {
      sessionKey: session.sessionKey,
      title: session.title,
      createdAt: session.createdAt
    }
  };
});
