import { readBody } from "h3";
import { getPlatformContext } from "../../runtime/platform-context";
import { updateOrgSyncConfig, type OrgSyncConfigUpdate } from "../../services/org-sync-service";

export default defineEventHandler(async (event) => {
  const body = await readBody<OrgSyncConfigUpdate>(event);
  const ctx = await getPlatformContext();
  const config = await updateOrgSyncConfig(ctx.db, body ?? {});
  return { ok: true, data: config };
});
