import { getPlatformContext } from "../../runtime/platform-context";
import { getOrgSyncConfig } from "../../services/org-sync-service";

export default defineEventHandler(async () => {
  const ctx = await getPlatformContext();
  const config = await getOrgSyncConfig(ctx.db);
  return { ok: true, data: config };
});
