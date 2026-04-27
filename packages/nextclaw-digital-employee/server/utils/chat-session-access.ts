import type { UserContext } from "../../shared/auth-types";
import { CHAT_SESSION_VIEW_ALL_PERMISSION } from "../../shared/role-permissions";
import type { ChatSessionAccessScope } from "../repositories/chat-session-repository";
import type { RolePermissionRepository } from "../repositories/role-permission-repository";

export async function resolveChatSessionAccessScope(
  user: UserContext,
  rolePermissionRepo: RolePermissionRepository
): Promise<ChatSessionAccessScope> {
  const canViewAllSessions = await rolePermissionRepo.isPermissionEnabled(user.role, CHAT_SESSION_VIEW_ALL_PERMISSION);
  return canViewAllSessions ? "all" : "own";
}