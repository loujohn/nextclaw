import { defineEventHandler } from "h3";
import { getPlatformContext } from "../../runtime/platform-context";
import { requireRole } from "../../utils/auth-guards";

export default defineEventHandler(async (event) => {
  requireRole(event, "admin");
  const ctx = await getPlatformContext();
  const users = await ctx.userRepo.listAll();
  return { ok: true, data: users };
});
