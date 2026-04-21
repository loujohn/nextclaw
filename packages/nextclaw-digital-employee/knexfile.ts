import type { Knex } from "knex";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config as dotenvConfig } from "dotenv";

const _require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

dotenvConfig({ path: resolve(__dirname, ".env") });
dotenvConfig({ path: resolve(__dirname, ".env.local"), override: true });

const migrations: Knex.MigratorConfig & { getNewMigrationName?: (name: string) => string } = {
  directory: resolve(__dirname, "migrations"),
  extension: "ts",
  getNewMigrationName(name: string) {
    const now = new Date();
    const pad = (n: number, len = 2) => String(n).padStart(len, "0");
    const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    return `${ts}_${name}.ts`;
  },
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

const config: Record<string, Knex.Config> = {
  development: buildDmConfig(),
};

export default config;
