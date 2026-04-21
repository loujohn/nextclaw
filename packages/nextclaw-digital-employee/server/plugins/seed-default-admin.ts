import { getPlatformContext } from "../runtime/platform-context";
import { dbNow } from "../db/knex";
import { createLogger } from "../utils/logger";

const log = createLogger("SeedDefaultAdmin");

/**
 * Ensures a default admin user exists on startup.
 * Idempotent: skips if any user already exists in the table.
 */
export default defineNitroPlugin(async () => {
  const ctx = await getPlatformContext();
  const db = ctx.db;

  if (!(await db.schema.hasTable("users"))) return;

  const count = await db("users").count("* as cnt").first();
  if (count && Number(count.cnt) > 0) return;

  const { hashSync } = await import("bcryptjs");
  const { randomUUID } = await import("node:crypto");

  const defaultPassword = process.env.ADMIN_DEFAULT_PASSWORD ?? "changeme123";
  const now = dbNow();
  await db("users").insert({
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
  log.info("Default admin created: admin / changeme123 (or ADMIN_DEFAULT_PASSWORD)");
});
