import { getRouterParam, readBody } from "h3";
import { getPlatformContext } from "../../runtime/platform-context";

type UpdateBody = { value?: string; description?: string };

export default defineEventHandler(async (event) => {
  const key = getRouterParam(event, "key") ?? "";
  const body = await readBody<UpdateBody>(event);
  const ctx = await getPlatformContext();
  const secret = await ctx.secretsRepo.update(key, { value: body?.value, description: body?.description });
  return { ok: true, data: secret };
});
