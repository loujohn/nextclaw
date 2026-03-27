import { getPlatformContext } from "../../runtime/platform-context";

export default defineEventHandler(async () => {
  const ctx = await getPlatformContext();
  const secrets = await ctx.secretsRepo.list();
  return { ok: true, data: secrets };
});
