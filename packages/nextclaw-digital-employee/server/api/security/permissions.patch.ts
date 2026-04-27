import { createError, defineEventHandler, readBody } from "h3";
import type { UserRole } from "../../../shared/auth-types";
import type { PlatformPermissionKey } from "../../../shared/role-permissions";
import { getPlatformContext } from "../../runtime/platform-context";
import { requireRole } from "../../utils/auth-guards";
import {
  buildRolePermissionSettingsPayload,
  isKnownPlatformPermission,
  isKnownUserRole
} from "../../utils/role-permission-payload";

type UpdateRolePermissionBody = {
  role?: UserRole;
  permissionKey?: PlatformPermissionKey;
  enabled?: boolean;
};

export default defineEventHandler(async (event) => {
  const user = requireRole(event, "admin");
  const body = await readBody<UpdateRolePermissionBody>(event);
  if (!body?.role || !isKnownUserRole(body.role)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid role" });
  }
  if (!body.permissionKey || !isKnownPlatformPermission(body.permissionKey)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid permissionKey" });
  }
  if (typeof body.enabled !== "boolean") {
    throw createError({ statusCode: 400, statusMessage: "enabled must be boolean" });
  }

  const ctx = await getPlatformContext();
  await ctx.rolePermissionRepo.setPermission({
    role: body.role,
    permissionKey: body.permissionKey,
    enabled: body.enabled,
    updatedByUserId: user.id
  });

  return {
    ok: true,
    data: await buildRolePermissionSettingsPayload(ctx.rolePermissionRepo, ctx.userRepo)
  };
});