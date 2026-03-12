import { createError, readBody } from "h3";
import { getPlatformContext } from "../../runtime/platform-context";

type ImportSkillBody = {
  sourceType?: "local" | "git";
  source?: string;
};

export default defineEventHandler(async (event) => {
  const body = await readBody<ImportSkillBody>(event);
  const source = body?.source?.trim() ?? "";
  const sourceType = body?.sourceType;
  if (!source || !sourceType) {
    throw createError({
      statusCode: 400,
      statusMessage: "sourceType and source are required"
    });
  }
  const ctx = await getPlatformContext();
  const installation =
    sourceType === "git"
      ? await ctx.skillInstallService.importFromGit(source)
      : await ctx.skillInstallService.importFromLocalPath(source);
  return { ok: true, data: installation };
});
