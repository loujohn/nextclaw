import { getQuery } from "h3";
import { getPlatformContext } from "../../runtime/platform-context";

export default defineEventHandler(async (event) => {
  const { departmentId } = getQuery(event);
  const ctx = await getPlatformContext();
  const filter = departmentId ? { departmentId: String(departmentId) } : undefined;
  const list = await ctx.humanEmployeeRepo.list(filter);
  return { ok: true, data: list };
});
