import { getRouterParam } from "h3";
import { getPlatformContext } from "../../../runtime/platform-context";

export default defineEventHandler(async (event) => {
  const employeeId = getRouterParam(event, "id") ?? "";
  const ctx = await getPlatformContext();
  const jobs = await ctx.automationService.listJobsForEmployee(employeeId);
  return { ok: true, data: jobs };
});
