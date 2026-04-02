import { getRouterParam, getQuery } from "h3";
import { getPlatformContext } from "../../../../runtime/platform-context";
import { pickLatestChatResultSnapshot } from "../../../../../shared/ui-models";

export default defineEventHandler(async (event) => {
  const employeeId = getRouterParam(event, "id") ?? "";
  const query = getQuery(event);
  const skip = Math.max(0, Number(query.skip) || 0);
  const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));
  const ctx = await getPlatformContext();
  const latestChatResult = pickLatestChatResultSnapshot(await ctx.runRepo.listByEmployeeId(employeeId));
  const { messages, total } = ctx.gateway.getSessionHistory(`employee:${employeeId}:ui:direct:web`, { skip, limit });
  return {
    ok: true,
    data: {
      messages,
      total,
      hasMore: skip + messages.length < total,
      lastRunId: latestChatResult?.runId ?? "",
      resultCards: latestChatResult?.resultCards ?? []
    }
  };
});
