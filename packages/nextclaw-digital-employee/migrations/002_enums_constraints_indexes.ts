import type { Knex } from "knex";
import { hasIndex, createIndexIfNotExists } from "../server/db/knex";

async function dropIndexSafe(knex: Knex, name: string): Promise<void> {
  if (await hasIndex(knex, name)) {
    await knex.raw(`DROP INDEX "${name}"`);
  }
}

export async function up(knex: Knex): Promise<void> {
  await createIndexIfNotExists(knex, "idx_employees_code_active",
    `CREATE UNIQUE INDEX "idx_employees_code_active" ON "employees" ("code")`);

  await createIndexIfNotExists(knex, "idx_employee_skills_eid_name",
    `CREATE UNIQUE INDEX "idx_employee_skills_eid_name" ON "employee_skills" ("employee_id", "skill_name")`);

  await createIndexIfNotExists(knex, "idx_run_records_eid_started",
    `CREATE INDEX "idx_run_records_eid_started" ON "run_records" ("employee_id")`);

  await createIndexIfNotExists(knex, "idx_run_events_rid_seq",
    `CREATE INDEX "idx_run_events_rid_seq" ON "run_events" ("run_id", "seq" ASC)`);

  await createIndexIfNotExists(knex, "idx_schedule_jobs_eid",
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
