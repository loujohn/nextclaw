import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // 1. Partial unique index on employees.code (only for non-archived)
  //    Drop old global unique index if it exists
  const employeeIndexes = await knex.raw(
    "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='employees' AND name LIKE '%code%'"
  );
  for (const idx of employeeIndexes) {
    await knex.raw(`DROP INDEX IF EXISTS "${idx.name}"`);
  }
  await knex.raw(
    `CREATE UNIQUE INDEX IF NOT EXISTS "idx_employees_code_active" ON "employees" ("code") WHERE "status" != 'archived'`
  );

  // 2. Composite unique index on employee_skills(employee_id, skill_name)
  await knex.raw(
    `CREATE UNIQUE INDEX IF NOT EXISTS "idx_employee_skills_eid_name" ON "employee_skills" ("employee_id", "skill_name")`
  );

  // 3. Query indexes
  await knex.raw(
    `CREATE INDEX IF NOT EXISTS "idx_run_records_eid_started" ON "run_records" ("employee_id", "started_at" DESC)`
  );
  await knex.raw(
    `CREATE INDEX IF NOT EXISTS "idx_run_events_rid_seq" ON "run_events" ("run_id", "seq" ASC)`
  );
  await knex.raw(
    `CREATE INDEX IF NOT EXISTS "idx_schedule_jobs_eid" ON "employee_schedule_jobs" ("employee_id")`
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS "idx_schedule_jobs_eid"`);
  await knex.raw(`DROP INDEX IF EXISTS "idx_run_events_rid_seq"`);
  await knex.raw(`DROP INDEX IF EXISTS "idx_run_records_eid_started"`);
  await knex.raw(`DROP INDEX IF EXISTS "idx_employee_skills_eid_name"`);
  await knex.raw(`DROP INDEX IF EXISTS "idx_employees_code_active"`);
}
