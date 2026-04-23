import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("channel_groups"))) {
    await knex.schema.createTable("channel_groups", (t) => {
      t.string("id").primary();
      t.string("conversation_id").notNullable().unique();
      t.string("title").notNullable();
      t.string("channel").notNullable().defaultTo("dingtalk");
      t.string("account_id").notNullable().defaultTo("");
      t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
      t.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable("channel_groups")) {
    await knex.schema.dropTable("channel_groups");
  }
}
