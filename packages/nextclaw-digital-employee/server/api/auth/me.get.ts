import { defineEventHandler, createError } from "h3";
import { requireAuth } from "../../utils/auth-guards";
import { getPlatformContext } from "../../runtime/platform-context";

export default defineEventHandler(async (event) => {
  const userCtx = requireAuth(event);
  const ctx = await getPlatformContext();
  const user = await ctx.userRepo.findById(userCtx.id);

  if (!user) {
    throw createError({ statusCode: 404, statusMessage: "User not found" });
  }

  return { ok: true, data: user };
});
