import type { UserRole } from "../../shared/auth-types";
import {
  PLATFORM_PERMISSION_DEFINITIONS,
  SYSTEM_ROLE_DEFINITIONS,
  type PlatformPermissionKey,
  type RolePermissionGroup,
  type RolePermissionSettingsPayload
} from "../../shared/role-permissions";
import type { RolePermissionRepository } from "../repositories/role-permission-repository";
import type { UserRepository } from "../repositories/user-repository";

export async function buildRolePermissionSettingsPayload(
  rolePermissionRepo: RolePermissionRepository,
  userRepo: UserRepository
): Promise<RolePermissionSettingsPayload> {
  const [enabledPermissionsByRole, memberCounts] = await Promise.all([
    rolePermissionRepo.listEnabledPermissionsByRole(),
    userRepo.countByRole()
  ]);

  const permissionGroups = PLATFORM_PERMISSION_DEFINITIONS.reduce<RolePermissionGroup[]>((groups, permission) => {
    const existing = groups.find((group) => group.group === permission.group);
    const item = {
      key: permission.key,
      label: permission.label,
      description: permission.description,
      enabled: false
    };
    if (existing) {
      existing.items.push(item);
      return groups;
    }
    groups.push({
      group: permission.group,
      description: permission.group,
      items: [item]
    });
    return groups;
  }, []);

  return {
    roles: SYSTEM_ROLE_DEFINITIONS.map((role) => ({
      id: role.key,
      name: role.label,
      description: role.description,
      permissions: [...enabledPermissionsByRole[role.key]],
      memberCount: memberCounts[role.key] ?? 0,
      isSystem: true
    })),
    permissionGroups
  };
}

export function isKnownPlatformPermission(permissionKey: string): permissionKey is PlatformPermissionKey {
  return PLATFORM_PERMISSION_DEFINITIONS.some((permission) => permission.key === permissionKey);
}

export function isKnownUserRole(role: string): role is UserRole {
  return SYSTEM_ROLE_DEFINITIONS.some((item) => item.key === role);
}