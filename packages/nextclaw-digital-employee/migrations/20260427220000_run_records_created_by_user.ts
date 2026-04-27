import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn("run_records", "created_by_user_id");
  if (hasColumn) {
    return;
  }

  await knex.schema.alterTable("run_records", (table) => {
    table.string("created_by_user_id").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn("run_records", "created_by_user_id");
  if (!hasColumn) {
    return;
  }

  await knex.schema.alterTable("run_records", (table) => {
    table.dropColumn("created_by_user_id");
  });
}