import { defineEventHandler, createError } from "h3";
import { getPlatformContext } from "../../runtime/platform-context";
import { requireRole } from "../../utils/auth-guards";

export default defineEventHandler(async (event) => {
  requireRole(event, "admin");
  const id = event.context.params?.id;
  if (!id) throw createError({ statusCode: 400, statusMessage: "Missing user id" });

  const userCtx = event.context.user as { id: string } | undefined;
  if (userCtx && id === userCtx.id) {
    throw createError({ statusCode: 400, statusMessage: "Cannot delete yourself" });
  }

  const ctx = await getPlatformContext();
  const deleted = await ctx.userRepo.deleteUser(id);
  if (!deleted) {
    throw createError({ statusCode: 404, statusMessage: "User not found" });
  }

  return { ok: true };
});
