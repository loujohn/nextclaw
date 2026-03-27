import { createError, getRequestURL } from "h3";
import { getPlatformContext } from "../../runtime/platform-context";
import { getOrgSyncConfig, runOrgSync } from "../../services/org-sync-service";

export default defineEventHandler(async (event) => {
  const ctx = await getPlatformContext();
  const config = await getOrgSyncConfig(ctx.db);

  if (!config.appKey || !config.appSecretSet) {
    throw createError({
      statusCode: 400,
      statusMessage: "未检测到钉钉 AppKey / AppSecret，请配置环境变量 DINGTALK_APP_KEY 和 DINGTALK_APP_SECRET，或在【系统设置 → 钉钉同步配置】中手动填写"
    });
  }

  // 构建内部 sync API URL（同主机）
  const reqUrl = getRequestURL(event);
  const syncApiUrl = `${reqUrl.protocol}//${reqUrl.host}/api/org/sync`;

  const result = await runOrgSync(ctx.db, syncApiUrl);

  if (!result.ok) {
    throw createError({ statusCode: 500, statusMessage: result.summary });
  }

  return { ok: true, data: result };
});
