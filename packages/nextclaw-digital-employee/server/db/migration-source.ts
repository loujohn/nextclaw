import type { Knex } from "knex";

/**
 * Static migration imports — required because Nitro bundles server code
 * with rollup, which cannot auto-discover files at runtime.
 *
 * ⚠️  After creating a new migration file in migrations/, you MUST
 *     add a static import and an entry to the `migrations` array below.
 */
import * as m001 from "../../migrations/001_baseline";
import * as m002 from "../../migrations/002_enums_constraints_indexes";
import * as m003 from "../../migrations/003_legacy_schedule_migration";
import * as m004 from "../../migrations/004_users_table";
import * as m005 from "../../migrations/005_users_local_auth";
import * as m006 from "../../migrations/006_users_username";
import * as m007 from "../../migrations/007_seed_default_admin";
import * as m008 from "../../migrations/008_chat_sessions_messages";
import * as m009 from "../../migrations/009_employee_webhook";

type MigrationEntry = {
  name: string;
  up: (knex: Knex) => Promise<void>;
  down: (knex: Knex) => Promise<void>;
};

const migrations: MigrationEntry[] = [
  { name: "001_baseline.ts", ...m001 },
  { name: "002_enums_constraints_indexes.ts", ...m002 },
  { name: "003_legacy_schedule_migration.ts", ...m003 },
  { name: "004_users_table.ts", ...m004 },
  { name: "005_users_local_auth.ts", ...m005 },
  { name: "006_users_username.ts", ...m006 },
  { name: "007_seed_default_admin.ts", ...m007 },
  { name: "008_chat_sessions_messages.ts", ...m008 },
  { name: "009_employee_webhook.ts", ...m009 },
];

class BundledMigrationSource implements Knex.MigrationSource<MigrationEntry> {
  getMigrations(): Promise<MigrationEntry[]> {
    return Promise.resolve(migrations);
  }

  getMigrationName(migration: MigrationEntry): string {
    return migration.name;
  }

  getMigration(migration: MigrationEntry): Promise<Knex.Migration> {
    return Promise.resolve({ up: migration.up, down: migration.down });
  }
}

export const bundledMigrationSource = new BundledMigrationSource();
