import type { Knex } from "knex";
import { createRequire } from "node:module";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const _require = createRequire(import.meta.url);

const __dirname = dirname(fileURLToPath(import.meta.url));

const migrations: Knex.MigratorConfig = {
  directory: resolve(__dirname, "migrations"),
  extension: "ts"
};

function buildDmConfig(): Knex.Config {
  const host = process.env.DB_HOST ?? "localhost";
  const port = process.env.DB_PORT ?? "5236";
  const schema = process.env.DB_SCHEMA ?? "DIGITAL_EMPLOYEE";
  const knexDm = _require("knex-dm");
  return {
    client: knexDm,
    connection: {
      connectString: `${host}:${port}`,
      user: process.env.DB_USER ?? "SYSDBA",
      password: process.env.DB_PASSWORD ?? "SYSDBA",
    },
    pool: {
      min: 2,
      max: 10,
      afterCreate(conn: { execute: (sql: string, params: unknown[], cb: (err: unknown) => void) => void }, cb: (err: unknown, conn: unknown) => void) {
        conn.execute(`SET SCHEMA "${schema}"`, [], (err: unknown) => {
          cb(err, conn);
        });
      },
    },
    fetchAsString: ["DATE"],
    migrations,
  };
}

function buildSqliteConfig(): Knex.Config {
  return {
    client: "better-sqlite3",
    connection: {
      filename: resolve(
        process.env.NEXTCLAW_DIGITAL_EMPLOYEE_HOME ?? join(process.cwd(), ".nextclaw-digital-employee"),
        "platform.sqlite"
      )
    },
    useNullAsDefault: true,
    migrations,
  };
}

const dbClient = (process.env.DB_CLIENT ?? "sqlite").toLowerCase();

const config: Record<string, Knex.Config> = {
  development: dbClient === "dm" ? buildDmConfig() : buildSqliteConfig(),
};

export default config;
