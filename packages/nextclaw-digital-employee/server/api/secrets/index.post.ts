import { createError, readBody } from "h3";
import { getPlatformContext } from "../../runtime/platform-context";

type CreateBody = { key: string; value: string; scope?: string; description?: string };

export default defineEventHandler(async (event) => {
  const body = await readBody<CreateBody>(event);
  if (!body?.key?.trim() || !body?.value) {
    throw createError({ statusCode: 400, statusMessage: "key and value are required" });
  }
  const ctx = await getPlatformContext();
  const secret = await ctx.secretsRepo.create({
    key: body.key.trim(),
    value: body.value,
    scope: body.scope,
    description: body.description
  });
  return { ok: true, data: secret };
});
