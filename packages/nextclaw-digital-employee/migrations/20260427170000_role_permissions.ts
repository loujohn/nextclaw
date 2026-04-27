import type { Knex } from "knex";
import {
  CHAT_SESSION_VIEW_ALL_PERMISSION,
  SYSTEM_ROLE_DEFINITIONS,
  isPermissionEnabledByDefault
} from "../shared/role-permissions";
import { dbNow } from "../server/db/knex";

function buildPermissionRowId(role: string, permissionKey: string): string {
  return `role-permission:${role}:${permissionKey}`;
}

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("role_permissions"))) {
    await knex.schema.createTable("role_permissions", (table) => {
      table.string("id").primary();
      table.string("role").notNullable();
      table.string("permission_key").notNullable();
      table.integer("enabled").notNullable().defaultTo(0);
      table.string("updated_by_user_id").nullable();
      table.timestamp("created_at").notNullable();
      table.timestamp("updated_at").notNullable();
      table.unique(["role", "permission_key"]);
    });
  }

  const now = dbNow();
  for (const role of SYSTEM_ROLE_DEFINITIONS) {
    const existing = await knex("role_permissions")
      .where({ role: role.key, permission_key: CHAT_SESSION_VIEW_ALL_PERMISSION })
      .first();
    if (existing) {
      continue;
    }
    await knex("role_permissions").insert({
      id: buildPermissionRowId(role.key, CHAT_SESSION_VIEW_ALL_PERMISSION),
      role: role.key,
      permission_key: CHAT_SESSION_VIEW_ALL_PERMISSION,
      enabled: isPermissionEnabledByDefault(role.key, CHAT_SESSION_VIEW_ALL_PERMISSION) ? 1 : 0,
      updated_by_user_id: null,
      created_at: now,
      updated_at: now
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable("role_permissions")) {
    await knex.schema.dropTable("role_permissions");
  }
}