import { createError, defineEventHandler } from "h3";
import { getPlatformContext } from "../../runtime/platform-context";
import { hasPersonnelSyncConfig, runUserPersonnelSync } from "../../services/user-sync-service";
import { requireRole } from "../../utils/auth-guards";

function toSyncErrorMessage(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String(error);

  if (rawMessage.includes("idx_users_keycloak_sub")) {
    return "用户同步失败：同步用户登录标识发生冲突。系统已改为为同步用户生成独立登录标识，请重新执行同步；若仍失败，请检查历史同步数据。";
  }

  if (rawMessage.includes("idx_users_external_user_id")) {
    return "用户同步失败：外部接口返回了重复的 userId，请先检查外部人员数据是否存在重复记录。";
  }

  if (rawMessage.includes("PERSONNEL_SYNC_TOKEN") || rawMessage.includes("access_token") || rawMessage.includes("token")) {
    return `用户同步失败：人员同步认证异常。${rawMessage}`;
  }

  if (rawMessage.includes("HTTP 401") || rawMessage.includes("HTTP 403")) {
    return "用户同步失败：外部人员接口认证失败，请检查同步账号、密码和 Basic 认证配置。";
  }

  if (rawMessage.includes("HTTP 404")) {
    return "用户同步失败：未找到外部人员同步接口或 token 接口，请检查环境变量中的接口地址。";
  }

  return `用户同步失败：${rawMessage}`;
}

export default defineEventHandler(async (event) => {
  requireRole(event, "admin");

  if (!hasPersonnelSyncConfig()) {
    throw createError({
      statusCode: 400,
      statusMessage: "Bad Request",
      message:
        "未配置人员同步认证，请至少提供 PERSONNEL_SYNC_API_URL，且配置 PERSONNEL_SYNC_API_TOKEN 或 PERSONNEL_SYNC_TOKEN_URL / PERSONNEL_SYNC_TOKEN_BASIC_AUTH / PERSONNEL_SYNC_USERNAME / PERSONNEL_SYNC_PASSWORD。",
    });
  }

  const ctx = await getPlatformContext();

  try {
    return await runUserPersonnelSync(ctx.db);
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: "User sync failed",
      message: toSyncErrorMessage(error),
    });
  }
});