import type { Knex } from "knex";
import { hasIndex, createIndexIfNotExists } from "../server/db/knex";

async function dropIndexSafe(knex: Knex, name: string): Promise<void> {
  if (await hasIndex(knex, name)) {
    await knex.raw(`DROP INDEX "${name}"`);
  }
}

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn("run_records", "session_key"))) {
    await knex.schema.alterTable("run_records", (table) => {
      table.string("session_key").nullable().defaultTo(null);
    });
  }

  if (!(await knex.schema.hasTable("chat_sessions"))) {
    await knex.schema.createTable("chat_sessions", (table) => {
      table.string("id").primary();
      table.string("employee_id").notNullable().references("id").inTable("employees").onDelete("CASCADE");
      table.string("session_key").notNullable();
      table.string("title").notNullable().defaultTo("新对话");
      table.text("preview").notNullable().defaultTo("");
      table.integer("message_count").notNullable().defaultTo(0);
      table.timestamp("created_at").notNullable();
      table.timestamp("updated_at").notNullable();
    });
  }

  if (!(await knex.schema.hasTable("chat_messages"))) {
    await knex.schema.createTable("chat_messages", (table) => {
      table.string("id").primary();
      table.string("session_id").notNullable().references("id").inTable("chat_sessions").onDelete("CASCADE");
      table.string("role").notNullable();
      table.text("content").notNullable().defaultTo("");
      table.string("tool_name").nullable();
      table.string("tool_call_id").nullable();
      table.text("metadata_json").notNullable().defaultTo("{}");
      table.timestamp("created_at").notNullable();
    });
  }

  await knex("chat_messages").whereNull("metadata_json").update({ metadata_json: "{}" });

  await createIndexIfNotExists(knex, "idx_chat_sessions_eid_session_key",
    `CREATE UNIQUE INDEX "idx_chat_sessions_eid_session_key" ON "chat_sessions" ("employee_id", "session_key")`);

  await createIndexIfNotExists(knex, "idx_chat_sessions_eid_updated",
    `CREATE INDEX "idx_chat_sessions_eid_updated" ON "chat_sessions" ("employee_id")`);

  await createIndexIfNotExists(knex, "idx_chat_messages_sid_created",
    `CREATE INDEX "idx_chat_messages_sid_created" ON "chat_messages" ("session_id")`);

  await createIndexIfNotExists(knex, "idx_run_records_eid_session_started",
    `CREATE INDEX "idx_run_records_eid_session_started" ON "run_records" ("employee_id", "session_key")`);
}

export async function down(knex: Knex): Promise<void> {
  for (const name of [
    "idx_run_records_eid_session_started",
    "idx_chat_messages_sid_created",
    "idx_chat_sessions_eid_updated",
    "idx_chat_sessions_eid_session_key"
  ]) {
    await dropIndexSafe(knex, name);
  }
  await knex.schema.dropTableIfExists("chat_messages");
  await knex.schema.dropTableIfExists("chat_sessions");
}
