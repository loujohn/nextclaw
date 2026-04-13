import type { Knex } from "knex";
import { createLogger } from "../server/utils/logger";

const logger = createLogger("migration:007-seed");

function nowTimestamp(): string {
  const d = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("users"))) return;

  const count = await knex("users").count("* as cnt").first();
  if (count && Number(count.cnt) > 0) return;

  const { hashSync } = await import("bcryptjs");
  const { randomUUID } = await import("node:crypto");

  const defaultPassword = process.env.ADMIN_DEFAULT_PASSWORD ?? "changeme123";
  const now = nowTimestamp();
  await knex("users").insert({
    id: randomUUID(),
    keycloak_sub: "",
    username: "admin",
    email: "admin@local",
    display_name: "系统管理员",
    avatar_url: "",
    role: "admin",
    is_active: 1,
    department_id: null,
    human_employee_id: null,
    preferences: "{}",
    auth_provider: "local",
    password_hash: hashSync(defaultPassword, 10),
    last_login_at: null,
    created_at: now,
    updated_at: now,
  });
  logger.info("Default admin created: admin / changeme123 (or ADMIN_DEFAULT_PASSWORD)");
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function down(_knex: Knex): Promise<void> {
  // Seed — not reversible
}
