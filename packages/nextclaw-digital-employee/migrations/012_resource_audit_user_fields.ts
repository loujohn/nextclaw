import type { Knex } from "knex";

async function addNullableUserRefColumns(knex: Knex, tableName: string): Promise<void> {
  const hasCreatedBy = await knex.schema.hasColumn(tableName, "created_by_user_id");
  const hasUpdatedBy = await knex.schema.hasColumn(tableName, "updated_by_user_id");

  if (!hasCreatedBy || !hasUpdatedBy) {
    await knex.schema.alterTable(tableName, (table) => {
      if (!hasCreatedBy) {
        table.string("created_by_user_id").nullable();
      }
      if (!hasUpdatedBy) {
        table.string("updated_by_user_id").nullable();
      }
    });
  }
}

export async function up(knex: Knex): Promise<void> {
  await addNullableUserRefColumns(knex, "departments");
  await addNullableUserRefColumns(knex, "employees");
  await addNullableUserRefColumns(knex, "employee_schedules");
  await addNullableUserRefColumns(knex, "employee_schedule_jobs");
  await addNullableUserRefColumns(knex, "chat_sessions");
}

export async function down(knex: Knex): Promise<void> {
  const targets = ["departments", "employees", "employee_schedules", "employee_schedule_jobs", "chat_sessions"] as const;

  for (const tableName of targets) {
    const hasCreatedBy = await knex.schema.hasColumn(tableName, "created_by_user_id");
    const hasUpdatedBy = await knex.schema.hasColumn(tableName, "updated_by_user_id");

    if (!hasCreatedBy && !hasUpdatedBy) {
      continue;
    }

    await knex.schema.alterTable(tableName, (table) => {
      if (hasCreatedBy) {
        table.dropColumn("created_by_user_id");
      }
      if (hasUpdatedBy) {
        table.dropColumn("updated_by_user_id");
      }
    });
  }
}