import { createError, getRouterParam, readBody } from "h3";
import { getPlatformContext } from "../../../runtime/platform-context";

type UpdateSkillStateBody = {
  enabled?: boolean;
};

export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, "name") ?? "";
  const body = await readBody<UpdateSkillStateBody>(event);
  if (typeof body?.enabled !== "boolean") {
    throw createError({
      statusCode: 400,
      statusMessage: "enabled is required"
    });
  }
  const ctx = await getPlatformContext();
  const updated = await ctx.skillInstallationRepo.setEnabled(name, body.enabled);
  if (!updated) {
    throw createError({
      statusCode: 404,
      statusMessage: `skill installation not found: ${name}`
    });
  }
  return { ok: true, data: updated };
});
