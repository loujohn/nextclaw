import { createError, defineEventHandler } from "h3";
import { getPlatformContext } from "../../runtime/platform-context";
import { hasPersonnelSyncConfig, runUserPersonnelSync } from "../../services/user-sync-service";
import { requireRole } from "../../utils/auth-guards";

export default defineEventHandler(async (event) => {
  requireRole(event, "admin");

  if (!hasPersonnelSyncConfig()) {
    throw createError({
      statusCode: 400,
      statusMessage:
        "未配置人员同步认证，请至少提供 PERSONNEL_SYNC_API_URL，且配置 PERSONNEL_SYNC_API_TOKEN 或 PERSONNEL_SYNC_TOKEN_URL / PERSONNEL_SYNC_TOKEN_BASIC_AUTH / PERSONNEL_SYNC_USERNAME / PERSONNEL_SYNC_PASSWORD",
    });
  }

  const ctx = await getPlatformContext();

  try {
    return await runUserPersonnelSync(ctx.db);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw createError({ statusCode: 500, statusMessage: message });
  }
});