import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import knex, { type Knex } from "knex";
import { PLATFORM_TABLES } from "./schema";

const _require = createRequire(import.meta.url);

export type DbClientType = "sqlite" | "dm";

export type DmConnectionConfig = {
  connectString: string;
  user: string;
  password: string;
  schema?: string;
};

export type PlatformDbConfig =
  | { client: "sqlite"; sqlitePath: string }
  | { client: "dm"; connection: DmConnectionConfig };

function ensureParentDir(path: string): void {
  const dir = dirname(resolve(path));
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export const DM_DEFAULT_SCHEMA = "DIGITAL_EMPLOYEE";

let _dbClient: DbClientType = "sqlite";
let _dmSchema = DM_DEFAULT_SCHEMA;
let _dmSchemaReady = false;

export function getDbClient(): DbClientType {
  return _dbClient;
}

export function isSqlite(): boolean {
  return _dbClient === "sqlite";
}

export function isDm(): boolean {
  return _dbClient === "dm";
}

/**
 * 返回当前数据库引擎兼容的时间戳字符串。
 * SQLite 使用 ISO 8601 (2024-01-01T00:00:00.000Z)
 * 达梦使用 YYYY-MM-DD HH:mm:ss (不带 T 和 Z)
 */
export function dbNow(): string {
  return formatTimestamp(new Date());
}

export function formatTimestamp(date: Date): string {
  if (isSqlite()) {
    return date.toISOString();
  }
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function resolveDbConfigFromEnv(): PlatformDbConfig {
  const clientEnv = (process.env.DB_CLIENT ?? "sqlite").toLowerCase();
  if (clientEnv === "dm") {
    const host = process.env.DB_HOST ?? "localhost";
    const port = process.env.DB_PORT ?? "5236";
    return {
      client: "dm",
      connection: {
        connectString: `${host}:${port}`,
        user: process.env.DB_USER ?? "SYSDBA",
        password: process.env.DB_PASSWORD ?? "SYSDBA",
        schema: process.env.DB_SCHEMA ?? DM_DEFAULT_SCHEMA,
      },
    };
  }
  return { client: "sqlite", sqlitePath: "" };
}

export function createPlatformKnex(pathOrConfig: string | PlatformDbConfig): Knex {
  const config: PlatformDbConfig =
    typeof pathOrConfig === "string"
      ? { client: "sqlite", sqlitePath: pathOrConfig }
      : pathOrConfig;

  _dbClient = config.client;

  if (config.client === "dm") {
    const knexDm = _require("knex-dm");
    const schema = config.connection.schema ?? DM_DEFAULT_SCHEMA;
    _dmSchema = schema;
    return knex({
      client: knexDm,
      connection: {
        connectString: config.connection.connectString,
        user: config.connection.user,
        password: config.connection.password,
      },
      pool: {
        min: 2,
        max: 10,
        afterCreate(conn: { execute: (sql: string, params: unknown[], cb: (err: unknown) => void) => void }, cb: (err: unknown, conn: unknown) => void) {
          if (!_dmSchemaReady) {
            cb(null, conn);
            return;
          }
          conn.execute(`SET SCHEMA "${schema}"`, [], (err: unknown) => {
            cb(err, conn);
          });
        },
      },
      fetchAsString: ["DATE"],
    });
  }

  ensureParentDir(config.sqlitePath);
  return knex({
    client: "better-sqlite3",
    connection: {
      filename: resolve(config.sqlitePath)
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
    table.string("session_key").nullable();
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

async function createChatSessionsTable(db: Knex): Promise<void> {
  const exists = await db.schema.hasTable(PLATFORM_TABLES.chatSessions);
  if (exists) {
    return;
  }
  await db.schema.createTable(PLATFORM_TABLES.chatSessions, (table) => {
    table.string("id").primary();
    table.string("employee_id").notNullable().references("id").inTable(PLATFORM_TABLES.employees).onDelete("CASCADE");
    table.string("session_key").notNullable();
    table.string("title").notNullable().defaultTo("新对话");
    table.text("preview").notNullable().defaultTo("");
    table.integer("message_count").notNullable().defaultTo(0);
    table.timestamp("created_at").notNullable();
    table.timestamp("updated_at").notNullable();
  });
}

async function createChatMessagesTable(db: Knex): Promise<void> {
  const exists = await db.schema.hasTable(PLATFORM_TABLES.chatMessages);
  if (exists) {
    return;
  }
  await db.schema.createTable(PLATFORM_TABLES.chatMessages, (table) => {
    table.string("id").primary();
    table.string("session_id").notNullable().references("id").inTable(PLATFORM_TABLES.chatSessions).onDelete("CASCADE");
    table.string("role").notNullable();
    table.text("content").notNullable().defaultTo("");
    table.string("tool_name").nullable();
    table.string("tool_call_id").nullable();
    table.text("metadata_json").notNullable().defaultTo("{}");
    table.timestamp("created_at").notNullable();
  });
}

async function migrateChatMessagesMetadataJson(db: Knex): Promise<void> {
  const hasTable = await db.schema.hasTable(PLATFORM_TABLES.chatMessages);
  if (!hasTable) {
    return;
  }
  await db(PLATFORM_TABLES.chatMessages)
    .whereNull("metadata_json")
    .update({ metadata_json: "{}" });
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

async function migrateRunRecordsAddSessionKey(db: Knex): Promise<void> {
  const hasColumn = await db.schema.hasColumn(PLATFORM_TABLES.runRecords, "session_key");
  if (!hasColumn) {
    await db.schema.alterTable(PLATFORM_TABLES.runRecords, (table) => {
      table.string("session_key").nullable().defaultTo(null);
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
  if (isSqlite()) {
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
  } else {
    const hasIdx = await hasIndex(db, "idx_employees_code_active");
    if (!hasIdx) {
      await db.raw(
        `CREATE UNIQUE INDEX "idx_employees_code_active" ON "employees" ("code")`
      );
    }
  }

  await createIndexIfNotExists(db, "idx_employee_skills_eid_name",
    `CREATE UNIQUE INDEX "idx_employee_skills_eid_name" ON "employee_skills" ("employee_id", "skill_name")`);
  if (isSqlite()) {
    await createIndexIfNotExists(db, "idx_run_records_eid_started",
      `CREATE INDEX "idx_run_records_eid_started" ON "run_records" ("employee_id", "started_at" DESC)`);
  } else {
    await createIndexIfNotExists(db, "idx_run_records_eid_started",
      `CREATE INDEX "idx_run_records_eid_started" ON "run_records" ("employee_id")`);
  }
  await createIndexIfNotExists(db, "idx_run_events_rid_seq",
    `CREATE INDEX "idx_run_events_rid_seq" ON "run_events" ("run_id", "seq" ASC)`);
  await createIndexIfNotExists(db, "idx_schedule_jobs_eid",
    `CREATE INDEX "idx_schedule_jobs_eid" ON "employee_schedule_jobs" ("employee_id")`);
  await createIndexIfNotExists(db, "idx_chat_sessions_eid_session_key",
    `CREATE UNIQUE INDEX "idx_chat_sessions_eid_session_key" ON "chat_sessions" ("employee_id", "session_key")`);
  if (isSqlite()) {
    await createIndexIfNotExists(db, "idx_chat_sessions_eid_updated",
      `CREATE INDEX "idx_chat_sessions_eid_updated" ON "chat_sessions" ("employee_id", "updated_at" DESC)`);
    await createIndexIfNotExists(db, "idx_chat_messages_sid_created",
      `CREATE INDEX "idx_chat_messages_sid_created" ON "chat_messages" ("session_id", "created_at" DESC, "id" DESC)`);
    await createIndexIfNotExists(db, "idx_run_records_eid_session_started",
      `CREATE INDEX "idx_run_records_eid_session_started" ON "run_records" ("employee_id", "session_key", "started_at" DESC)`);
  } else {
    await createIndexIfNotExists(db, "idx_chat_sessions_eid_updated",
      `CREATE INDEX "idx_chat_sessions_eid_updated" ON "chat_sessions" ("employee_id")`);
    await createIndexIfNotExists(db, "idx_chat_messages_sid_created",
      `CREATE INDEX "idx_chat_messages_sid_created" ON "chat_messages" ("session_id")`);
    await createIndexIfNotExists(db, "idx_run_records_eid_session_started",
      `CREATE INDEX "idx_run_records_eid_session_started" ON "run_records" ("employee_id", "session_key")`);
  }
}

async function hasIndex(db: Knex, indexName: string): Promise<boolean> {
  if (isSqlite()) {
    const rows = await db.raw(
      `SELECT name FROM sqlite_master WHERE type='index' AND name=?`, [indexName]
    );
    return rows.length > 0;
  }
  const rows = await db.raw(
    `SELECT INDEX_NAME FROM ALL_INDEXES WHERE INDEX_NAME = ?`, [indexName.toUpperCase()]
  );
  const result = Array.isArray(rows) ? rows : (rows?.rows ?? []);
  return result.length > 0;
}

async function createIndexIfNotExists(db: Knex, indexName: string, ddl: string): Promise<void> {
  if (isSqlite()) {
    await db.raw(ddl.replace(`CREATE INDEX`, `CREATE INDEX IF NOT EXISTS`)
      .replace(`CREATE UNIQUE INDEX`, `CREATE UNIQUE INDEX IF NOT EXISTS`));
    return;
  }
  const exists = await hasIndex(db, indexName);
  if (!exists) {
    await db.raw(ddl);
  }
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

    const now = dbNow();
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

/**
 * 切换达梦当前会话的 Schema。
 * 若未配置 DB_SCHEMA 或 schema 参数，则使用连接用户的默认 Schema（无需切换）。
 * Schema 需由 DBA 预先创建，应用层不自动 CREATE。
 */
export async function ensureDmSchema(db: Knex, schema?: string): Promise<void> {
  if (!isDm()) return;
  const targetSchema = (schema ?? _dmSchema).toUpperCase();
  const user = (process.env.DB_USER ?? "SYSDBA").toUpperCase();
  if (targetSchema === user) {
    _dmSchemaReady = true;
    return;
  }
  try {
    await db.raw(`SET SCHEMA "${targetSchema}"`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `无法切换到达梦 Schema "${targetSchema}"。` +
      `请确认 DBA 已创建该 Schema/User，或将 DB_SCHEMA 设为连接用户名 "${user}"。` +
      `\n原始错误: ${msg}`
    );
  }
  _dmSchemaReady = true;
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
  await createChatSessionsTable(db);
  await createChatMessagesTable(db);
  await createOrgSyncConfigTable(db);
  await createSecretsTable(db);
  await migrateEmployeesAddModel(db);
  await migrateEmployeesAddDepartmentId(db);
  await migrateAddDepartmentExternalId(db);
  await migrateRunRecordsAddSessionKey(db);
  await migrateChatMessagesMetadataJson(db);
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
      const indexes = [
        "idx_schedule_jobs_eid",
        "idx_run_events_rid_seq",
        "idx_run_records_eid_started",
        "idx_employee_skills_eid_name",
        "idx_employees_code_active",
      ];
      for (const name of indexes) {
        if (isSqlite()) {
          await knex.raw(`DROP INDEX IF EXISTS "${name}"`);
        } else {
          const exists = await hasIndex(knex, name);
          if (exists) {
            await knex.raw(`DROP INDEX "${name}"`);
          }
        }
      }
    },
  },
  {
    name: "003_chat_sessions_messages.ts",
    async up(knex) {
      await createChatSessionsTable(knex);
      await createChatMessagesTable(knex);
      await migrateRunRecordsAddSessionKey(knex);
      await migrateAddQueryIndexes(knex);
    },
    async down(knex) {
      if (isSqlite()) {
        for (const name of [
          "idx_run_records_eid_session_started",
          "idx_chat_messages_sid_created",
          "idx_chat_sessions_eid_updated",
          "idx_chat_sessions_eid_session_key"
        ]) {
          await knex.raw(`DROP INDEX IF EXISTS "${name}"`);
        }
      }
      await knex.schema.dropTableIfExists(PLATFORM_TABLES.chatMessages);
      await knex.schema.dropTableIfExists(PLATFORM_TABLES.chatSessions);
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
  {
    name: "004_chat_persistence.ts",
    async up(knex) {
      await createChatSessionsTable(knex);
      await createChatMessagesTable(knex);
      await migrateRunRecordsAddSessionKey(knex);
      await migrateAddQueryIndexes(knex);
    },
    async down(knex) {
      if (isSqlite()) {
        for (const name of [
          "idx_run_records_eid_session_started",
          "idx_chat_messages_sid_created",
          "idx_chat_sessions_eid_updated",
          "idx_chat_sessions_eid_session_key"
        ]) {
          await knex.raw(`DROP INDEX IF EXISTS "${name}"`);
        }
      }
      await knex.schema.dropTableIfExists(PLATFORM_TABLES.chatMessages);
      await knex.schema.dropTableIfExists(PLATFORM_TABLES.chatSessions);
    },
  },
];

export const platformMigrationSource = new InlineMigrationSource(platformMigrations);
