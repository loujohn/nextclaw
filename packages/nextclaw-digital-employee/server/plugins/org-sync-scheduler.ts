import cron from "node-cron";
import { getPlatformContext } from "../runtime/platform-context";
import { getOrgSyncConfig, runOrgSync } from "../services/org-sync-service";

/**
 * 服务启动时读取 org_sync_config 中的 cronExpr + enabled，
 * 动态注册钉钉组织同步定时任务。配置变更后需重启服务生效。
 */
export default defineNitroPlugin(async () => {
  const ctx = await getPlatformContext();
  const config = await getOrgSyncConfig(ctx.db);

  if (!config.enabled) {
    console.log("[org-sync-scheduler] 定时同步已禁用，跳过注册");
    return;
  }

  if (!cron.validate(config.cronExpr)) {
    console.warn(`[org-sync-scheduler] cronExpr 无效: "${config.cronExpr}"，跳过注册`);
    return;
  }

  // 构建内部同步 API URL（Nitro 内部端口）
  const port = process.env.PORT ?? "3031";
  const syncApiUrl = `http://127.0.0.1:${port}/api/org/sync`;

  const task = cron.schedule(config.cronExpr, async () => {
    console.log("[org-sync-scheduler] 开始执行定时组织同步…");
    const result = await runOrgSync(ctx.db, syncApiUrl);
    if (result.ok) {
      console.log("[org-sync-scheduler] 同步成功:", result.summary);
    } else {
      console.error("[org-sync-scheduler] 同步失败:", result.summary);
    }
  });

  console.log(`[org-sync-scheduler] 已注册定时任务，cron: "${config.cronExpr}"`);

  // 服务关闭时停止任务
  process.once("SIGTERM", () => task.stop());
  process.once("SIGINT", () => task.stop());
});
