import { defineEventHandler, readBody, createError } from "h3";
import { hashSync } from "bcryptjs";
import { getPlatformContext } from "../../../runtime/platform-context";
import { requireRole } from "../../../utils/auth-guards";

export default defineEventHandler(async (event) => {
  requireRole(event, "admin");
  const id = event.context.params?.id;
  if (!id) throw createError({ statusCode: 400, statusMessage: "Missing user id" });

  const body = await readBody<{ password?: string }>(event);
  if (!body?.password || body.password.length < 6) {
    throw createError({ statusCode: 400, statusMessage: "Password must be at least 6 characters" });
  }

  const ctx = await getPlatformContext();
  const user = await ctx.userRepo.findById(id);
  if (!user) {
    throw createError({ statusCode: 404, statusMessage: "User not found" });
  }
  if (user.authProvider !== "local") {
    throw createError({ statusCode: 400, statusMessage: "Cannot reset password for SSO users" });
  }

  const hash = hashSync(body.password, 10);
  await ctx.userRepo.updatePasswordHash(id, hash);

  return { ok: true };
});