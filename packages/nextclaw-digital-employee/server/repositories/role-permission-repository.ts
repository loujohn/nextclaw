import type { Knex } from "knex";
import { dbNow } from "../db/knex";
import { PLATFORM_TABLES, type RolePermissionRecord } from "../db/schema";
import type { UserRole } from "../../shared/auth-types";
import {
  PLATFORM_PERMISSION_DEFINITIONS,
  SYSTEM_ROLE_DEFINITIONS,
  type PlatformPermissionKey,
  isPermissionEnabledByDefault
} from "../../shared/role-permissions";

function toEnabledValue(value: number | boolean): boolean {
  return value === true || value === 1;
}

function buildPermissionRowId(role: UserRole, permissionKey: PlatformPermissionKey): string {
  return `role-permission:${role}:${permissionKey}`;
}

export class RolePermissionRepository {
  constructor(private readonly db: Knex) {}

  async isPermissionEnabled(role: UserRole, permissionKey: PlatformPermissionKey): Promise<boolean> {
    const row = await this.db<RolePermissionRecord>(PLATFORM_TABLES.rolePermissions)
      .where({ role, permission_key: permissionKey })
      .first();
    if (!row) {
      return isPermissionEnabledByDefault(role, permissionKey);
    }
    return toEnabledValue(row.enabled);
  }

  async listEnabledPermissionsByRole(): Promise<Record<UserRole, Set<PlatformPermissionKey>>> {
    const permissionsByRole = Object.fromEntries(
      SYSTEM_ROLE_DEFINITIONS.map((role) => {
        const enabledPermissions = new Set<PlatformPermissionKey>(
          PLATFORM_PERMISSION_DEFINITIONS
            .filter((permission) => isPermissionEnabledByDefault(role.key, permission.key))
            .map((permission) => permission.key)
        );
        return [role.key, enabledPermissions];
      })
    ) as Record<UserRole, Set<PlatformPermissionKey>>;

    const rows = await this.db<RolePermissionRecord>(PLATFORM_TABLES.rolePermissions)
      .select("role", "permission_key", "enabled");
    for (const row of rows) {
      const role = row.role as UserRole;
      const permissionKey = row.permission_key as PlatformPermissionKey;
      if (!(role in permissionsByRole)) {
        continue;
      }
      if (!PLATFORM_PERMISSION_DEFINITIONS.some((permission) => permission.key === permissionKey)) {
        continue;
      }
      if (toEnabledValue(row.enabled)) {
        permissionsByRole[role].add(permissionKey);
      } else {
        permissionsByRole[role].delete(permissionKey);
      }
    }
    return permissionsByRole;
  }

  async setPermission(params: {
    role: UserRole;
    permissionKey: PlatformPermissionKey;
    enabled: boolean;
    updatedByUserId?: string | null;
  }): Promise<void> {
    const now = dbNow();
    const existing = await this.db<RolePermissionRecord>(PLATFORM_TABLES.rolePermissions)
      .where({ role: params.role, permission_key: params.permissionKey })
      .first();

    if (existing) {
      await this.db<RolePermissionRecord>(PLATFORM_TABLES.rolePermissions)
        .where({ id: existing.id })
        .update({
          enabled: params.enabled ? 1 : 0,
          updated_by_user_id: params.updatedByUserId ?? null,
          updated_at: now
        });
      return;
    }

    await this.db<RolePermissionRecord>(PLATFORM_TABLES.rolePermissions).insert({
      id: buildPermissionRowId(params.role, params.permissionKey),
      role: params.role,
      permission_key: params.permissionKey,
      enabled: params.enabled ? 1 : 0,
      updated_by_user_id: params.updatedByUserId ?? null,
      created_at: now,
      updated_at: now
    });
  }
}