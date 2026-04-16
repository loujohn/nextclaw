import type { Knex } from "knex";
import { createIndexIfNotExists, hasIndex } from "../server/db/knex";

const USERS_TABLE = "users";
const EXTERNAL_USER_INDEX = "idx_users_external_user_id";
const EXTERNAL_USER_ID_COLUMN = "external_user_id";

async function addTextColumnIfMissing(
  knex: Knex,
  columnName: string,
  options: { nullable?: boolean; defaultValue?: string }
): Promise<void> {
  if (await knex.schema.hasColumn(USERS_TABLE, columnName)) {
    return;
  }

  await knex.schema.alterTable(USERS_TABLE, (table) => {
    const column = table.text(columnName);
    if (options.nullable) {
      column.nullable();
      return;
    }
    column.notNullable().defaultTo(options.defaultValue ?? "");
  });
}

async function addStringColumnIfMissing(
  knex: Knex,
  columnName: string,
  options: { nullable?: boolean; defaultValue?: string; length?: number }
): Promise<void> {
  if (await knex.schema.hasColumn(USERS_TABLE, columnName)) {
    return;
  }

  await knex.schema.alterTable(USERS_TABLE, (table) => {
    const column = table.string(columnName, options.length ?? 255);
    if (options.nullable) {
      column.nullable();
      return;
    }
    column.notNullable().defaultTo(options.defaultValue ?? "");
  });
}

async function getColumnType(knex: Knex, columnName: string): Promise<string | null> {
  const rows = await knex.raw(
    `SELECT DATA_TYPE FROM ALL_TAB_COLUMNS WHERE TABLE_NAME = ? AND COLUMN_NAME = ? AND OWNER = (SELECT SYS_CONTEXT('USERENV','CURRENT_SCHEMA'))`,
    [USERS_TABLE.toUpperCase(), columnName.toUpperCase()]
  );
  const result = Array.isArray(rows) ? rows : (rows?.rows ?? []);
  if (!Array.isArray(result) || result.length === 0) {
    return null;
  }
  const dataType = (result[0] as { DATA_TYPE?: string; data_type?: string }).DATA_TYPE
    ?? (result[0] as { DATA_TYPE?: string; data_type?: string }).data_type
    ?? null;
  return typeof dataType === "string" ? dataType.toUpperCase() : null;
}

async function normalizeExternalUserIdColumn(knex: Knex): Promise<void> {
  await addStringColumnIfMissing(knex, EXTERNAL_USER_ID_COLUMN, { nullable: true, length: 255 });

  const columnType = await getColumnType(knex, EXTERNAL_USER_ID_COLUMN);
  if (columnType === "CLOB") {
    await knex.raw(
      `ALTER TABLE "${USERS_TABLE}" MODIFY ("${EXTERNAL_USER_ID_COLUMN}" VARCHAR(255))`
    );
  }

  await knex(USERS_TABLE)
    .where(EXTERNAL_USER_ID_COLUMN, "")
    .update({ [EXTERNAL_USER_ID_COLUMN]: null });
}

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(USERS_TABLE))) {
    return;
  }

  await addTextColumnIfMissing(knex, "user_source", { defaultValue: "manual" });
  await addTextColumnIfMissing(knex, "sync_provider", { nullable: true });
  await normalizeExternalUserIdColumn(knex);
  await addTextColumnIfMissing(knex, "external_user_name", { defaultValue: "" });
  await addTextColumnIfMissing(knex, "external_name", { defaultValue: "" });
  await addTextColumnIfMissing(knex, "external_post_name", { defaultValue: "" });
  await addTextColumnIfMissing(knex, "external_role_name", { defaultValue: "" });
  await addTextColumnIfMissing(knex, "external_dingtalk_id", { defaultValue: "" });
  await addTextColumnIfMissing(knex, "external_phone", { defaultValue: "" });
  await addTextColumnIfMissing(knex, "external_user_type", { defaultValue: "" });

  if (!(await knex.schema.hasColumn(USERS_TABLE, "last_synced_at"))) {
    await knex.schema.alterTable(USERS_TABLE, (table) => {
      table.timestamp("last_synced_at").nullable();
    });
  }

  if (!(await hasIndex(knex, EXTERNAL_USER_INDEX))) {
    await createIndexIfNotExists(
      knex,
      EXTERNAL_USER_INDEX,
      `CREATE UNIQUE INDEX "${EXTERNAL_USER_INDEX}" ON "${USERS_TABLE}" ("${EXTERNAL_USER_ID_COLUMN}")`
    );
  }
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(USERS_TABLE))) {
    return;
  }

  if (await hasIndex(knex, EXTERNAL_USER_INDEX)) {
    await knex.raw(`DROP INDEX "${EXTERNAL_USER_INDEX}"`);
  }

  await knex.schema.alterTable(USERS_TABLE, (table) => {
    table.dropColumn("last_synced_at");
    table.dropColumn("external_user_type");
    table.dropColumn("external_phone");
    table.dropColumn("external_dingtalk_id");
    table.dropColumn("external_role_name");
    table.dropColumn("external_post_name");
    table.dropColumn("external_name");
    table.dropColumn("external_user_name");
    table.dropColumn("external_user_id");
    table.dropColumn("sync_provider");
    table.dropColumn("user_source");
  });
}