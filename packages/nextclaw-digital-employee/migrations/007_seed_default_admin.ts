import type { Knex } from "knex";

/**
 * DEPRECATED: Seed logic moved to server/plugins/seed-default-admin.ts.
 * Kept as no-op because this migration was already applied in production.
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function up(_knex: Knex): Promise<void> {}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function down(_knex: Knex): Promise<void> {}
