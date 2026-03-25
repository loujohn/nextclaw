import { getRouterParam } from "h3";
import { getPlatformContext } from "../../../../runtime/platform-context";
import { pickLatestChatResultSnapshot } from "../../../../../shared/ui-models";

export default defineEventHandler(async (event) => {
  const employeeId = getRouterParam(event, "id") ?? "";
  const ctx = await getPlatformContext();
  const latestChatResult = pickLatestChatResultSnapshot(await ctx.runRepo.listByEmployeeId(employeeId));
  return {
    ok: true,
    data: {
      messages: ctx.gateway.getSessionHistory(`employee:${employeeId}:ui:direct:web`),
      lastRunId: latestChatResult?.runId ?? "",
      resultCards: latestChatResult?.resultCards ?? []
    }
  };
});
