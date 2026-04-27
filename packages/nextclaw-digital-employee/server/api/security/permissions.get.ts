import { defineEventHandler } from "h3";
import { getPlatformContext } from "../../runtime/platform-context";
import { requireRole } from "../../utils/auth-guards";
import { buildRolePermissionSettingsPayload } from "../../utils/role-permission-payload";

export default defineEventHandler(async (event) => {
  requireRole(event, "admin");
  const ctx = await getPlatformContext();
  return {
    ok: true,
    data: await buildRolePermissionSettingsPayload(ctx.rolePermissionRepo, ctx.userRepo)
  };
});