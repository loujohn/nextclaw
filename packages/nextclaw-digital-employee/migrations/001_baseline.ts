import type { Knex } from "knex";

/**
 * Baseline migration: captures the full schema as of pre-v0.15.
 * Uses createTableIfNotExists to safely apply on existing databases.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("departments"))) {
    await knex.schema.createTable("departments", (t) => {
      t.string("id").primary();
      t.string("name").notNullable();
      t.text("description").notNullable().defaultTo("");
      t.string("external_id").nullable();
      t.string("parent_id").nullable().references("id").inTable("departments").onDelete("SET NULL");
      t.integer("sort_order").notNullable().defaultTo(0);
      t.timestamp("created_at").notNullable();
      t.timestamp("updated_at").notNullable();
    });
  }

  if (!(await knex.schema.hasTable("employees"))) {
    await knex.schema.createTable("employees", (t) => {
      t.string("id").primary();
      t.string("name").notNullable();
      t.string("code").notNullable().unique();
      t.text("description").notNullable().defaultTo("");
      t.text("system_prompt").notNullable().defaultTo("");
      t.string("model").defaultTo("");
      t.string("status").notNullable().defaultTo("active");
      t.string("department_id").nullable();
      t.timestamp("created_at").notNullable();
      t.timestamp("updated_at").notNullable();
    });
  }

  if (!(await knex.schema.hasTable("human_employees"))) {
    await knex.schema.createTable("human_employees", (t) => {
      t.string("id").primary();
      t.string("external_id").notNullable().unique();
      t.string("name").notNullable();
      t.text("avatar").notNullable().defaultTo("");
      t.string("title").notNullable().defaultTo("");
      t.string("job_number").notNullable().defaultTo("");
      t.boolean("active").notNullable().defaultTo(true);
      t.boolean("is_admin").notNullable().defaultTo(false);
      t.boolean("is_boss").notNullable().defaultTo(false);
      t.string("department_id").nullable().references("id").inTable("departments").onDelete("SET NULL");
      t.text("external_dept_ids").notNullable().defaultTo("[]");
      t.string("unionid").notNullable().defaultTo("");
      t.timestamp("created_at").notNullable();
      t.timestamp("updated_at").notNullable();
    });
  }

  if (!(await knex.schema.hasTable("employee_skills"))) {
    await knex.schema.createTable("employee_skills", (t) => {
      t.string("id").primary();
      t.string("employee_id").notNullable().references("id").inTable("employees").onDelete("CASCADE");
      t.string("skill_name").notNullable();
      t.boolean("enabled").notNullable().defaultTo(true);
      t.text("config_json").notNullable().defaultTo("{}");
      t.timestamp("created_at").notNullable();
      t.timestamp("updated_at").notNullable();
    });
  }

  if (!(await knex.schema.hasTable("employee_schedules"))) {
    await knex.schema.createTable("employee_schedules", (t) => {
      t.string("id").primary();
      t.string("employee_id").notNullable().references("id").inTable("employees").onDelete("CASCADE");
      t.string("schedule_kind").notNullable().defaultTo("manual");
      t.string("cron_expr");
      t.bigInteger("every_ms");
      t.boolean("heartbeat_enabled").notNullable().defaultTo(false);
      t.integer("heartbeat_interval_s");
      t.boolean("enabled").notNullable().defaultTo(true);
      t.string("runtime_job_id");
      t.text("schedule_message").notNullable().defaultTo("");
      t.timestamp("next_run_at");
      t.timestamp("created_at").notNullable();
      t.timestamp("updated_at").notNullable();
    });
  }

  if (!(await knex.schema.hasTable("employee_schedule_jobs"))) {
    await knex.schema.createTable("employee_schedule_jobs", (t) => {
      t.string("id").primary();
      t.string("employee_id").notNullable().references("id").inTable("employees").onDelete("CASCADE");
      t.string("name").notNullable().defaultTo("");
      t.text("description").notNullable().defaultTo("");
      t.string("schedule_kind").notNullable().defaultTo("cron");
      t.string("cron_expr").nullable();
      t.bigInteger("every_ms").nullable();
      t.integer("heartbeat_interval_s").nullable();
      t.text("task_prompt").notNullable().defaultTo("");
      t.boolean("enabled").notNullable().defaultTo(true);
      t.string("runtime_job_id").nullable();
      t.timestamp("next_run_at").nullable();
      t.timestamp("created_at").notNullable();
      t.timestamp("updated_at").notNullable();
    });
  }

  if (!(await knex.schema.hasTable("skill_installations"))) {
    await knex.schema.createTable("skill_installations", (t) => {
      t.string("id").primary();
      t.string("skill_name").notNullable().unique();
      t.string("source_type").notNullable();
      t.text("source_uri").notNullable();
      t.string("version");
      t.text("install_path").notNullable();
      t.boolean("enabled").notNullable().defaultTo(true);
      t.text("metadata_json").notNullable().defaultTo("{}");
      t.timestamp("created_at").notNullable();
      t.timestamp("updated_at").notNullable();
    });
  }

  if (!(await knex.schema.hasTable("integration_connections"))) {
    await knex.schema.createTable("integration_connections", (t) => {
      t.string("id").primary();
      t.string("type").notNullable();
      t.string("name").notNullable();
      t.text("config_json").notNullable().defaultTo("{}");
      t.boolean("enabled").notNullable().defaultTo(true);
      t.timestamp("created_at").notNullable();
      t.timestamp("updated_at").notNullable();
    });
  }

  if (!(await knex.schema.hasTable("run_records"))) {
    await knex.schema.createTable("run_records", (t) => {
      t.string("id").primary();
      t.string("employee_id").references("id").inTable("employees").onDelete("SET NULL");
      t.string("trigger_type").notNullable();
      t.string("trigger_source").notNullable();
      t.string("status").notNullable();
      t.timestamp("started_at").notNullable();
      t.timestamp("finished_at");
      t.text("summary").notNullable().defaultTo("");
      t.text("result_json").notNullable().defaultTo("{}");
    });
  }

  if (!(await knex.schema.hasTable("run_events"))) {
    await knex.schema.createTable("run_events", (t) => {
      t.string("id").primary();
      t.string("run_id").notNullable().references("id").inTable("run_records").onDelete("CASCADE");
      t.integer("seq").notNullable();
      t.string("event_type").notNullable();
      t.text("payload_json").notNullable().defaultTo("{}");
      t.timestamp("created_at").notNullable();
    });
  }

  if (!(await knex.schema.hasTable("org_sync_config"))) {
    await knex.schema.createTable("org_sync_config", (t) => {
      t.string("id").primary();
      t.string("app_key").notNullable().defaultTo("");
      t.string("app_secret").notNullable().defaultTo("");
      t.string("cron_expr").notNullable().defaultTo("0 1 * * *");
      t.boolean("enabled").notNullable().defaultTo(false);
      t.timestamp("last_run_at").nullable();
      t.string("last_run_status").nullable();
      t.text("last_run_summary").notNullable().defaultTo("");
      t.timestamp("updated_at").notNullable();
    });
  }

  if (!(await knex.schema.hasTable("secrets"))) {
    await knex.schema.createTable("secrets", (t) => {
      t.string("id").primary();
      t.string("key").notNullable().unique();
      t.text("value").notNullable();
      t.string("scope").notNullable().defaultTo("global");
      t.text("description").defaultTo("");
      t.timestamp("created_at").notNullable();
      t.timestamp("updated_at").notNullable();
    });
  }

  // Inline migrations for existing DBs (same as knex.ts migrateXxx functions)
  if (!(await knex.schema.hasColumn("departments", "external_id"))) {
    await knex.schema.alterTable("departments", (t) => {
      t.string("external_id").nullable();
    });
  }
  if (!(await knex.schema.hasColumn("employees", "model"))) {
    await knex.schema.alterTable("employees", (t) => {
      t.string("model").defaultTo("");
    });
  }
  if (!(await knex.schema.hasColumn("employees", "department_id"))) {
    await knex.schema.alterTable("employees", (t) => {
      t.string("department_id").nullable().defaultTo(null);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const tables = [
    "secrets", "org_sync_config", "run_events", "run_records",
    "integration_connections", "skill_installations",
    "employee_schedule_jobs", "employee_schedules", "employee_skills",
    "human_employees", "employees", "departments"
  ];
  for (const table of tables) {
    await knex.schema.dropTableIfExists(table);
  }
}
