import type { Knex } from "knex";

/**
 * Migrates legacy single-schedule records (employee_schedules) into the
 * multi-job model (employee_schedule_jobs). Existing employee_schedule_jobs
 * rows are skipped to avoid duplicates on re-run.
 */
export async function up(knex: Knex): Promise<void> {
  const hasLegacyTable = await knex.schema.hasTable("employee_schedules");
  if (!hasLegacyTable) return;

  const legacyRows = await knex("employee_schedules").select("*");
  if (legacyRows.length === 0) return;

  for (const row of legacyRows) {
    const existingJob = await knex("employee_schedule_jobs")
      .where({ employee_id: row.employee_id })
      .first();
    if (existingJob) continue;

    const now = new Date().toISOString();
    await knex("employee_schedule_jobs").insert({
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function down(_knex: Knex): Promise<void> {
  // Intentionally non-reversible: copied data from employee_schedules to employee_schedule_jobs.
  // Rolling back would delete migrated job records, losing any subsequent edits made via the new UI.
  // If rollback is ever needed, restore from backup instead.
}
