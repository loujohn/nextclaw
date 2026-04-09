import type { Knex } from "knex";

async function hasIndex(knex: Knex, indexName: string): Promise<boolean> {
  const isDm = (process.env.DB_CLIENT ?? "sqlite").toLowerCase() === "dm";
  if (!isDm) {
    const rows = await knex.raw(
      `SELECT name FROM sqlite_master WHERE type='index' AND name=?`,
      [indexName]
    );
    return rows.length > 0;
  }
  const rows = await knex.raw(
    `SELECT INDEX_NAME FROM ALL_INDEXES WHERE INDEX_NAME = ?`,
    [indexName.toUpperCase()]
  );
  const result = Array.isArray(rows) ? rows : (rows?.rows ?? []);
  return result.length > 0;
}

async function createIndexSafe(knex: Knex, name: string, ddl: string): Promise<void> {
  const isDm = (process.env.DB_CLIENT ?? "sqlite").toLowerCase() === "dm";
  if (!isDm) {
    await knex.raw(
      ddl.replace("CREATE INDEX", "CREATE INDEX IF NOT EXISTS")
        .replace("CREATE UNIQUE INDEX", "CREATE UNIQUE INDEX IF NOT EXISTS")
    );
    return;
  }
  if (!(await hasIndex(knex, name))) {
    await knex.raw(ddl);
  }
}

async function dropIndexSafe(knex: Knex, name: string): Promise<void> {
  const isDm = (process.env.DB_CLIENT ?? "sqlite").toLowerCase() === "dm";
  if (!isDm) {
    await knex.raw(`DROP INDEX IF EXISTS "${name}"`);
    return;
  }
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

  await createIndexSafe(knex, "idx_chat_sessions_eid_session_key",
    `CREATE UNIQUE INDEX "idx_chat_sessions_eid_session_key" ON "chat_sessions" ("employee_id", "session_key")`);

  if ((process.env.DB_CLIENT ?? "sqlite").toLowerCase() !== "dm") {
    await createIndexSafe(knex, "idx_chat_sessions_eid_updated",
      `CREATE INDEX "idx_chat_sessions_eid_updated" ON "chat_sessions" ("employee_id", "updated_at" DESC)`);
    await createIndexSafe(knex, "idx_chat_messages_sid_created",
      `CREATE INDEX "idx_chat_messages_sid_created" ON "chat_messages" ("session_id", "created_at" DESC, "id" DESC)`);
    await createIndexSafe(knex, "idx_run_records_eid_session_started",
      `CREATE INDEX "idx_run_records_eid_session_started" ON "run_records" ("employee_id", "session_key", "started_at" DESC)`);
  } else {
    await createIndexSafe(knex, "idx_chat_sessions_eid_updated",
      `CREATE INDEX "idx_chat_sessions_eid_updated" ON "chat_sessions" ("employee_id")`);
    await createIndexSafe(knex, "idx_chat_messages_sid_created",
      `CREATE INDEX "idx_chat_messages_sid_created" ON "chat_messages" ("session_id")`);
    await createIndexSafe(knex, "idx_run_records_eid_session_started",
      `CREATE INDEX "idx_run_records_eid_session_started" ON "run_records" ("employee_id", "session_key")`);
  }
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
