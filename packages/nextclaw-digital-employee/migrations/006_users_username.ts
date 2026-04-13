import type { Knex } from "knex";
import { hasIndex } from "../server/db/knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("users"))) return;

  if (!(await knex.schema.hasColumn("users", "username"))) {
    await knex.schema.alterTable("users", (t) => {
      t.text("username").notNullable().defaultTo("");
    });

    await knex("users")
      .where({ auth_provider: "local" })
      .whereRaw(`"username" = ''`)
      .update({ username: knex.raw(`REPLACE("email", '@local', '')`) });

    if (!(await hasIndex(knex, "idx_users_username"))) {
      await knex.raw(
        `CREATE UNIQUE INDEX "idx_users_username" ON "users" ("username")`
      );
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("users"))) return;
  if (await knex.schema.hasColumn("users", "username")) {
    await knex.schema.alterTable("users", (t) => {
      t.dropColumn("username");
    });
  }
}
