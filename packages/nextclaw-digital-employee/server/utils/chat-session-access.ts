import type { UserContext } from "../../shared/auth-types";
import {
  CHAT_SESSION_VIEW_ALL_PERMISSION,
  type PlatformPermissionKey
} from "../../shared/role-permissions";
import type { ChatSessionAccessScope } from "../repositories/chat-session-repository";
import type { RolePermissionRepository } from "../repositories/role-permission-repository";

export type OwnershipAccessScope = "all" | "own";

export async function resolveRolePermissionAccessScope(
  user: UserContext,
  rolePermissionRepo: RolePermissionRepository,
  permissionKey: PlatformPermissionKey
): Promise<OwnershipAccessScope> {
  const canViewAll = await rolePermissionRepo.isPermissionEnabled(user.role, permissionKey);
  return canViewAll ? "all" : "own";
}

export async function resolveChatSessionAccessScope(
  user: UserContext,
  rolePermissionRepo: RolePermissionRepository
): Promise<ChatSessionAccessScope> {
  return resolveRolePermissionAccessScope(user, rolePermissionRepo, CHAT_SESSION_VIEW_ALL_PERMISSION);
}