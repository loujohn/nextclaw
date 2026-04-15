import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn("employees", "webhook_enabled"))) {
    await knex.schema.alterTable("employees", (table) => {
      table.integer("webhook_enabled").notNullable().defaultTo(0);
    });
  }
  if (!(await knex.schema.hasColumn("employees", "webhook_secret"))) {
    await knex.schema.alterTable("employees", (table) => {
      table.string("webhook_secret", 500).nullable().defaultTo(null);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn("employees", "webhook_secret")) {
    await knex.schema.alterTable("employees", (table) => {
      table.dropColumn("webhook_secret");
    });
  }
  if (await knex.schema.hasColumn("employees", "webhook_enabled")) {
    await knex.schema.alterTable("employees", (table) => {
      table.dropColumn("webhook_enabled");
    });
  }
}
