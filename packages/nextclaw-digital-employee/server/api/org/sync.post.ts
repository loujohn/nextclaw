import { createError, readBody } from "h3";
import { getPlatformContext } from "../../runtime/platform-context";
import { performOrgSync, type OrgSyncBody } from "../../services/org-sync-service";
import { invalidateHumanEmployeeCache } from "./human-employees.get";

export default defineEventHandler(async (event) => {
  const body = await readBody<OrgSyncBody>(event);

  if (!body || typeof body !== "object") {
    throw createError({ statusCode: 400, statusMessage: "request body is required" });
  }

  const ctx = await getPlatformContext();
  const result = await performOrgSync(ctx.db, body);
  invalidateHumanEmployeeCache();

  return { ok: true, data: result };
});
