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
  let updated = await ctx.skillInstallationRepo.setEnabled(name, body.enabled);
  if (!updated) {
    try {
      updated = await ctx.skillInstallationRepo.upsert({
        skillName: name,
        sourceType: "discovered",
        sourceUri: "local",
        installPath: "skills/" + name,
        enabled: body.enabled
      });
    } catch (err) {
      throw createError({
        statusCode: 500,
        statusMessage: `Failed to update skill state: ${err instanceof Error ? err.message : String(err)}`
      });
    }
  }
  return { ok: true, data: updated };
});
