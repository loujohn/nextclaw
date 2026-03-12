import { getRouterParam } from "h3";
import { getPlatformContext } from "../../../runtime/platform-context";

export default defineEventHandler(async (event) => {
  const employeeId = getRouterParam(event, "id") ?? "";
  const ctx = await getPlatformContext();
  return {
    ok: true,
    data: await ctx.runRepo.listByEmployeeId(employeeId)
  };
});
