import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn("employee_skills", "version");
  if (!hasColumn) {
    await knex.schema.alterTable("employee_skills", (t) => {
      t.string("version").nullable().defaultTo(null);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn("employee_skills", "version");
  if (hasColumn) {
    await knex.schema.alterTable("employee_skills", (t) => {
      t.dropColumn("version");
    });
  }
}
