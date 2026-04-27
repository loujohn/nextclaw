import { createPlatformKnex, resolveDbConfigFromEnv, ensureDmSchema } from "../server/db/knex";
import { bundledMigrationSource } from "../server/db/migration-source";
import type { Knex } from "knex";

const TEST_SCHEMA = "DIGITAL_EMPLOYEE_TEST";

/**
 * Creates a DM-backed Knex instance for testing.
 * Always uses the hardcoded TEST_SCHEMA to prevent accidental dev DB operations.
 */
export function createTestKnex(): Knex {
  const baseConfig = resolveDbConfigFromEnv();
  return createPlatformKnex({
    ...baseConfig,
    connection: { ...baseConfig.connection, schema: TEST_SCHEMA },
  });
}

/**
 * Initializes the test database by running all migrations via
 * the same BundledMigrationSource used in production.
 * Safe to call multiple times — Knex tracks applied migrations.
 */
export async function ensureTestDatabase(db: Knex): Promise<void> {
  await ensureDmSchema(db);
  await db.migrate.latest({
    migrationSource: bundledMigrationSource,
    disableMigrationsListValidation: true,
  });
}

/**
 * Truncates all platform tables (order respects FK constraints).
 * Call in afterEach to reset test state between test cases.
 */
export async function cleanTestDatabase(db: Knex): Promise<void> {
  const tables = [
    "chat_messages", "chat_sessions",
    "role_permissions", "users", "run_events", "run_records", "org_sync_config", "secrets",
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
