import { defineEventHandler, readBody, createError } from "h3";
import { getPlatformContext } from "../../runtime/platform-context";
import { requireRole } from "../../utils/auth-guards";
import type { UpdateUserInput } from "../../../shared/auth-types";

export default defineEventHandler(async (event) => {
  requireRole(event, "admin");
  const id = event.context.params?.id;
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Missing user id" });
  }

  const body = await readBody<UpdateUserInput>(event);
  const ctx = await getPlatformContext();
  const updated = await ctx.userRepo.updateUser(id, body);

  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: "User not found" });
  }

  return { ok: true, data: updated };
});
