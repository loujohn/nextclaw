import { getRouterParam } from "h3";
import { getPlatformContext } from "../../runtime/platform-context";

export default defineEventHandler(async (event) => {
  const key = getRouterParam(event, "key") ?? "";
  const ctx = await getPlatformContext();
  await ctx.secretsRepo.delete(key);
  return { ok: true };
});
