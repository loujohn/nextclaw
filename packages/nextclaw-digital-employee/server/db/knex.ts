import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import knex, { type Knex } from "knex";
import { PLATFORM_TABLES } from "./schema";

function ensureParentDir(path: string): void {
  const dir = dirname(resolve(path));
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function createPlatformKnex(databasePath: string): Knex {
  ensureParentDir(databasePath);
  return knex({
    client: "better-sqlite3",
    connection: {
      filename: resolve(databasePath)
    },
    useNullAsDefault: true
  });
}

async function createDepartmentsTable(db: Knex): Promise<void> {
  const exists = await db.schema.hasTable(PLATFORM_TABLES.departments);
  if (exists) {
    return;
  }
  await db.schema.createTable(PLATFORM_TABLES.departments, (table) => {
    table.string("id").primary();
    table.string("name").notNullable();
    table.text("description").notNullable().defaultTo("");
    table.string("external_id").nullable();
    table.string("parent_id").nullable().references("id").inTable(PLATFORM_TABLES.departments).onDelete("SET NULL");
    table.integer("sort_order").notNullable().defaultTo(0);
    table.timestamp("created_at").notNullable();
    table.timestamp("updated_at").notNullable();
  });
}

async function createEmployeesTable(db: Knex): Promise<void> {
  const exists = await db.schema.hasTable(PLATFORM_TABLES.employees);
  if (exists) {
    return;
  }
  await db.schema.createTable(PLATFORM_TABLES.employees, (table) => {
    table.string("id").primary();
    table.string("name").notNullable();
    table.string("code").notNullable().unique();
    table.text("description").notNullable().defaultTo("");
    table.text("system_prompt").notNullable().defaultTo("");
    table.string("model").defaultTo("");
    table.string("status").notNullable().defaultTo("active");
    table.timestamp("created_at").notNullable();
    table.timestamp("updated_at").notNullable();
  });
}

async function createEmployeeSkillsTable(db: Knex): Promise<void> {
  const exists = await db.schema.hasTable(PLATFORM_TABLES.employeeSkills);
  if (exists) {
    return;
  }
  await db.schema.createTable(PLATFORM_TABLES.employeeSkills, (table) => {
    table.string("id").primary();
    table.string("employee_id").notNullable().references("id").inTable(PLATFORM_TABLES.employees).onDelete("CASCADE");
    table.string("skill_name").notNullable();
    table.boolean("enabled").notNullable().defaultTo(true);
    table.text("config_json").notNullable().defaultTo("{}");
    table.timestamp("created_at").notNullable();
    table.timestamp("updated_at").notNullable();
  });
}

async function createEmployeeSchedulesTable(db: Knex): Promise<void> {
  const exists = await db.schema.hasTable(PLATFORM_TABLES.employeeSchedules);
  if (exists) {
    return;
  }
  await db.schema.createTable(PLATFORM_TABLES.employeeSchedules, (table) => {
    table.string("id").primary();
    table.string("employee_id").notNullable().references("id").inTable(PLATFORM_TABLES.employees).onDelete("CASCADE");
    table.string("schedule_kind").notNullable().defaultTo("manual");
    table.string("cron_expr");
    table.bigInteger("every_ms");
    table.boolean("heartbeat_enabled").notNullable().defaultTo(false);
    table.integer("heartbeat_interval_s");
    table.boolean("enabled").notNullable().defaultTo(true);
    table.string("runtime_job_id");
    table.text("schedule_message").notNullable().defaultTo("");
    table.timestamp("next_run_at");
    table.timestamp("created_at").notNullable();
    table.timestamp("updated_at").notNullable();
  });
}

async function createSkillInstallationsTable(db: Knex): Promise<void> {
  const exists = await db.schema.hasTable(PLATFORM_TABLES.skillInstallations);
  if (exists) {
    return;
  }
  await db.schema.createTable(PLATFORM_TABLES.skillInstallations, (table) => {
    table.string("id").primary();
    table.string("skill_name").notNullable().unique();
    table.string("source_type").notNullable();
    table.text("source_uri").notNullable();
    table.string("version");
    table.text("install_path").notNullable();
    table.boolean("enabled").notNullable().defaultTo(true);
    table.text("metadata_json").notNullable().defaultTo("{}");
    table.timestamp("created_at").notNullable();
    table.timestamp("updated_at").notNullable();
  });
}

async function createIntegrationConnectionsTable(db: Knex): Promise<void> {
  const exists = await db.schema.hasTable(PLATFORM_TABLES.integrationConnections);
  if (exists) {
    return;
  }
  await db.schema.createTable(PLATFORM_TABLES.integrationConnections, (table) => {
    table.string("id").primary();
    table.string("type").notNullable();
    table.string("name").notNullable();
    table.text("config_json").notNullable().defaultTo("{}");
    table.boolean("enabled").notNullable().defaultTo(true);
    table.timestamp("created_at").notNullable();
    table.timestamp("updated_at").notNullable();
  });
}

async function createRunRecordsTable(db: Knex): Promise<void> {
  const exists = await db.schema.hasTable(PLATFORM_TABLES.runRecords);
  if (exists) {
    return;
  }
  await db.schema.createTable(PLATFORM_TABLES.runRecords, (table) => {
    table.string("id").primary();
    table.string("employee_id").references("id").inTable(PLATFORM_TABLES.employees).onDelete("SET NULL");
    table.string("trigger_type").notNullable();
    table.string("trigger_source").notNullable();
    table.string("status").notNullable();
    table.timestamp("started_at").notNullable();
    table.timestamp("finished_at");
    table.text("summary").notNullable().defaultTo("");
    table.text("result_json").notNullable().defaultTo("{}");
  });
}

async function createRunEventsTable(db: Knex): Promise<void> {
  const exists = await db.schema.hasTable(PLATFORM_TABLES.runEvents);
  if (exists) {
    return;
  }
  await db.schema.createTable(PLATFORM_TABLES.runEvents, (table) => {
    table.string("id").primary();
    table.string("run_id").notNullable().references("id").inTable(PLATFORM_TABLES.runRecords).onDelete("CASCADE");
    table.integer("seq").notNullable();
    table.string("event_type").notNullable();
    table.text("payload_json").notNullable().defaultTo("{}");
    table.timestamp("created_at").notNullable();
  });
}

async function createHumanEmployeesTable(db: Knex): Promise<void> {
  const exists = await db.schema.hasTable(PLATFORM_TABLES.humanEmployees);
  if (exists) {
    return;
  }
  await db.schema.createTable(PLATFORM_TABLES.humanEmployees, (table) => {
    table.string("id").primary();
    table.string("external_id").notNullable().unique();
    table.string("name").notNullable();
    table.text("avatar").notNullable().defaultTo("");
    table.string("title").notNullable().defaultTo("");
    table.string("job_number").notNullable().defaultTo("");
    table.boolean("active").notNullable().defaultTo(true);
    table.boolean("is_admin").notNullable().defaultTo(false);
    table.boolean("is_boss").notNullable().defaultTo(false);
    // 主部门，ON DELETE SET NULL，避免部门删除导致人员数据丢失
    table.string("department_id").nullable().references("id").inTable(PLATFORM_TABLES.departments).onDelete("SET NULL");
    table.text("external_dept_ids").notNullable().defaultTo("[]");
    table.string("unionid").notNullable().defaultTo("");
    table.timestamp("created_at").notNullable();
    table.timestamp("updated_at").notNullable();
  });
}

async function migrateAddDepartmentExternalId(db: Knex): Promise<void> {
  const hasColumn = await db.schema.hasColumn(PLATFORM_TABLES.departments, "external_id");
  if (!hasColumn) {
    await db.schema.alterTable(PLATFORM_TABLES.departments, (table) => {
      table.string("external_id").nullable();
    });
  }
}

async function migrateEmployeesAddModel(db: Knex): Promise<void> {
  const hasColumn = await db.schema.hasColumn(PLATFORM_TABLES.employees, "model");
  if (!hasColumn) {
    await db.schema.alterTable(PLATFORM_TABLES.employees, (table) => {
      table.string("model").defaultTo("");
    });
  }
}

async function migrateEmployeesAddDepartmentId(db: Knex): Promise<void> {
  const hasColumn = await db.schema.hasColumn(PLATFORM_TABLES.employees, "department_id");
  if (!hasColumn) {
    await db.schema.alterTable(PLATFORM_TABLES.employees, (table) => {
      table.string("department_id").nullable().defaultTo(null);
    });
  }
}

async function createOrgSyncConfigTable(db: Knex): Promise<void> {
  const exists = await db.schema.hasTable(PLATFORM_TABLES.orgSyncConfig);
  if (exists) return;
  await db.schema.createTable(PLATFORM_TABLES.orgSyncConfig, (table) => {
    table.string("id").primary(); // fixed "default"
    table.string("app_key").notNullable().defaultTo("");
    table.string("app_secret").notNullable().defaultTo("");
    table.string("cron_expr").notNullable().defaultTo("0 1 * * *");
    table.boolean("enabled").notNullable().defaultTo(false);
    table.timestamp("last_run_at").nullable();
    table.string("last_run_status").nullable();
    table.text("last_run_summary").notNullable().defaultTo("");
    table.timestamp("updated_at").notNullable();
  });
}

async function createEmployeeScheduleJobsTable(db: Knex): Promise<void> {
  const exists = await db.schema.hasTable(PLATFORM_TABLES.employeeScheduleJobs);
  if (exists) return;
  await db.schema.createTable(PLATFORM_TABLES.employeeScheduleJobs, (table) => {
    table.string("id").primary();
    table.string("employee_id").notNullable().references("id").inTable(PLATFORM_TABLES.employees).onDelete("CASCADE");
    table.string("name").notNullable().defaultTo("");
    table.text("description").notNullable().defaultTo("");
    table.string("schedule_kind").notNullable().defaultTo("cron");
    table.string("cron_expr").nullable();
    table.bigInteger("every_ms").nullable();
    table.integer("heartbeat_interval_s").nullable();
    table.text("task_prompt").notNullable().defaultTo("");
    table.boolean("enabled").notNullable().defaultTo(true);
    table.string("runtime_job_id").nullable();
    table.timestamp("next_run_at").nullable();
    table.timestamp("created_at").notNullable();
    table.timestamp("updated_at").notNullable();
  });
}

async function createSecretsTable(db: Knex): Promise<void> {
  if (await db.schema.hasTable(PLATFORM_TABLES.secrets)) return;
  await db.schema.createTable(PLATFORM_TABLES.secrets, (table) => {
    table.text("id").primary();
    table.text("key").notNullable().unique();
    table.text("value").notNullable();
    table.text("scope").notNullable().defaultTo("global");
    table.text("description").defaultTo("");
    table.text("created_at").notNullable();
    table.text("updated_at").notNullable();
  });
}

async function migrateAddQueryIndexes(db: Knex): Promise<void> {
  const masterRows = await db.raw(
    "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='employees' AND name LIKE '%code%'"
  );
  for (const idx of masterRows) {
    if (idx.name && idx.name !== "idx_employees_code_active") {
      await db.raw(`DROP INDEX IF EXISTS "${idx.name}"`);
    }
  }
  await db.raw(
    `CREATE UNIQUE INDEX IF NOT EXISTS "idx_employees_code_active" ON "employees" ("code") WHERE "status" != 'archived'`
  );
  await db.raw(
    `CREATE UNIQUE INDEX IF NOT EXISTS "idx_employee_skills_eid_name" ON "employee_skills" ("employee_id", "skill_name")`
  );
  await db.raw(
    `CREATE INDEX IF NOT EXISTS "idx_run_records_eid_started" ON "run_records" ("employee_id", "started_at" DESC)`
  );
  await db.raw(
    `CREATE INDEX IF NOT EXISTS "idx_run_events_rid_seq" ON "run_events" ("run_id", "seq" ASC)`
  );
  await db.raw(
    `CREATE INDEX IF NOT EXISTS "idx_schedule_jobs_eid" ON "employee_schedule_jobs" ("employee_id")`
  );
}

async function migrateLegacySchedulesToJobs(db: Knex): Promise<void> {
  const hasLegacyTable = await db.schema.hasTable(PLATFORM_TABLES.employeeSchedules);
  if (!hasLegacyTable) return;

  const legacyRows = await db(PLATFORM_TABLES.employeeSchedules).select("*");
  if (legacyRows.length === 0) return;

  for (const row of legacyRows) {
    const existingJob = await db(PLATFORM_TABLES.employeeScheduleJobs)
      .where({ employee_id: row.employee_id })
      .first();
    if (existingJob) continue;

    const now = new Date().toISOString();
    await db(PLATFORM_TABLES.employeeScheduleJobs).insert({
      id: row.id,
      employee_id: row.employee_id,
      name: "默认调度 (迁移)",
      description: "从旧版单调度自动迁移",
      schedule_kind: row.schedule_kind,
      cron_expr: row.cron_expr ?? null,
      every_ms: row.every_ms ?? null,
      heartbeat_interval_s: row.heartbeat_interval_s ?? null,
      task_prompt: row.schedule_message ?? "",
      enabled: row.enabled,
      runtime_job_id: row.runtime_job_id ?? null,
      next_run_at: row.next_run_at ?? null,
      created_at: now,
      updated_at: now,
    });
  }
}

export async function ensurePlatformDatabase(db: Knex): Promise<void> {
  await createDepartmentsTable(db);
  await createEmployeesTable(db);
  await createHumanEmployeesTable(db);
  await createEmployeeSkillsTable(db);
  await createEmployeeSchedulesTable(db);
  await createEmployeeScheduleJobsTable(db);
  await createSkillInstallationsTable(db);
  await createIntegrationConnectionsTable(db);
  await createRunRecordsTable(db);
  await createRunEventsTable(db);
  await createOrgSyncConfigTable(db);
  await createSecretsTable(db);
  await migrateEmployeesAddModel(db);
  await migrateEmployeesAddDepartmentId(db);
  await migrateAddDepartmentExternalId(db);
  await migrateAddQueryIndexes(db);
  await migrateLegacySchedulesToJobs(db);
}

type MigrationEntry = {
  name: string;
  up: (knex: Knex) => Promise<void>;
  down: (knex: Knex) => Promise<void>;
};

class InlineMigrationSource implements Knex.MigrationSource<MigrationEntry> {
  private readonly entries: MigrationEntry[];

  constructor(entries: MigrationEntry[]) {
    this.entries = entries;
  }

  getMigrations(): Promise<MigrationEntry[]> {
    return Promise.resolve(this.entries);
  }

  getMigrationName(migration: MigrationEntry): string {
    return migration.name;
  }

  getMigration(migration: MigrationEntry): Promise<Knex.Migration> {
    return Promise.resolve({ up: migration.up, down: migration.down });
  }
}

const platformMigrations: MigrationEntry[] = [
  {
    name: "001_baseline.ts",
    async up(knex) {
      await ensurePlatformDatabase(knex);
    },
    async down() {
      // Baseline — not reversible
    },
  },
  {
    name: "002_enums_constraints_indexes.ts",
    async up(knex) {
      await migrateAddQueryIndexes(knex);
    },
    async down(knex) {
      await knex.raw(`DROP INDEX IF EXISTS "idx_schedule_jobs_eid"`);
      await knex.raw(`DROP INDEX IF EXISTS "idx_run_events_rid_seq"`);
      await knex.raw(`DROP INDEX IF EXISTS "idx_run_records_eid_started"`);
      await knex.raw(`DROP INDEX IF EXISTS "idx_employee_skills_eid_name"`);
      await knex.raw(`DROP INDEX IF EXISTS "idx_employees_code_active"`);
    },
  },
  {
    name: "003_legacy_schedule_migration.ts",
    async up(knex) {
      await migrateLegacySchedulesToJobs(knex);
    },
    async down() {
      // Not reversible — see migrations/003_legacy_schedule_migration.ts
    },
  },
];

export const platformMigrationSource = new InlineMigrationSource(platformMigrations);
