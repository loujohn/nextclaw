import { createPlatformKnex, resolveDbConfigFromEnv, ensureDmSchema } from "../server/db/knex";
import { bundledMigrationSource } from "../server/db/migration-source";
import type { Knex } from "knex";

/**
 * Creates a DM-backed Knex instance for testing using the same
 * connection config as production (resolved from env vars).
 */
export function createTestKnex(): Knex {
  return createPlatformKnex(resolveDbConfigFromEnv());
}

/**
 * Initializes the test database by running all migrations via
 * the same BundledMigrationSource used in production.
 * Safe to call multiple times — Knex tracks applied migrations.
 */
export async function ensureTestDatabase(db: Knex): Promise<void> {
  await ensureDmSchema(db);
  await db.migrate.latest({ migrationSource: bundledMigrationSource });
}

/**
 * Truncates all platform tables (order respects FK constraints).
 * Call in afterEach to reset test state between test cases.
 */
export async function cleanTestDatabase(db: Knex): Promise<void> {
  const tables = [
    "users", "run_events", "run_records", "org_sync_config", "secrets",
    "integration_connections", "skill_installations",
    "employee_schedule_jobs", "employee_schedules", "employee_skills",
    "human_employees", "employees", "departments",
  ];
  for (const table of tables) {
    if (await db.schema.hasTable(table)) {
      await db(table).truncate();
    }
  }
}
