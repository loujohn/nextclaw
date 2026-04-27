import type { Knex } from "knex";

const TABLE_NAME = "employee_schedule_jobs";

async function hasColumn(knex: Knex, columnName: string): Promise<boolean> {
  return knex.schema.hasColumn(TABLE_NAME, columnName);
}

export async function up(knex: Knex): Promise<void> {
  const hasOutputChatIds = await hasColumn(knex, "output_chat_ids");
  const hasSourceChatId = await hasColumn(knex, "source_chat_id");

  if (!hasOutputChatIds || !hasSourceChatId) {
    await knex.schema.alterTable(TABLE_NAME, (table) => {
      if (!hasOutputChatIds) {
        table.text("output_chat_ids").nullable();
      }
      if (!hasSourceChatId) {
        table.string("source_chat_id").nullable();
      }
    });
  }

  await knex(TABLE_NAME)
    .whereNull("output_chat_ids")
    .update({ output_chat_ids: "[]" });

  await knex.raw(`ALTER TABLE "${TABLE_NAME}" MODIFY ("output_chat_ids" CLOB NOT NULL)`);
}

export async function down(knex: Knex): Promise<void> {
  const hasOutputChatIds = await hasColumn(knex, "output_chat_ids");
  const hasSourceChatId = await hasColumn(knex, "source_chat_id");

  if (!hasOutputChatIds && !hasSourceChatId) {
    return;
  }

  await knex.schema.alterTable(TABLE_NAME, (table) => {
    if (hasSourceChatId) {
      table.dropColumn("source_chat_id");
    }
    if (hasOutputChatIds) {
      table.dropColumn("output_chat_ids");
    }
  });
}