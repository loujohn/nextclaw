import type { Knex } from "knex";

const IS_DM = (process.env.DB_CLIENT ?? "sqlite").toLowerCase() === "dm";

async function hasIndex(knex: Knex, indexName: string): Promise<boolean> {
  if (!IS_DM) {
    const rows = await knex.raw(
      `SELECT name FROM sqlite_master WHERE type='index' AND name=?`, [indexName]
    );
    return rows.length > 0;
  }
  const rows = await knex.raw(
    `SELECT INDEX_NAME FROM ALL_INDEXES WHERE INDEX_NAME = ?`, [indexName.toUpperCase()]
  );
  const result = Array.isArray(rows) ? rows : (rows?.rows ?? []);
  return result.length > 0;
}

async function createIndexSafe(knex: Knex, name: string, ddl: string): Promise<void> {
  if (!IS_DM) {
    await knex.raw(ddl.replace("CREATE INDEX", "CREATE INDEX IF NOT EXISTS")
      .replace("CREATE UNIQUE INDEX", "CREATE UNIQUE INDEX IF NOT EXISTS"));
    return;
  }
  if (!(await hasIndex(knex, name))) {
    await knex.raw(ddl);
  }
}

async function dropIndexSafe(knex: Knex, name: string): Promise<void> {
  if (!IS_DM) {
    await knex.raw(`DROP INDEX IF EXISTS "${name}"`);
    return;
  }
  if (await hasIndex(knex, name)) {
    await knex.raw(`DROP INDEX "${name}"`);
  }
}

export async function up(knex: Knex): Promise<void> {
  if (!IS_DM) {
    const employeeIndexes = await knex.raw(
      "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='employees' AND name LIKE '%code%'"
    );
    for (const idx of employeeIndexes) {
      if (idx.name && idx.name !== "idx_employees_code_active") {
        await knex.raw(`DROP INDEX IF EXISTS "${idx.name}"`);
      }
    }
    await knex.raw(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_employees_code_active" ON "employees" ("code") WHERE "status" != 'archived'`
    );
  } else {
    if (!(await hasIndex(knex, "idx_employees_code_active"))) {
      await knex.raw(
        `CREATE UNIQUE INDEX "idx_employees_code_active" ON "employees" ("code")`
      );
    }
  }

  await createIndexSafe(knex, "idx_employee_skills_eid_name",
    `CREATE UNIQUE INDEX "idx_employee_skills_eid_name" ON "employee_skills" ("employee_id", "skill_name")`);

  if (!IS_DM) {
    await createIndexSafe(knex, "idx_run_records_eid_started",
      `CREATE INDEX "idx_run_records_eid_started" ON "run_records" ("employee_id", "started_at" DESC)`);
  } else {
    await createIndexSafe(knex, "idx_run_records_eid_started",
      `CREATE INDEX "idx_run_records_eid_started" ON "run_records" ("employee_id")`);
  }

  await createIndexSafe(knex, "idx_run_events_rid_seq",
    `CREATE INDEX "idx_run_events_rid_seq" ON "run_events" ("run_id", "seq" ASC)`);
  await createIndexSafe(knex, "idx_schedule_jobs_eid",
    `CREATE INDEX "idx_schedule_jobs_eid" ON "employee_schedule_jobs" ("employee_id")`);
}

export async function down(knex: Knex): Promise<void> {
  const indexes = [
    "idx_schedule_jobs_eid",
    "idx_run_events_rid_seq",
    "idx_run_records_eid_started",
    "idx_employee_skills_eid_name",
    "idx_employees_code_active",
  ];
  for (const name of indexes) {
    await dropIndexSafe(knex, name);
  }
}
