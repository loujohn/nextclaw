import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("users"))) return;

  if (!(await knex.schema.hasColumn("users", "auth_provider"))) {
    await knex.schema.alterTable("users", (t) => {
      t.string("auth_provider").notNullable().defaultTo("keycloak");
    });
  }

  if (!(await knex.schema.hasColumn("users", "password_hash"))) {
    await knex.schema.alterTable("users", (t) => {
      t.text("password_hash").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("users"))) return;
  await knex.schema.alterTable("users", (t) => {
    t.dropColumn("password_hash");
    t.dropColumn("auth_provider");
  });
}
