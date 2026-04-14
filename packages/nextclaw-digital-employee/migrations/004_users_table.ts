import type { Knex } from "knex";
import { createIndexIfNotExists } from "../server/db/knex";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable("users")) return;

  await knex.schema.createTable("users", (t) => {
    t.string("id").primary();
    t.string("keycloak_sub").notNullable().defaultTo("");
    t.string("username").notNullable().defaultTo("");
    t.string("email").notNullable();
    t.string("display_name").notNullable().defaultTo("");
    t.text("avatar_url").notNullable().defaultTo("");
    t.string("role").notNullable().defaultTo("user");
    t.integer("is_active").notNullable().defaultTo(1);
    t.string("department_id").nullable()
      .references("id").inTable("departments").onDelete("SET NULL");
    t.string("human_employee_id").nullable()
      .references("id").inTable("human_employees").onDelete("SET NULL");
    t.text("preferences").notNullable().defaultTo("{}");
    t.string("auth_provider").notNullable().defaultTo("local");
    t.text("password_hash").nullable();
    t.timestamp("last_login_at").nullable();
    t.timestamp("created_at").notNullable();
    t.timestamp("updated_at").notNullable();
  });

  await createIndexIfNotExists(knex, "idx_users_keycloak_sub",
    `CREATE UNIQUE INDEX "idx_users_keycloak_sub" ON "users" ("keycloak_sub")`);
  await createIndexIfNotExists(knex, "idx_users_email",
    `CREATE UNIQUE INDEX "idx_users_email" ON "users" ("email")`);
  await createIndexIfNotExists(knex, "idx_users_username",
    `CREATE UNIQUE INDEX "idx_users_username" ON "users" ("username")`);
  await createIndexIfNotExists(knex, "idx_users_is_active",
    `CREATE INDEX "idx_users_is_active" ON "users" ("is_active")`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("users");
}
